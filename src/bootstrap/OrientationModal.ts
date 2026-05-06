const MODAL_ID = 'orientation-modal';
const HIDDEN_CLASS = 'orientation-modal--hidden';

/** Persisted: never auto-show the landscape modal (any device, e.g. QA on a phone). */
export const DESKTOP_UI_STORAGE_KEY = 'gt_force_desktop_behavior';

/** Persisted: on a tablet, use phone-style orientation modal in landscape (opt-in). */
export const PHONE_UI_ON_TABLET_STORAGE_KEY = 'gt_force_phone_ui';

/** `true` when the user forced global desktop-style rules (no auto modal). */
export function isDesktopUiPreferred(): boolean {
	try {
		const v = localStorage.getItem(DESKTOP_UI_STORAGE_KEY);
		return v === '1' || v === 'true';
	} catch {
		return false;
	}
}

/** Turn desktop UI preference on/off and re-run orientation modal logic (no full reload needed). */
export function setDesktopUiPreferred(on: boolean): void {
	try {
		if (on) {
			localStorage.setItem(DESKTOP_UI_STORAGE_KEY, '1');
		} else {
			localStorage.removeItem(DESKTOP_UI_STORAGE_KEY);
		}
	} catch {
		/* private mode / quota */
	}
	syncAutoOrientationModal();
}

/** Tablet user wants the same landscape orientation modal as on phones. */
export function isPhoneUiOnTabletForced(): boolean {
	try {
		const v = localStorage.getItem(PHONE_UI_ON_TABLET_STORAGE_KEY);
		return v === '1' || v === 'true';
	} catch {
		return false;
	}
}

export function setPhoneUiOnTabletForced(on: boolean): void {
	try {
		if (on) {
			localStorage.setItem(PHONE_UI_ON_TABLET_STORAGE_KEY, '1');
		} else {
			localStorage.removeItem(PHONE_UI_ON_TABLET_STORAGE_KEY);
		}
	} catch {
		/* no-op */
	}
	syncAutoOrientationModal();
}

/**
 * Heuristic “tablet” (large slate / iPad): these mimic desktop — no auto landscape modal
 * unless {@link isPhoneUiOnTabletForced} is true.
 */
function isLikelyTablet(): boolean {
	try {
		const ua = navigator.userAgent || '';
		const minSide = Math.min(window.innerWidth, window.innerHeight, window.screen?.width ?? 0, window.screen?.height ?? 0);
		if (/ipad/i.test(ua)) {
			return true;
		}
		if ((navigator.maxTouchPoints ?? 0) > 2 && /macintosh/i.test(ua)) {
			return true;
		}
		if (/playbook|silk/i.test(ua)) {
			return true;
		}
		if (/android/i.test(ua)) {
			if (!/mobile/i.test(ua)) {
				return true;
			}
			if (minSide >= 720) {
				return true;
			}
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Handheld (not a normal desktop browser) — phones, some large touch devices, etc.
 */
function isHandheldFormFactor(): boolean {
	try {
		const ua = navigator.userAgent || '';
		if (/android|iphone|ipad|ipod|iemobile|blackberry|mobile|silk|playbook/i.test(ua)) {
			return true;
		}
		if ((navigator.maxTouchPoints ?? 0) > 2 && /macintosh/i.test(ua)) {
			return true;
		}
		if (window.matchMedia?.('(pointer: coarse)')?.matches === true) {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Auto landscape modal: phones only. Tablets mimic desktop (no modal) unless
 * {@link isPhoneUiOnTabletForced} or {@link isDesktopUiPreferred} changes that.
 */
function isLandscapeTouchTarget(): boolean {
	try {
		if (isDesktopUiPreferred()) {
			return false;
		}
		const landscape = window.matchMedia?.('(orientation: landscape)')?.matches === true;
		if (!landscape || !isHandheldFormFactor()) {
			return false;
		}
		if (isLikelyTablet() && !isPhoneUiOnTabletForced()) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

function getModal(): HTMLElement | null {
	return document.getElementById(MODAL_ID);
}

function getRoot(): HTMLElement | null {
	return document.getElementById('root');
}

let keyboardBlocker: ((e: Event) => void) | null = null;
let pointerModalBlocker: ((e: Event) => void) | null = null;
let keyboardGuardsActive = false;

/** Capture phase + non-passive so preventDefault works on touch (blocks game under modal). */
const POINTER_MODAL_OPTS: AddEventListenerOptions = { capture: true, passive: false };

function blurGameFocus(): void {
	try {
		const ae = document.activeElement;
		if (ae instanceof HTMLElement) {
			ae.blur();
		}
	} catch {
		/* no-op */
	}
	try {
		const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
		canvas?.blur();
	} catch {
		/* no-op */
	}
}

function enableKeyboardGuards(): void {
	if (keyboardGuardsActive) {
		return;
	}
	keyboardGuardsActive = true;

	const block = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
	};
	keyboardBlocker = block;
	window.addEventListener('keydown', block, true);
	window.addEventListener('keyup', block, true);
	window.addEventListener('keypress', block, true);

	const pointerBlock = (e: Event) => {
		const m = getModal();
		if (!m || m.classList.contains(HIDDEN_CLASS)) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};
	pointerModalBlocker = pointerBlock;
	window.addEventListener('pointerdown', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('pointermove', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('pointerup', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('pointercancel', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('touchstart', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('touchmove', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('touchend', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('touchcancel', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('mousedown', pointerBlock, POINTER_MODAL_OPTS);
	window.addEventListener('click', pointerBlock, POINTER_MODAL_OPTS);

	const root = getRoot();
	if (root && 'inert' in root) {
		try {
			(root as HTMLElement & { inert: boolean }).inert = true;
		} catch {
			/* no-op */
		}
	}

	blurGameFocus();
}

function disableKeyboardGuards(): void {
	if (!keyboardGuardsActive) {
		return;
	}
	keyboardGuardsActive = false;

	if (keyboardBlocker) {
		window.removeEventListener('keydown', keyboardBlocker, true);
		window.removeEventListener('keyup', keyboardBlocker, true);
		window.removeEventListener('keypress', keyboardBlocker, true);
		keyboardBlocker = null;
	}

	if (pointerModalBlocker) {
		window.removeEventListener('pointerdown', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('pointermove', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('pointerup', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('pointercancel', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('touchstart', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('touchmove', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('touchend', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('touchcancel', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('mousedown', pointerModalBlocker, POINTER_MODAL_OPTS);
		window.removeEventListener('click', pointerModalBlocker, POINTER_MODAL_OPTS);
		pointerModalBlocker = null;
	}

	const root = getRoot();
	if (root && 'inert' in root) {
		try {
			(root as HTMLElement & { inert: boolean }).inert = false;
		} catch {
			/* no-op */
		}
	}
}

function setModalVisible(visible: boolean): void {
	const el = getModal();
	if (!el) {
		return;
	}
	const hidden = el.classList.contains(HIDDEN_CLASS);
	if (visible && !hidden) {
		return;
	}
	if (!visible && hidden) {
		return;
	}
	if (visible) {
		el.classList.remove(HIDDEN_CLASS);
		el.setAttribute('aria-hidden', 'false');
		enableKeyboardGuards();
	} else {
		el.classList.add(HIDDEN_CLASS);
		el.setAttribute('aria-hidden', 'true');
		disableKeyboardGuards();
	}
}

/**
 * Show the full-screen orientation hint (`#orientation-modal` in index.html).
 * Devtools: `showOrientationModal()`
 */
export function showOrientationModal(): void {
	setModalVisible(true);
}

/** Hide the orientation modal. */
export function hideOrientationModal(): void {
	setModalVisible(false);
}

function syncAutoOrientationModal(): void {
	if (isLandscapeTouchTarget()) {
		setModalVisible(true);
	} else {
		setModalVisible(false);
	}
}

function onOrientationPrefsStorageChanged(ev: StorageEvent): void {
	if (ev.key === DESKTOP_UI_STORAGE_KEY || ev.key === PHONE_UI_ON_TABLET_STORAGE_KEY) {
		syncAutoOrientationModal();
	}
}

function installAutoOrientationListeners(): void {
	const run = () => {
		requestAnimationFrame(() => syncAutoOrientationModal());
	};
	try {
		window.matchMedia('(orientation: landscape)').addEventListener('change', run);
	} catch {
		/* no-op */
	}
	window.addEventListener('resize', run);
	window.addEventListener('orientationchange', run as any);
	const vv = (window as any).visualViewport as VisualViewport | undefined;
	vv?.addEventListener?.('resize', run);
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run);
	} else {
		run();
	}
}

declare global {
	interface Window {
		showOrientationModal?: () => void;
		hideOrientationModal?: () => void;
		/** Grave Threat: no auto landscape modal on any device (including phones). */
		gtSetDesktopUi?: (useDesktop: boolean) => void;
		/** Grave Threat: tablet — opt into phone-style auto landscape modal. */
		gtSetPhoneUi?: (usePhoneUiOnTablet: boolean) => void;
	}
}

window.showOrientationModal = showOrientationModal;
window.hideOrientationModal = hideOrientationModal;
window.gtSetDesktopUi = setDesktopUiPreferred;
window.gtSetPhoneUi = setPhoneUiOnTabletForced;

window.addEventListener('storage', onOrientationPrefsStorageChanged);

installAutoOrientationListeners();
