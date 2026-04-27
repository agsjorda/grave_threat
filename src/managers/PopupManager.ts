/**
 * Popup types that participate in priority ordering.
 * Higher priority = more important; a higher-priority popup can replace a lower-priority one.
 * When two popups are requested, only the higher-priority one is shown.
 *
 * Current priorities (higher number = higher priority):
 * - TOKEN_EXPIRED (100): session timeout / token invalid
 * - OUT_OF_BALANCE (50): insufficient balance
 */
// Note: this manager is UI-only; it does not emit game events.

export enum PopupType {
	/** Session expired / token invalid; user must re-authenticate. */
	TOKEN_EXPIRED = 'TOKEN_EXPIRED',
	/** Insufficient balance for bet or action. */
	OUT_OF_BALANCE = 'OUT_OF_BALANCE',
}

/** Hide function for a visible popup; optional callback when hide animation completes. */
export type PopupHideFn = (callback?: () => void) => void;

/** Call this to register the hide function after your popup is shown. */
export type RegisterHideFn = (hideFn: PopupHideFn) => void;

/** Action that shows a popup and registers its hide function with the manager. */
export type PopupShowAction = (registerHide: RegisterHideFn) => void;

const PRIORITY: Record<PopupType, number> = {
	[PopupType.TOKEN_EXPIRED]: 100,
	[PopupType.OUT_OF_BALANCE]: 50,
};

interface CurrentPopup {
	type: PopupType;
	priority: number;
	hide: PopupHideFn;
}

let current: CurrentPopup | null = null;
let pending: { type: PopupType; priority: number; token: number } | null = null;
let tokenCounter = 0;

export function showPopup(type: PopupType, showAction: PopupShowAction): void {
	const priority = PRIORITY[type];

	// Same type already visible or already pending: do not show again.
	if ((current && current.type === type) || (pending && pending.type === type)) {
		return;
	}

	// A higher- or equal-priority popup is already visible (or pending): do not replace.
	if ((current && current.priority >= priority) || (pending && pending.priority >= priority)) {
		return;
	}

	const doShow = (): void => {
		const token = ++tokenCounter;
		pending = { type, priority, token };
		showAction((hideFn: PopupHideFn) => {
			// If another popup request superseded this one while it was loading, immediately hide it.
			if (!pending || pending.token !== token) {
				try {
					hideFn();
				} catch {}
				return;
			}
			pending = null;
			current = { type, priority, hide: hideFn };
		});
	};

	// A lower-priority popup is visible: close it first, then show the new one.
	if (current) {
		const prevHide = current.hide;
		current = null;
		prevHide(doShow);
		return;
	}

	// A lower-priority popup is pending (async loading): supersede it.
	if (pending) {
		pending = null;
	}

	doShow();
}

export function clearCurrentPopup(): void {
	current = null;
}

type BackendErrorResponse = {
	status?: number;
	errorCode?: string;
	message?: string;
	message_text?: string;
};

type PopupInstance = {
	show: () => void;
	hide: (callback?: () => void) => void;
	updateMessage?: (message: string) => void;
};

type PopupFactory = (scene: any) => PopupInstance;

const ERROR_CODE_TO_POPUP: Record<string, { popupType: PopupType }> = {
	DJ401UA: { popupType: PopupType.TOKEN_EXPIRED },
	DJ400NEB: { popupType: PopupType.OUT_OF_BALANCE },
};

async function loadPopupFactory(errorCode: string): Promise<PopupFactory | null> {
	switch (errorCode) {
		case 'DJ401UA': {
			const module = await import('../game/components/TokenExpiredPopup');
			const Popup = module.TokenExpiredPopup;
			return (scene) => new Popup(scene as any) as any;
		}
		case 'DJ400NEB': {
			const module = await import('../game/components/OutOfBalancePopup');
			const Popup = module.OutOfBalancePopup;
			return (scene) => new Popup(scene as any) as any;
		}
		default:
			return null;
	}
}

function getGameScene(): any | null {
	try {
		return (
			(window as any).phaserGame?.scene?.getScene?.('Game') ??
			(window as any).phaserGame?.scene?.scenes?.find?.((s: any) => s?.scene?.key === 'Game') ??
			null
		);
	} catch {
		return null;
	}
}

/**
 * One-stop-shop for API-driven popup handling.
 * Returns true if a popup was shown (or requested) based on errorCode.
 */
export function checkAndHandlePopup(response: BackendErrorResponse | null | undefined): boolean {
	const errorCode = typeof response?.errorCode === 'string' ? response.errorCode : '';
	if (!errorCode) return false;

	const messageText =
		typeof response?.message_text === 'string' && response.message_text.trim().length > 0
			? response.message_text.trim()
			: undefined;

	const scene = getGameScene();
	if (!scene) return false;

	const config = ERROR_CODE_TO_POPUP[errorCode];
	if (!config) return false;

	showPopup(config.popupType, (registerHide) => {
		loadPopupFactory(errorCode)
			.then((factory) => {
				if (!factory) return;
				const popup = factory(scene);
				if (messageText && popup.updateMessage) popup.updateMessage(messageText);
				popup.show();
				registerHide((cb) =>
					popup.hide(() => {
						clearCurrentPopup();
						if (cb) cb();
					})
				);
			})
			.catch(() => {});
	});
	return true;
}

