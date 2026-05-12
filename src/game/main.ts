import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v3';
import { getGlobalAudioManager } from '../utils/AudioHelpers';
import { registerMobileViewportGame } from '../bootstrap/MobileViewport';

const GAME_DESIGN_WIDTH = 428;
const GAME_DESIGN_HEIGHT = 926;
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
    type: Phaser.AUTO,
    width: GAME_DESIGN_WIDTH,
	height: GAME_DESIGN_HEIGHT,
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
		batchSize: 4096,
		pixelArt: false,
		roundPixels: false,
		/** Hint the browser to use the discrete/high-performance GPU on dual-GPU devices.
		 *  On most modern phones and laptops this prevents the game from being scheduled
		 *  on the power-saving integrated GPU with no visible cost. */
		powerPreference: 'high-performance',
	}
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
				const am: any = getGlobalAudioManager();
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

    const game = new Game({ ...config, parent });
	installAudioVisibilityPolicy(game);

	try {
		registerMobileViewportGame(game, { parent });
	} catch (_e) {
		/* no-op */
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

    return game;

}

export default StartGame;
