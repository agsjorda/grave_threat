import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v3';

// Install guards to prevent InvalidStateError when resuming/suspending a closed AudioContext
function installAudioContextGuards(): void {
	try {
		const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
		if (!Ctx || !Ctx.prototype) return;
		const proto = Ctx.prototype as any;
		if (typeof proto.resume === 'function') {
			const originalResume = proto.resume;
			proto.resume = function (...args: any[]) {
				try {
					if ((this as any)?.state === 'closed') {
						return Promise.resolve();
					}
					const result = originalResume.apply(this, args);
					if (result && typeof result.catch === 'function') {
						return result.catch(() => Promise.resolve());
					}
					return result;
				} catch (_e) {
					return Promise.resolve();
				}
			};
		}
		if (typeof proto.suspend === 'function') {
			const originalSuspend = proto.suspend;
			proto.suspend = function (...args: any[]) {
				try {
					if ((this as any)?.state === 'closed') {
						return Promise.resolve();
					}
					const result = originalSuspend.apply(this, args);
					if (result && typeof result.catch === 'function') {
						return result.catch(() => Promise.resolve());
					}
					return result;
				} catch (_e) {
					return Promise.resolve();
				}
			};
		}
	} catch (_e) {
		// no-op
	}
}

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL,
    width: 428,
    height: 926,
    parent: 'game-container',
    backgroundColor: 'transparent',
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH
		},
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 1000 },
            debug: false
        }
    },
    scene: [
        Boot,
        Preloader,
        MainGame,
    ],
    plugins: {
		scene: [
			{
				key: 'spine.SpinePlugin',
				plugin: SpinePlugin,
				mapping: 'spine'
			}
		]
	},
    render: {
		antialias: true,
		clearBeforeRender: false,
	},
    
};

const StartGame = (parent: string) => {
	installAudioContextGuards();
	// Visibility-aware audio muting without suspending AudioContext
	const installAudioVisibilityPolicy = (game: Phaser.Game) => {
		let windowHasFocus = true;
		const applyMuteToAllScenes = (muted: boolean) => {
			try {
				const gameSound = (game as any).sound;
				if (gameSound) {
					gameSound.mute = !!muted;
				}
			} catch {}
			try {
				const scenes = (game.scene as any).getScenes(false) as Phaser.Scene[] || [];
				for (const s of scenes) {
					if ((s as any).sound) {
						((s as any).sound as any).mute = !!muted;
					}
				}
			} catch {}
		};
		const applyPauseToGameLoop = (paused: boolean) => {
			try {
				if (paused) {
					game.loop.sleep();
				} else {
					game.loop.wake();
				}
			} catch {}
		};
		const shouldUnmute = (): boolean => {
			try {
				const am: any = (window as any).audioManager;
				// Respect user's own mute choice
				if (am && typeof am.isAudioMuted === 'function' && am.isAudioMuted()) {
					return false;
				}
			} catch {}
			return true;
		};
		const onHidden = () => {
			// When the page loses focus or becomes hidden, only mute audio.
			// Do not pause the game loop so gameplay continues uninterrupted
			// (e.g. when opening developer tools or switching tabs).
			applyMuteToAllScenes(true);
		};
		const onVisible = () => {
			// When the page becomes visible/focused again, unmute
			// unless the user explicitly muted audio via the in-game controls.
			if (shouldUnmute()) {
				applyMuteToAllScenes(false);
			}
		};
		const shouldPauseFromPageState = (): boolean => {
			try {
				const isHidden = document.visibilityState === 'hidden' || (document as any).hidden;
				if (isHidden) return true;
				return !windowHasFocus;
			} catch {
				return false;
			}
		};
		const handleActivityState = () => {
			if (shouldPauseFromPageState()) {
				onHidden();
			} else {
				onVisible();
			}
		};
		const handleWindowBlur = () => {
			windowHasFocus = false;
			handleActivityState();
		};
		const handleWindowFocus = () => {
			windowHasFocus = true;
			handleActivityState();
		};
		document.addEventListener('visibilitychange', handleActivityState);
		window.addEventListener('blur', handleWindowBlur);
		window.addEventListener('focus', handleWindowFocus);
		window.addEventListener('pagehide', onHidden);
		window.addEventListener('pageshow', handleActivityState);
		// Initial application
		handleActivityState();
	};
    // Helper to detect mobile devices (coarse heuristic)
    const isMobile = (): boolean => {
        try {
            const ua = navigator.userAgent || (navigator as any).vendor || (window as any).opera;
            return /android|iphone|ipad|ipod|iemobile|blackberry|mobile/i.test(ua);
        } catch (_e) {
            return false;
        }
    };

    const game = new Game({ ...config, parent });
	installAudioVisibilityPolicy(game);

    if (isMobile()) {
        try {
            const appElement = document.getElementById('root');
            const container = document.getElementById(parent) || appElement;
            const getViewportSize = () => {
                const vv = (window as any).visualViewport;
                const width = vv && vv.width ? Math.round(vv.width) : window.innerWidth;
                const height = vv && vv.height ? Math.round(vv.height) : window.innerHeight;
                return { width, height };
            };
            const applyContainerSize = () => {
                const { height } = getViewportSize();
                if (appElement) {
                    (appElement as HTMLElement).style.width = '100vw';
                    (appElement as HTMLElement).style.height = `${height}px`;
                }
                if (container) {
                    (container as HTMLElement).style.width = '100vw';
                    (container as HTMLElement).style.height = `${height}px`;
                }
            };
            const scheduleScaleRefresh = () => {
                try { game.scale.refresh(); } catch (_e) { /* no-op */ }
                [60, 180, 360, 720].forEach((ms) => {
                    window.setTimeout(() => {
                        applyContainerSize();
                        try { game.scale.refresh(); } catch (_e) { /* no-op */ }
                    }, ms);
                });
            };
            applyContainerSize();
            if (appElement) {
                (appElement.style as any).display = appElement.style.display || 'flex';
                (appElement.style as any).justifyContent = appElement.style.justifyContent || 'center';
                (appElement.style as any).alignItems = appElement.style.alignItems || 'center';
            }
            if (container) {
                (container.style as any).aspectRatio = '';
                container.style.maxWidth = '100vw';
                container.style.maxHeight = '100vh';
            }
            const onViewportChange = () => {
                applyContainerSize();
                scheduleScaleRefresh();
            };
            onViewportChange();
            window.addEventListener('resize', onViewportChange);
            window.addEventListener('orientationchange', onViewportChange as any);
            const vv = (window as any).visualViewport;
            if (vv && vv.addEventListener) {
                vv.addEventListener('resize', onViewportChange);
            }
        } catch (_err) { /* no-op */ }
        try {
            const appElement = document.getElementById('root');
            const container = document.getElementById(parent) || appElement;
            const canvas = game.canvas as HTMLCanvasElement | null;
            if (canvas) {
                const noopPrevent = (e: Event) => { e.preventDefault(); };
                canvas.addEventListener('touchstart', noopPrevent, { passive: false });
                canvas.addEventListener('touchmove', noopPrevent, { passive: false });
                canvas.addEventListener('touchend', noopPrevent, { passive: false });
                canvas.addEventListener('touchcancel', noopPrevent, { passive: false });
            }
            const applyTouchSafeStyles = (el: HTMLElement | null | undefined) => {
                if (!el) return;
                el.style.touchAction = 'none';
                (el.style as any).msTouchAction = 'none';
                el.style.userSelect = 'none';
                (el.style as any).webkitUserSelect = 'none';
                (el.style as any).webkitTapHighlightColor = 'transparent';
                (el.style as any).overscrollBehavior = 'contain';
            };
            applyTouchSafeStyles(appElement as HTMLElement);
            applyTouchSafeStyles(container as HTMLElement);
            applyTouchSafeStyles(canvas as unknown as HTMLElement);
        } catch (_e) { /* no-op */ }
        if (game.canvas && !game.canvas.hasAttribute('tabindex')) {
            game.canvas.setAttribute('tabindex', '0');
        }
    }

    (window as any).phaserGame = game;
    /** Call from browser console to open a dialog by type and optional values. Example: showDialog({ type: 'TotalWin', winAmount: 50000 }) */
    (window as any).showDialog = (params: { type: string; winAmount?: number; freeSpins?: number; betAmount?: number; isRetrigger?: boolean; [key: string]: unknown }) => {
        const g = (window as any).phaserGame;
        if (!g) {
            console.warn('showDialog: phaserGame not found');
            return;
        }
        const scene = g.scene.getScene('Game');
        if (!scene || !(scene as any).dialogs) {
            console.warn('showDialog: Game scene or dialogs not found (ensure game has started)');
            return;
        }
        const dialogs = (scene as any).dialogs;
        const config: Record<string, unknown> = { type: params.type };
        if (params.winAmount != null) config.winAmount = params.winAmount;
        if (params.freeSpins != null) config.freeSpins = params.freeSpins;
        if (params.betAmount != null) config.betAmount = params.betAmount;
        if (params.isRetrigger != null) config.isRetrigger = params.isRetrigger;
        Object.keys(params).forEach((k) => {
            if (!['type', 'winAmount', 'freeSpins', 'betAmount', 'isRetrigger'].includes(k)) (config as any)[k] = (params as any)[k];
        });
        dialogs.showDialog(scene, config);
    };
    const appElement = document.getElementById('root');
    if (appElement) {
        (game.scale as any).fullscreenTarget = appElement as unknown as HTMLElement;
    }
    game.scale.on('leavefullscreen', () => {
        game.canvas?.focus();
    });
    const onFsChange = () => {
        if (!game.scale.isFullscreen) {
            game.canvas?.focus();
        }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    // @ts-ignore - Safari legacy prefix
    document.addEventListener('webkitfullscreenchange', onFsChange);
    const lockPortraitIfPossible = async () => {
        try {
            // @ts-ignore - not universally typed
            if ((screen as any) && (screen as any).orientation && (screen as any).orientation.lock) {
                // @ts-ignore
                await (screen as any).orientation.lock('portrait');
            }
        } catch (_e) { /* no-op */ }
    };
    game.scale.on('enterfullscreen', lockPortraitIfPossible);
    game.scale.on('resize', () => {
        try {
            const root = document.getElementById('root');
            if (root) {
                const vv = (window as any).visualViewport;
                const height = vv && vv.height ? Math.round(vv.height) : window.innerHeight;
                (root as HTMLElement).style.height = `${height}px`;
            }
        } catch (_e) { /* no-op */ }
    });

    return game;

}

export default StartGame;
