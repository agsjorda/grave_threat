type PhaserGameLike = {
    canvas?: HTMLCanvasElement | null;
    events?: {
        once?: (eventName: string, handler: () => void) => void;
    };
    scale?: {
        fullscreenTarget?: HTMLElement;
        isFullscreen?: boolean;
        refresh?: () => void;
        on?: (eventName: string, handler: (...args: any[]) => void) => void;
        off?: (eventName: string, handler: (...args: any[]) => void) => void;
    };
};

type RegisteredGame = {
    game: PhaserGameLike;
    parentId: string;
};

type ViewportState = {
    width: number;
    height: number;
    left: number;
    top: number;
    isLandscape: boolean;
    isPortrait: boolean;
    isMobileLike: boolean;
    shouldBlockOrientation: boolean;
};

type MobileViewportApi = {
    sync: () => void;
    getState: () => ViewportState;
    showOrientationGate: () => void;
    hideOrientationGate: () => void;
    useAutomaticOrientationGate: () => void;
    setDesktopUi: (enabled: boolean) => void;
    setPhoneUi: (enabled: boolean) => void;
};

declare global {
    interface Window {
        tbMobileViewport?: MobileViewportApi;
        syncMobileViewport?: () => void;
        showOrientationGate?: () => void;
        hideOrientationGate?: () => void;
        useAutomaticOrientationGate?: () => void;
        tbSetDesktopUi?: (enabled: boolean) => void;
        tbSetPhoneUi?: (enabled: boolean) => void;
        showOrientationModal?: () => void;
        hideOrientationModal?: () => void;
        syncOrientationModal?: () => void;
    }
}

const GATE_ID = 'mobile-orientation-gate';
const FORCE_DESKTOP_KEY = 'tb_force_desktop_behavior';
const FORCE_PHONE_KEY = 'tb_force_phone_ui';
const REFRESH_DELAYS = [0, 60, 160, 320, 640, 1000];
const INPUT_EVENTS = [
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'touchstart',
    'touchmove',
    'touchend',
    'touchcancel',
    'mousedown',
    'mousemove',
    'mouseup',
    'click',
    'dblclick',
    'contextmenu',
    'wheel',
    'keydown',
    'keyup',
];

const registeredGames = new Set<RegisteredGame>();
const refreshTimers = new Set<number>();

let latestState: ViewportState = {
    width: 1,
    height: 1,
    left: 0,
    top: 0,
    isLandscape: false,
    isPortrait: true,
    isMobileLike: false,
    shouldBlockOrientation: false,
};
let started = false;
let listenersInstalled = false;
let gateOpen = false;
let manualGate: boolean | null = null;

const safeStorageGet = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeStorageSet = (key: string, enabled: boolean): void => {
    try {
        if (enabled) {
            window.localStorage.setItem(key, '1');
        } else {
            window.localStorage.removeItem(key);
        }
    } catch {
        // Storage may be blocked in embedded/private contexts.
    }
};

const isStorageEnabled = (key: string): boolean => safeStorageGet(key) === '1';

const safeMatchMedia = (query: string): boolean => {
    try {
        return !!window.matchMedia?.(query).matches;
    } catch {
        return false;
    }
};

const detectMobileLike = (width: number, height: number): boolean => {
    if (isStorageEnabled(FORCE_DESKTOP_KEY)) return false;
    if (isStorageEnabled(FORCE_PHONE_KEY)) return true;

    const ua = navigator.userAgent || '';
    const mobileUa = /android|iphone|ipad|ipod|iemobile|blackberry|mobile/i.test(ua);
    const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const coarsePointer = safeMatchMedia('(pointer: coarse)');
    const noHover = safeMatchMedia('(hover: none)');
    const minSide = Math.min(width, height);
    const maxSide = Math.max(width, height);

    return mobileUa || iPadOS || (coarsePointer && noHover && minSide <= 1024 && maxSide <= 1400);
};

const getViewportState = (): ViewportState => {
    const vv = window.visualViewport;
    const width = Math.max(1, Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth || 1));
    const height = Math.max(1, Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 1));
    const left = Math.round(vv?.offsetLeft || 0);
    const top = Math.round(vv?.offsetTop || 0);
    const isLandscape = width > height + 8;
    const isPortrait = height >= width - 8;
    const isMobileLike = detectMobileLike(width, height);
    const autoBlock = isMobileLike && isLandscape;
    const shouldBlockOrientation = manualGate === null ? autoBlock : manualGate;

    return {
        width,
        height,
        left,
        top,
        isLandscape,
        isPortrait,
        isMobileLike,
        shouldBlockOrientation,
    };
};

const setCssVar = (name: string, value: string): void => {
    try {
        document.documentElement.style.setProperty(name, value);
    } catch {
        // no-op
    }
};

const applyBox = (el: HTMLElement | null | undefined, state: ViewportState): void => {
    if (!el) return;
    el.style.width = `${state.width}px`;
    el.style.height = `${state.height}px`;
    el.style.minHeight = `${state.height}px`;
    el.style.boxSizing = 'border-box';
};

const applyFixedViewportBox = (el: HTMLElement | null | undefined, state: ViewportState): void => {
    if (!el) return;
    el.style.top = `${state.top}px`;
    el.style.left = `${state.left}px`;
    el.style.width = `${state.width}px`;
    el.style.height = `${state.height}px`;
};

const applyTouchSafeStyles = (el: HTMLElement | null | undefined): void => {
    if (!el) return;
    el.style.touchAction = 'none';
    (el.style as any).msTouchAction = 'none';
    el.style.userSelect = 'none';
    (el.style as any).webkitUserSelect = 'none';
    (el.style as any).webkitTapHighlightColor = 'transparent';
    (el.style as any).overscrollBehavior = 'contain';
};

const applyViewportShell = (state: ViewportState): void => {
    setCssVar('--tb-viewport-width', `${state.width}px`);
    setCssVar('--tb-viewport-height', `${state.height}px`);
    setCssVar('--tb-viewport-left', `${state.left}px`);
    setCssVar('--tb-viewport-top', `${state.top}px`);

    document.documentElement.classList.add('tb-viewport-managed');
    document.documentElement.dataset.tbMobileUi = state.isMobileLike ? 'true' : 'false';
    document.documentElement.dataset.tbOrientation = state.isLandscape ? 'landscape' : 'portrait';

    const body = document.body;
    const root = document.getElementById('root') as HTMLElement | null;
    const app = document.getElementById('app') as HTMLElement | null;
    const container = document.getElementById('game-container') as HTMLElement | null;

    applyBox(body, state);
    applyBox(root, state);
    applyBox(app, state);
    applyBox(container, state);

    if (body) {
        body.style.overflow = 'hidden';
        body.style.position = body.style.position || 'relative';
    }
    if (root) {
        root.style.display = root.style.display || 'flex';
        root.style.alignItems = root.style.alignItems || 'center';
        root.style.justifyContent = root.style.justifyContent || 'center';
    }
    if (container) {
        container.style.aspectRatio = '';
        container.style.maxWidth = `${state.width}px`;
        container.style.maxHeight = `${state.height}px`;
        container.style.overflow = 'hidden';
    }

    applyFixedViewportBox(document.querySelector('.background-container') as HTMLElement | null, state);
    applyFixedViewportBox(document.getElementById('boot-loader') as HTMLElement | null, state);
    applyFixedViewportBox(document.getElementById(GATE_ID) as HTMLElement | null, state);
};

const ensureGate = (): HTMLElement | null => {
    if (!document.body) return null;

    let gate = document.getElementById(GATE_ID) as HTMLElement | null;
    if (gate) return gate;

    gate = document.createElement('div');
    gate.id = GATE_ID;
    gate.className = 'mobile-orientation-gate mobile-orientation-gate--hidden';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'mobile-orientation-gate-title');
    gate.setAttribute('aria-describedby', 'mobile-orientation-gate-description');
    gate.setAttribute('aria-hidden', 'true');
    gate.hidden = true;
    gate.innerHTML = [
        '<div class="mobile-orientation-gate__panel">',
        '<div class="mobile-orientation-gate__icon" aria-hidden="true">',
        '<div class="mobile-orientation-gate__circ-wrap">',
        '<div class="mobile-orientation-gate__circ-spin">',
        '<svg class="mobile-orientation-gate__circ-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">',
        '<path class="mobile-orientation-gate__circ-path" fill="none" stroke="#66D449" stroke-width="3.25" stroke-linecap="round"',
        ' stroke-linejoin="round" d="M 50 13 A 37 37 0 1 1 13 50"/>',
        '<g class="mobile-orientation-gate__circ-arrow" transform="translate(50,13) rotate(180)" aria-hidden="true">',
        '<polygon points="-4,-4 -4,4 14,0" fill="#66D449"/>',
        '</g>',
        '</svg>',
        '</div>',
        '</div>',
        '<div class="mobile-orientation-gate__phone"></div>',
        '</div>',
        '<div class="mobile-orientation-gate__copy">',
        '<p id="mobile-orientation-gate-title" class="mobile-orientation-gate__title">Rotate to portrait</p>',
        '<p id="mobile-orientation-gate-description" class="mobile-orientation-gate__text">Please switch back to Portrait mode to continue the game.</p>',
        '</div>',
        '</div>',
    ].join('');

    document.body.appendChild(gate);
    return gate;
};

const emitState = (state: ViewportState): void => {
    const detail = { ...state };
    try {
        window.dispatchEvent(new CustomEvent('tb-mobile-viewport:change', { detail }));
    } catch {
        // no-op
    }
    try {
        window.dispatchEvent(new CustomEvent('orientation-modal:change', { detail }));
    } catch {
        // Legacy compatibility for older ports.
    }
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'dijoker:game-orientation',
                game: 'grave_threat',
                blocked: state.shouldBlockOrientation,
                orientation: state.isLandscape ? 'landscape' : 'portrait',
                viewport: {
                    width: state.width,
                    height: state.height,
                    left: state.left,
                    top: state.top,
                },
            }, '*');
        }
    } catch {
        // Embedded providers may block parent access.
    }
};

const setGate = (open: boolean, state: ViewportState): void => {
    const gate = ensureGate();
    if (!gate) return;

    if (open === gateOpen) {
        applyFixedViewportBox(gate, state);
        return;
    }

    gateOpen = open;
    gate.hidden = !open;
    gate.classList.toggle('mobile-orientation-gate--hidden', !open);
    gate.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.documentElement.classList.toggle('tb-orientation-blocked', open);
    document.body?.classList.toggle('tb-orientation-blocked', open);

    const root = document.getElementById('root') as any;
    if (root) {
        try {
            root.inert = open;
        } catch {
            if (open) root.setAttribute('aria-hidden', 'true');
            else root.removeAttribute('aria-hidden');
        }
    }

    if (open) {
        try {
            const active = document.activeElement as HTMLElement | null;
            active?.blur?.();
        } catch {
            // no-op
        }
    }

    emitState(state);
};

const refreshGames = (): void => {
    registeredGames.forEach((entry) => {
        const root = document.getElementById('root') as HTMLElement | null;
        const container = document.getElementById(entry.parentId) as HTMLElement | null;
        const canvas = entry.game.canvas || null;

        try {
            if (root && entry.game.scale) {
                entry.game.scale.fullscreenTarget = root;
            }
        } catch {
            // no-op
        }

        applyTouchSafeStyles(root);
        applyTouchSafeStyles(container);
        applyTouchSafeStyles(canvas);

        try {
            if (canvas && !canvas.hasAttribute('tabindex')) {
                canvas.setAttribute('tabindex', '0');
            }
        } catch {
            // no-op
        }

        try {
            entry.game.scale?.refresh?.();
        } catch {
            // no-op
        }
    });
};

const clearRefreshTimers = (): void => {
    refreshTimers.forEach((timerId) => {
        try {
            window.clearTimeout(timerId);
        } catch {
            // no-op
        }
    });
    refreshTimers.clear();
};

const runRefreshPass = (): void => {
    latestState = getViewportState();
    applyViewportShell(latestState);
    setGate(latestState.shouldBlockOrientation, latestState);
    refreshGames();
};

const scheduleRefresh = (): void => {
    clearRefreshTimers();
    REFRESH_DELAYS.forEach((delay) => {
        const timerId = window.setTimeout(() => {
            refreshTimers.delete(timerId);
            runRefreshPass();
        }, delay);
        refreshTimers.add(timerId);
    });
};

const sync = (): void => {
    latestState = getViewportState();
    applyViewportShell(latestState);
    setGate(latestState.shouldBlockOrientation, latestState);
    emitState(latestState);
    scheduleRefresh();
};

const blockInputWhenGateOpen = (event: Event): void => {
    if (!gateOpen) return;
    try {
        if (event.cancelable) event.preventDefault();
    } catch {
        // no-op
    }
    try {
        event.stopImmediatePropagation();
    } catch {
        event.stopPropagation();
    }
};

const installGlobalListeners = (): void => {
    if (listenersInstalled) return;
    listenersInstalled = true;

    window.addEventListener('resize', sync, { passive: true });
    window.addEventListener('orientationchange', sync as EventListener, { passive: true });
    window.addEventListener('pageshow', sync, { passive: true });
    window.addEventListener('focus', sync, { passive: true });
    document.addEventListener('visibilitychange', sync, { passive: true });
    document.addEventListener('fullscreenchange', sync, { passive: true });
    document.addEventListener('webkitfullscreenchange', sync as EventListener, { passive: true } as AddEventListenerOptions);

    try {
        window.visualViewport?.addEventListener('resize', sync, { passive: true });
        window.visualViewport?.addEventListener('scroll', sync, { passive: true });
    } catch {
        // no-op
    }

    try {
        screen.orientation?.addEventListener?.('change', sync as EventListener, { passive: true } as AddEventListenerOptions);
    } catch {
        // no-op
    }

    INPUT_EVENTS.forEach((eventName) => {
        document.addEventListener(eventName, blockInputWhenGateOpen, { capture: true, passive: false });
    });
};

const start = (): void => {
    if (started) return;
    started = true;
    ensureGate();
    installGlobalListeners();
    sync();
};

const requestPortraitLock = async (): Promise<void> => {
    try {
        if (screen.orientation?.lock) {
            await screen.orientation.lock('portrait');
        }
    } catch {
        // Unsupported on iOS Safari and most non-fullscreen iframe contexts.
    }
};

export const registerMobileViewportGame = (
    game: PhaserGameLike,
    options: { parent?: string } = {},
): (() => void) => {
    const parentId = options.parent || 'game-container';
    const entry: RegisteredGame = { game, parentId };
    let cleaned = false;

    registeredGames.add(entry);

    const preventCanvasGesture = (event: Event): void => {
        try {
            if (event.cancelable) event.preventDefault();
        } catch {
            // no-op
        }
    };
    const onLeaveFullscreen = (): void => {
        try {
            game.canvas?.focus?.();
        } catch {
            // no-op
        }
    };
    const onScaleResize = (): void => {
        sync();
    };

    try {
        const canvas = game.canvas || null;
        canvas?.addEventListener('touchstart', preventCanvasGesture, { passive: false });
        canvas?.addEventListener('touchmove', preventCanvasGesture, { passive: false });
        canvas?.addEventListener('touchend', preventCanvasGesture, { passive: false });
        canvas?.addEventListener('touchcancel', preventCanvasGesture, { passive: false });
    } catch {
        // no-op
    }

    try {
        game.scale?.on?.('leavefullscreen', onLeaveFullscreen);
        game.scale?.on?.('enterfullscreen', requestPortraitLock);
        game.scale?.on?.('resize', onScaleResize);
    } catch {
        // no-op
    }

    const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        registeredGames.delete(entry);
        try {
            const canvas = game.canvas || null;
            canvas?.removeEventListener('touchstart', preventCanvasGesture);
            canvas?.removeEventListener('touchmove', preventCanvasGesture);
            canvas?.removeEventListener('touchend', preventCanvasGesture);
            canvas?.removeEventListener('touchcancel', preventCanvasGesture);
        } catch {
            // no-op
        }
        try {
            game.scale?.off?.('leavefullscreen', onLeaveFullscreen);
            game.scale?.off?.('enterfullscreen', requestPortraitLock);
            game.scale?.off?.('resize', onScaleResize);
        } catch {
            // no-op
        }
    };

    try {
        game.events?.once?.('destroy', cleanup);
    } catch {
        // no-op
    }

    sync();
    return cleanup;
};

const setManualGate = (value: boolean | null): void => {
    manualGate = value;
    sync();
};

const setDesktopUi = (enabled: boolean): void => {
    safeStorageSet(FORCE_DESKTOP_KEY, enabled);
    if (enabled) safeStorageSet(FORCE_PHONE_KEY, false);
    sync();
};

const setPhoneUi = (enabled: boolean): void => {
    safeStorageSet(FORCE_PHONE_KEY, enabled);
    if (enabled) safeStorageSet(FORCE_DESKTOP_KEY, false);
    sync();
};

const api: MobileViewportApi = {
    sync,
    getState: () => ({ ...latestState }),
    showOrientationGate: () => setManualGate(true),
    hideOrientationGate: () => setManualGate(false),
    useAutomaticOrientationGate: () => setManualGate(null),
    setDesktopUi,
    setPhoneUi,
};

window.tbMobileViewport = api;
window.syncMobileViewport = api.sync;
window.showOrientationGate = api.showOrientationGate;
window.hideOrientationGate = api.hideOrientationGate;
window.useAutomaticOrientationGate = api.useAutomaticOrientationGate;
window.tbSetDesktopUi = api.setDesktopUi;
window.tbSetPhoneUi = api.setPhoneUi;

// Compatibility with the previous guide/helpers.
window.showOrientationModal = api.showOrientationGate;
window.hideOrientationModal = api.hideOrientationGate;
window.syncOrientationModal = api.sync;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

export {};
