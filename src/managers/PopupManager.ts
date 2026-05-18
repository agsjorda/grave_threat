/**
 * Popup types that participate in priority ordering.
 * Higher priority = more important; a higher-priority popup can replace a lower-priority one.
 * When two popups are requested, only the higher-priority one is shown.
 *
 * Current priorities (higher number = higher priority):
 * - TOKEN_EXPIRED (100): session timeout / token invalid
 * - OUT_OF_BALANCE (50): insufficient balance
 * - BET_FAILED (40): backend rejected bet (refund expected)
 * - NETWORK_OFFLINE (40): no response from backend; client appears offline
 */

import { gameEventManager, GameEventType } from '../event/EventManager';
import { NetworkOfflinePopup } from '../game/components/NetworkOfflinePopup';
import { BetFailedPopup } from '../game/components/BetFailedPopup';
import { ReplayPopup } from '../game/components/ReplayPopup';

export enum PopupType {
	/** Session expired / token invalid; user must re-authenticate. */
	TOKEN_EXPIRED = 'TOKEN_EXPIRED',
	/** Insufficient balance for bet or action. */
	OUT_OF_BALANCE = 'OUT_OF_BALANCE',
	/** Bet failed (backend rejected bet; refund expected). */
	BET_FAILED = 'BET_FAILED',
	/** Network offline / fetch failed before any HTTP response. */
	NETWORK_OFFLINE = 'NETWORK_OFFLINE',
	/** Replay prompt popup (force-shown, bypasses normal priority). */
	REPLAY = 'REPLAY',
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
	[PopupType.BET_FAILED]: 40,
	[PopupType.NETWORK_OFFLINE]: 40,
	[PopupType.REPLAY]: 60,
};

/**
 * True when a bet/spin failed with no usable HTTP response (client offline or fetch failed before response).
 * Heuristic: checks navigator.onLine first (when available) then matches common fetch/network error substrings.
 */
export function isNetworkOfflineBetError(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return true;
	}

	const message =
		typeof error === 'string'
			? error
			: typeof (error as any)?.message === 'string'
				? (error as any).message
				: '';
	const m = message.toLowerCase();
	if (!m) return false;

	return (
		m.includes('failed to fetch') ||
		m.includes('networkerror when attempting to fetch') ||
		m.includes('networkerror') ||
		m.includes('load failed') ||
		m.includes('network request failed')
	);
}

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
	DJ401TE: { popupType: PopupType.TOKEN_EXPIRED },
	DJ400NEB: { popupType: PopupType.OUT_OF_BALANCE },
	DJ400BF: { popupType: PopupType.BET_FAILED },
};

async function loadPopupFactory(errorCode: string): Promise<PopupFactory | null> {
	switch (errorCode) {
		case 'DJ401UA':
		case 'DJ401TE': {
			const module = await import('../game/components/TokenExpiredPopup');
			const Popup = module.TokenExpiredPopup;
			return (scene) => new Popup(scene as any) as any;
		}
		case 'DJ400NEB': {
			const module = await import('../game/components/OutOfBalancePopup');
			const Popup = module.OutOfBalancePopup;
			return (scene) => new Popup(scene as any) as any;
		}
		case 'DJ400BF': {
			return (scene) => {
				const popup = new BetFailedPopup(scene as any, 0, 0, {
					onHideCallback: () => {
						clearCurrentPopup();
					},
				}) as unknown as PopupInstance;
				const originalShow = popup.show.bind(popup);
				popup.show = () => {
					originalShow();
					gameEventManager.emit(GameEventType.BET_FAILED_ERROR);
				};
				return popup;
			};
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

/**
 * Show either NetworkOfflinePopup (offline / pre-response fetch failure) or BetFailedPopup
 * (generic throw) from a thrown error path (e.g. SlotController spin catch, BuyFeature catch).
 *
 * Uses the same PopupType priority system and emits BET_FAILED_ERROR on show so autoplay
 * stops consistently for both cases.
 *
 * Static instantiation (not dynamic import): dynamic import() issues a network fetch even in
 * production builds, which fails when the user is offline — the exact case this popup is meant
 * to surface. Static imports bundle the popup with this module so it's always available.
 */
export function showBetFailurePopupFromError(error: unknown): void {
	const scene = getGameScene();
	if (!scene) return;

	const type = isNetworkOfflineBetError(error) ? PopupType.NETWORK_OFFLINE : PopupType.BET_FAILED;
	showPopup(type, (registerHide) => {
		const popup = (type === PopupType.NETWORK_OFFLINE
			? new NetworkOfflinePopup(scene as any, 0, 0, {
					onHideCallback: () => {
						clearCurrentPopup();
					},
				})
			: new BetFailedPopup(scene as any, 0, 0, {
					onHideCallback: () => {
						clearCurrentPopup();
					},
				})) as unknown as PopupInstance;

		const originalShow = popup.show?.bind(popup);
		if (typeof originalShow === 'function') {
			popup.show = () => {
				originalShow();
				gameEventManager.emit(GameEventType.BET_FAILED_ERROR);
			};
		}

		popup.show();
		registerHide((cb) =>
			popup.hide(() => {
				clearCurrentPopup();
				if (cb) cb();
			})
		);
	});
}

/**
 * Force show replay popup immediately, bypassing normal popup priority checks.
 * Any currently shown popup is closed first.
 */
export function forceShowReplayPopup(
	replayId: string | number,
	options: {
		displayMode?: 'initial' | 'summary';
		spinData?: any;
		currencyCode?: string;
		createdAt?: string;
		buttonText?: string;
		onContinueCallback?: () => void;
		onCompleteCallback?: () => void;
	} = {}
): void {
	const scene = getGameScene();
	if (!scene) return;

	// Prevent stale pending popups from registering later.
	pending = null;

	const showReplay = (): void => {
		const replayPopup = new ReplayPopup(scene as any, replayId, 0, 0, {
			displayMode: options.displayMode,
			spinData: options.spinData,
			currencyCode: options.currencyCode,
			createdAt: options.createdAt,
			buttonText: options.buttonText,
			onContinueCallback: options.onContinueCallback,
			onHideCallback: () => {
				clearCurrentPopup();
				options.onCompleteCallback?.();
			},
		});
		replayPopup.show();
		current = {
			type: PopupType.REPLAY,
			priority: Number.MAX_SAFE_INTEGER,
			hide: (cb?: () => void) => {
				replayPopup.hide(cb);
			},
		};
	};

	if (current) {
		const prevHide = current.hide;
		current = null;
		prevHide(showReplay);
		return;
	}

	showReplay();
}

