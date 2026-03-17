import { gameStateManager } from './GameStateManager';
import { gameEventManager } from '../event/EventManager';
import { GameEventType } from '../event/EventManager';

export enum MusicType {
	MAIN = 'main',
	BONUS = 'bonus', 
	FREE_SPIN = 'freespin'
}

export enum SoundEffectType {
	SPIN = 'spin',
	REEL_ROLL = 'reel_roll',
	REEL_DROP = 'reeldrop',
	SCATTER_DROP_1 = 'scatter_drop_1',
	SCATTER_DROP_2 = 'scatter_drop_2',
	SCATTER_DROP_3 = 'scatter_drop_3',
	SCATTER_DROP_4 = 'scatter_drop_4',
	TURBO_DROP = 'turbodrop',
	MENU_CLICK = 'menu_click',
	SPIN_CLICK = 'spin_click',
	WHISTLE_BB = 'whistle_bb',
	SCATTER = 'scatter',
	// Tumble-driven symbol-win SFX (play per tumble index)
	SYMBOL_WIN_1 = 'symbol_win_1',
	SYMBOL_WIN_2 = 'symbol_win_2',
	SYMBOL_WIN_3 = 'symbol_win_3',
	SYMBOL_WIN_4 = 'symbol_win_4',
	// Win dialog effects
	WIN_BIG = 'win_big',
	WIN_MEGA = 'win_mega',
	WIN_SUPER = 'win_super',
	WIN_EPIC = 'win_epic',
	MAX_WIN = 'maxw',
	MAX_WIN_END = 'maxwend',
	DIALOG_CONGRATS = 'dialog_congrats',
	DIALOG_FREESPIN = 'dialog_freespin',
	// Non-scatter box close SFX (played once when all regular symbol wins finish)
	BOX_CLOSE = 'box_close'
}

export class AudioManager {
	private scene: Phaser.Scene;
	private currentMusic: MusicType | null = null;
	private musicVolume: number = 0.3;
	private sfxVolume: number = 0.3;
	private ambientVolume: number = 0.3; // Volume for ambient audio layer
	private isMuted: boolean = false;
	private musicInstances: Map<MusicType, Phaser.Sound.BaseSound> = new Map();
	private sfxInstances: Map<SoundEffectType, Phaser.Sound.BaseSound> = new Map();
	private ambientInstance: Phaser.Sound.BaseSound | null = null; // Ambient audio instance
	private currentWinSfx: Phaser.Sound.BaseSound | null = null;
	private isDucked: boolean = false;
	private savedMusicVolume: number | null = null;
	private savedAmbientVolume: number | null = null;
	private duckFadeTimer: any = null;
	private restoreFadeTimer: any = null;

	constructor(scene: Phaser.Scene) {
		this.scene = scene;
		console.log('[AudioManager] AudioManager initialized');
	}

	/**
	 * Preload all background music and sound effect files
	 */
	preloadMusic(): void {
		console.log('[AudioManager] Preloading audio files...');
		
		// Main background music
		this.scene.load.audio('mainbg', 'assets/sounds/BG/mainbg_BB.ogg');
		
		// Bonus background music
		this.scene.load.audio('bonusbg', 'assets/sounds/BG/bonusbg_BB.ogg');
		
		// Free spin background music
		this.scene.load.audio('freespinbg', 'assets/sounds/BG/freespinbg_BB.ogg');
		
		// Ambient audio
		//this.scene.load.audio('ambience_ka', 'assets/sounds/SFX/ambience_ka.ogg');
		
		// Sound effects
		this.scene.load.audio('spinb', 'assets/sounds/SFX/spinb_BB.ogg');
		this.scene.load.audio('click', 'assets/sounds/click_2.ogg');
		this.scene.load.audio('reelroll', 'assets/sounds/SFX/reelroll_BB.ogg');
		this.scene.load.audio('reeldrop', 'assets/sounds/SFX/reeldrop_BB.ogg');
		this.scene.load.audio('turbodrop', 'assets/sounds/SFX/turbodrop_ka.ogg');
		this.scene.load.audio('box_close', 'assets/sounds/SFX/box_close.ogg');
		this.scene.load.audio('whistle', 'assets/sounds/SFX/whistle_BB.ogg');
		
		console.log('[AudioManager] Audio files preloaded successfully');
	}

	/**
	 * Create music and sound effect instances after loading
	 */
	createMusicInstances(): void {
		console.log('[AudioManager] Creating audio instances...');
		
		try {
			// Create main background music
			const mainMusic = this.scene.sound.add('mainbg', {
				volume: this.musicVolume,
				loop: true
			});
			this.musicInstances.set(MusicType.MAIN, mainMusic);
			console.log('[AudioManager] Main background music instance created');

			// Create bonus background music
			const bonusMusic = this.scene.sound.add('bonusbg', {
				volume: this.musicVolume,
				loop: true
			});
			this.musicInstances.set(MusicType.BONUS, bonusMusic);
			console.log('[AudioManager] Bonus background music instance created');

			// Create free spin background music
			const freespinMusic = this.scene.sound.add('freespinbg', {
				volume: this.musicVolume,
				loop: true
			});
			this.musicInstances.set(MusicType.FREE_SPIN, freespinMusic);
			console.log('[AudioManager] Free spin background music instance created');

			// Create sound effect instances
			const spinSfx = this.scene.sound.add('spinb', {
				volume: this.sfxVolume,
				loop: false
			});
			this.sfxInstances.set(SoundEffectType.SPIN, spinSfx);
			console.log('[AudioManager] Spin sound effect instance created');

			// Menu click SFX
			try {
				const clickSfx = this.scene.sound.add('click', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.MENU_CLICK, clickSfx);
				console.log('[AudioManager] Menu click SFX instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create click SFX instance:', e);
			}
			// Spin click SFX (louder than background music)
			try {
				const spinClickSfx = this.scene.sound.add('click', { volume: this.getSpinClickVolume(), loop: false });
				this.sfxInstances.set(SoundEffectType.SPIN_CLICK, spinClickSfx);
				console.log('[AudioManager] Spin click SFX instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create spin click SFX instance:', e);
			}

			const reelDropSfx = this.scene.sound.add('reeldrop', {
				volume: this.sfxVolume,
				loop: false
			});
			this.sfxInstances.set(SoundEffectType.REEL_DROP, reelDropSfx);
			console.log('[AudioManager] Reel drop sound effect instance created');

			try {
				const scatterDrop1 = this.scene.sound.add('scatterdrop1', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SCATTER_DROP_1, scatterDrop1);
			} catch (e) { console.warn('[AudioManager] Failed to create scatterdrop1 SFX instance:', e); }
			try {
				const scatterDrop2 = this.scene.sound.add('scatterdrop2', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SCATTER_DROP_2, scatterDrop2);
			} catch (e) { console.warn('[AudioManager] Failed to create scatterdrop2 SFX instance:', e); }
			try {
				const scatterDrop3 = this.scene.sound.add('scatterdrop3', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SCATTER_DROP_3, scatterDrop3);
			} catch (e) { console.warn('[AudioManager] Failed to create scatterdrop3 SFX instance:', e); }
			try {
				const scatterDrop4 = this.scene.sound.add('scatterdrop4', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SCATTER_DROP_4, scatterDrop4);
			} catch (e) { console.warn('[AudioManager] Failed to create scatterdrop4 SFX instance:', e); }

			try {
				const reelRollSfx = this.scene.sound.add('reelroll', {
					volume: this.sfxVolume,
					loop: true
				});
				this.sfxInstances.set(SoundEffectType.REEL_ROLL, reelRollSfx);
				console.log('[AudioManager] Reel roll sound effect instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create reelroll SFX instance:', e);
			}

			const turboDropSfx = this.scene.sound.add('turbodrop', {
				volume: this.sfxVolume,
				loop: false
			});
			this.sfxInstances.set(SoundEffectType.TURBO_DROP, turboDropSfx);
			console.log('[AudioManager] Turbo drop sound effect instance created');

			// Create tumble symbol-win SFX instances (twin1..4_bz)
			try {
				const twin1 = this.scene.sound.add('twin1', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SYMBOL_WIN_1, twin1);
			} catch (e) { console.warn('[AudioManager] Failed to create twin1 SFX instance:', e); }
			try {
				const twin2 = this.scene.sound.add('twin2', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SYMBOL_WIN_2, twin2);
			} catch (e) { console.warn('[AudioManager] Failed to create twin2 SFX instance:', e); }
			try {
				const twin3 = this.scene.sound.add('twin3', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SYMBOL_WIN_3, twin3);
			} catch (e) { console.warn('[AudioManager] Failed to create twin3 SFX instance:', e); }
			try {
				const twin4 = this.scene.sound.add('twin4', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SYMBOL_WIN_4, twin4);
			} catch (e) { console.warn('[AudioManager] Failed to create twin4 SFX instance:', e); }
			console.log('[AudioManager] Tumble symbol-win SFX instances created');

			// Box close SFX (single global instance, played once when all regular symbol wins finish).
			try {
				const boxCloseSfx = this.scene.sound.add('box_close', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.BOX_CLOSE, boxCloseSfx);
				console.log('[AudioManager] Box close SFX instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create box_close SFX instance:', e);
			}

			// Radial light transition whistle SFX
			try {
				const whistleSfx = this.scene.sound.add('whistle', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.WHISTLE_BB, whistleSfx);
				console.log('[AudioManager] Whistle (radial light) SFX instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create whistle SFX instance:', e);
			}

			// Create scatter SFX instance
			try {
				const scatter = this.scene.sound.add('scatter', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.SCATTER, scatter);
				console.log('[AudioManager] Scatter SFX instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create scatter SFX instance:', e);
			}

			// Scatter win "nom nom" SFX is not used in pastry_cub; no instance created.

			// Create win dialog SFX instances
			const bigWinSfx = this.scene.sound.add('bigw', { volume: this.sfxVolume, loop: false });
			this.sfxInstances.set(SoundEffectType.WIN_BIG, bigWinSfx);
			const megaWinSfx = this.scene.sound.add('megaw', { volume: this.sfxVolume, loop: false });
			this.sfxInstances.set(SoundEffectType.WIN_MEGA, megaWinSfx);
			const superWinSfx = this.scene.sound.add('superw', { volume: this.sfxVolume, loop: false });
			this.sfxInstances.set(SoundEffectType.WIN_SUPER, superWinSfx);
			const epicWinSfx = this.scene.sound.add('epicw', { volume: this.sfxVolume, loop: false });
			this.sfxInstances.set(SoundEffectType.WIN_EPIC, epicWinSfx);
			if (this.scene.cache.audio.exists('maxw')) {
				try {
					const maxWinSfx = this.scene.sound.add('maxw', { volume: this.sfxVolume, loop: false });
					this.sfxInstances.set(SoundEffectType.MAX_WIN, maxWinSfx);
					console.log('[AudioManager] MaxWin dialog SFX instance created');
				} catch (e) {
					console.warn('[AudioManager] Failed to create MaxWin SFX instance:', e);
				}
			}
			if (this.scene.cache.audio.exists('maxwend')) {
				try {
					const maxWinEndSfx = this.scene.sound.add('maxwend', { volume: this.sfxVolume, loop: false });
					this.sfxInstances.set(SoundEffectType.MAX_WIN_END, maxWinEndSfx);
					console.log('[AudioManager] MaxWin end SFX instance created');
				} catch (e) {
					console.warn('[AudioManager] Failed to create MaxWin end SFX instance:', e);
				}
			}
			console.log('[AudioManager] Win dialog SFX instances created');

			// Create dialog-specific SFX instances (only if loaded for this game)
			// Use existing 'totalw' asset as the Congrats/TotalWin dialog sound.
			if (this.scene.cache.audio.exists('totalw')) {
				try {
					const congratsDlg = this.scene.sound.add('totalw', { volume: this.sfxVolume, loop: false });
					this.sfxInstances.set(SoundEffectType.DIALOG_CONGRATS, congratsDlg);
					console.log('[AudioManager] Congrats dialog SFX instance created');
				} catch (e) {
					console.warn('[AudioManager] Failed to create congrats SFX instance:', e);
				}
			}
			try {
				const freeSpinDlg = this.scene.sound.add('retrigger', { volume: this.sfxVolume, loop: false });
				this.sfxInstances.set(SoundEffectType.DIALOG_FREESPIN, freeSpinDlg);
				console.log('[AudioManager] Free spin dialog SFX instance created');
			} catch (e) {
				console.warn('[AudioManager] Failed to create free spin dialog SFX instance:', e);
			}
			console.log('[AudioManager] Total SFX instances:', this.sfxInstances.size);

			// Create ambient audio instance
			// this.ambientInstance = this.scene.sound.add('ambience_bz', {
			// 	volume: this.ambientVolume,
			// 	loop: true
			// });
			// console.log('[AudioManager] Ambient audio instance created');

			console.log('[AudioManager] All audio instances created successfully');

			// Reel roll: play while reels/tumble are moving, stop when sequence is done
			try {
				gameEventManager.on(GameEventType.REELS_START, this.boundOnReelsStart);
				gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, this.boundOnTumbleSequenceDone);
			} catch (e) {
				console.warn('[AudioManager] Failed to subscribe to reel roll events:', e);
			}
		} catch (error) {
			console.error('[AudioManager] Error creating audio instances:', error);
		}
	}

	private boundOnReelsStart = (): void => this.onReelsStart();
	private boundOnTumbleSequenceDone = (): void => this.onTumbleSequenceDone();

	private onReelsStart(): void {
		if (this.isMuted) return;
		const sfx = this.sfxInstances.get(SoundEffectType.REEL_ROLL);
		if (sfx && !sfx.isPlaying) {
			try {
				sfx.play();
			} catch (e) {
				console.warn('[AudioManager] Failed to play reel roll:', e);
			}
		}
	}

	private onTumbleSequenceDone(): void {
		// Stop reel-roll ambience now that all tumbles/wins are done.
		this.stopReelRoll();
	}

	/**
	 * Stop (fade out) the reel roll SFX. Call when reels and tumbles have finished.
	 */
	stopReelRoll(): void {
		this.fadeOutSfx(SoundEffectType.REEL_ROLL, 200);
	}

	/**
	 * Play tumble-indexed symbol-win SFX.
	 * 1 -> twin1, 2 -> twin2, 3 -> twin3, 4+ -> twin4
	 */
	playSymbolWinByTumble(tumbleIndex: number): void {
		if (this.isMuted) {
			console.log('[AudioManager] Audio is muted, skipping symbol-win SFX');
			return;
		}
		const clamped = Math.max(1, Math.min(4, Math.floor(tumbleIndex || 1)));
		let pick: SoundEffectType = SoundEffectType.SYMBOL_WIN_1; // default for 1
		if (clamped === 2) pick = SoundEffectType.SYMBOL_WIN_2;
		else if (clamped === 3) pick = SoundEffectType.SYMBOL_WIN_3;
		else if (clamped >= 4) pick = SoundEffectType.SYMBOL_WIN_4;
		console.log(`[AudioManager] playSymbolWinByTumble: tumbleIndex=${tumbleIndex}, clamped=${clamped}, playing=${pick}`);
		this.playSoundEffect(pick);
	}

	/**
	 * Crossfade from current music to the target music type without gaps
	 */
	crossfadeTo(nextType: MusicType, durationMs: number = 500): void {
		if (this.isMuted) return;
		if (this.currentMusic === nextType) return;

		const currentType = this.currentMusic;
		const from = currentType ? this.musicInstances.get(currentType) : null;
		const to = this.musicInstances.get(nextType);
		if (!to) {
			console.warn('[AudioManager] Crossfade target music not found:', nextType);
			this.playBackgroundMusic(nextType);
			return;
		}

		// If nothing is currently playing, just play the target
		if (!from || !from.isPlaying) {
			try {
				if ('setVolume' in to && typeof (to as any).setVolume === 'function') {
					(to as any).setVolume(0);
				}
				to.play();
				this.currentMusic = nextType;
				const steps = 10;
				const interval = Math.max(10, Math.floor(durationMs / steps));
				let step = 0;
				const timer = setInterval(() => {
					step++;
					const t = step / steps;
					if ('setVolume' in to && typeof (to as any).setVolume === 'function') {
						(to as any).setVolume(this.musicVolume * t);
					}
					if (step >= steps) {
						clearInterval(timer);
						if ('setVolume' in to && typeof (to as any).setVolume === 'function') {
							(to as any).setVolume(this.musicVolume);
						}
					}
				}, interval);
			} catch (e) {
				console.warn('[AudioManager] Failed simple fade-in for target music, falling back to play:', e);
				this.playBackgroundMusic(nextType);
			}
			return;
		}

		// Crossfade between two tracks
		try {
			const fromStart = (from as any).volume ?? this.musicVolume;
			// Ensure target starts at 0 volume
			if ('setVolume' in to && typeof (to as any).setVolume === 'function') {
				(to as any).setVolume(0);
			}
			if (!to.isPlaying) to.play();

			const steps = 12;
			const interval = Math.max(10, Math.floor(durationMs / steps));
			let step = 0;
			const timer = setInterval(() => {
				step++;
				const t = step / steps;
				const toVol = this.musicVolume * t;
				const fromVol = Math.max(0, fromStart * (1 - t));
				if ('setVolume' in to && typeof (to as any).setVolume === 'function') {
					(to as any).setVolume(toVol);
				}
				if ('setVolume' in from && typeof (from as any).setVolume === 'function') {
					(from as any).setVolume(fromVol);
				}
				if (step >= steps) {
					clearInterval(timer);
					// Stop the old track and finalize volumes
					try { if (from.isPlaying) from.stop(); } catch {}
					if ('setVolume' in to && typeof (to as any).setVolume === 'function') {
						(to as any).setVolume(this.musicVolume);
					}
					this.currentMusic = nextType;
					this.startAmbientAudio();
				}
			}, interval);
		} catch (e) {
			console.warn('[AudioManager] Crossfade failed, falling back to direct switch:', e);
			this.playBackgroundMusic(nextType);
		}
	}

	/**
	 * Play background music based on game state
	 */
	playBackgroundMusic(musicType: MusicType): void {
		if (this.isMuted) {
			console.log('[AudioManager] Audio is muted, skipping music playback');
			return;
		}

		// Stop current music if playing
		this.stopCurrentMusic();

		const music = this.musicInstances.get(musicType);
		if (music) {
			try {
				music.play();
				this.currentMusic = musicType;
				console.log(`[AudioManager] Playing ${musicType} background music`);
				this.startAmbientAudio();
			} catch (error) {
				console.error(`[AudioManager] Error playing ${musicType} music:`, error);
			}
		} else {
			console.warn(`[AudioManager] Music instance not found for type: ${musicType}`);
		}
	}

	/**
	 * Check whether a music instance is ready for the requested type.
	 */
	public hasMusicInstance(musicType: MusicType): boolean {
		return !!this.musicInstances.get(musicType);
	}

	/**
	 * Stop current background music
	 */
	stopCurrentMusic(): void {
		if (this.currentMusic) {
			const music = this.musicInstances.get(this.currentMusic);
			if (music && music.isPlaying) {
				music.stop();
				console.log(`[AudioManager] Stopped ${this.currentMusic} background music`);
			}
			this.currentMusic = null;
		}
	}

	/**
	 * Stop all background music
	 */
	stopAllMusic(): void {
		console.log('[AudioManager] Stopping all background music');
		this.musicInstances.forEach((music, type) => {
			if (music.isPlaying) {
				music.stop();
				console.log(`[AudioManager] Stopped ${type} music`);
			}
		});
		this.currentMusic = null;
		this.stopAmbientAudio();
	}

	/**
	 * Set music volume
	 */
	setVolume(volume: number): void {
		this.musicVolume = Math.max(0, Math.min(1, volume));
		
		this.musicInstances.forEach((music) => {
			if ('setVolume' in music && typeof music.setVolume === 'function') {
				music.setVolume(this.musicVolume);
			}
		});
		const spinClick = this.sfxInstances.get(SoundEffectType.SPIN_CLICK);
		if (spinClick && 'setVolume' in spinClick && typeof spinClick.setVolume === 'function') {
			spinClick.setVolume(this.getSpinClickVolume());
		}
		
		console.log(`[AudioManager] Music volume set to: ${this.musicVolume}`);
	}

	/**
	 * Temporarily reduce background (music + ambient) volume by a factor
	 */
	duckBackground(factor: number = 0.3, durationMs: number = 300): void {
		if (this.isMuted) return;
		// Cancel any ongoing restore fade
		if (this.restoreFadeTimer) {
			clearInterval(this.restoreFadeTimer);
			this.restoreFadeTimer = null;
		}
		// Save current volumes once
		if (!this.isDucked) {
			this.savedMusicVolume = this.musicVolume;
			this.savedAmbientVolume = this.ambientVolume;
		}
		this.isDucked = true;
		const startMusic = this.getVolume();
		const startAmbient = this.getAmbientVolume();
		const targetMusic = Math.max(0, Math.min(1, startMusic * factor));
		const targetAmbient = Math.max(0, Math.min(1, startAmbient * factor));
		if (durationMs <= 0) {
			this.musicInstances.forEach((music) => {
				if ('setVolume' in music && typeof music.setVolume === 'function') {
					music.setVolume(targetMusic);
				}
			});
			if (this.ambientInstance && 'setVolume' in this.ambientInstance && typeof (this.ambientInstance as any).setVolume === 'function') {
				(this.ambientInstance as any).setVolume(targetAmbient);
			}
			console.log(`[AudioManager] Background ducked instantly to factor ${factor} (music=${targetMusic}, ambient=${targetAmbient})`);
			return;
		}
		// Fade
		if (this.duckFadeTimer) {
			clearInterval(this.duckFadeTimer);
		}
		const steps = 10;
		const interval = Math.max(10, Math.floor(durationMs / steps));
		let step = 0;
		this.duckFadeTimer = setInterval(() => {
			step++;
			const t = step / steps;
			const curMusic = startMusic + (targetMusic - startMusic) * t;
			const curAmbient = startAmbient + (targetAmbient - startAmbient) * t;
			this.musicInstances.forEach((music) => {
				if ('setVolume' in music && typeof music.setVolume === 'function') {
					music.setVolume(curMusic);
				}
			});
			if (this.ambientInstance && 'setVolume' in this.ambientInstance && typeof (this.ambientInstance as any).setVolume === 'function') {
				(this.ambientInstance as any).setVolume(curAmbient);
			}
			if (step >= steps) {
				clearInterval(this.duckFadeTimer);
				this.duckFadeTimer = null;
				console.log(`[AudioManager] Background ducked to factor ${factor} (music=${targetMusic}, ambient=${targetAmbient})`);
			}
		}, interval);
	}

	/**
	 * Restore background (music + ambient) volume after ducking
	 */
	restoreBackground(durationMs: number = 500): void {
		if (this.isMuted) return;
		if (!this.isDucked) return;
		// Cancel any ongoing duck fade
		if (this.duckFadeTimer) {
			clearInterval(this.duckFadeTimer);
			this.duckFadeTimer = null;
		}
		const targetMusic = this.savedMusicVolume ?? this.musicVolume;
		const targetAmbient = this.savedAmbientVolume ?? this.ambientVolume;
		// Read current applied volumes from any music instance (all share same intended volume)
		let currentMusic = targetMusic;
		this.musicInstances.forEach((music) => {
			try {
				currentMusic = (music as any).volume ?? targetMusic;
				throw new Error('break');
			} catch {}
		});
		let currentAmbient = targetAmbient;
		if (this.ambientInstance) {
			currentAmbient = (this.ambientInstance as any).volume ?? targetAmbient;
		}
		if (durationMs <= 0) {
			this.musicInstances.forEach((music) => {
				if ('setVolume' in music && typeof music.setVolume === 'function') {
					music.setVolume(targetMusic);
				}
			});
			if (this.ambientInstance && 'setVolume' in this.ambientInstance && typeof (this.ambientInstance as any).setVolume === 'function') {
				(this.ambientInstance as any).setVolume(targetAmbient);
			}
			this.isDucked = false;
			this.savedMusicVolume = null;
			this.savedAmbientVolume = null;
			console.log('[AudioManager] Background volume restored instantly');
			return;
		}
		if (this.restoreFadeTimer) {
			clearInterval(this.restoreFadeTimer);
		}
		const steps = 10;
		const interval = Math.max(10, Math.floor(durationMs / steps));
		let step = 0;
		this.restoreFadeTimer = setInterval(() => {
			step++;
			const t = step / steps;
			const curMusic = currentMusic + (targetMusic - currentMusic) * t;
			const curAmbient = currentAmbient + (targetAmbient - currentAmbient) * t;
			this.musicInstances.forEach((music) => {
				if ('setVolume' in music && typeof music.setVolume === 'function') {
					music.setVolume(curMusic);
				}
			});
			if (this.ambientInstance && 'setVolume' in this.ambientInstance && typeof (this.ambientInstance as any).setVolume === 'function') {
				(this.ambientInstance as any).setVolume(curAmbient);
			}
			if (step >= steps) {
				clearInterval(this.restoreFadeTimer);
				this.restoreFadeTimer = null;
				this.isDucked = false;
				this.savedMusicVolume = null;
				this.savedAmbientVolume = null;
				console.log('[AudioManager] Background volume restored');
			}
		}, interval);
	}

	/**
	 * Get current music volume
	 */
	getVolume(): number {
		return this.musicVolume;
	}

	/**
	 * Toggle mute state
	 */
	toggleMute(): void {
		this.isMuted = !this.isMuted;
		
		if (this.isMuted) {
			this.stopAllMusic();
			console.log('[AudioManager] Audio muted');
		} else {
			console.log('[AudioManager] Audio unmuted');
			// Resume music based on current game state
			this.resumeMusicBasedOnGameState();
		}
	}

	/**
	 * Set mute state
	 */
	setMuted(muted: boolean): void {
		this.isMuted = muted;
		
		if (this.isMuted) {
			this.stopAllMusic();
			console.log('[AudioManager] Audio muted');
		} else {
			console.log('[AudioManager] Audio unmuted');
			this.resumeMusicBasedOnGameState();
		}
	}

	/**
	 * Get mute state
	 */
	isAudioMuted(): boolean {
		return this.isMuted;
	}

	/**
	 * Resume music based on current game state
	 */
	resumeMusicBasedOnGameState(): void {
		if (this.isMuted) return;

		// Only resume main music when unmuting
		// Bonus music will be triggered when showBonusBackground event is emitted
		// Don't automatically switch to bonus music based on isBonus flag
		if (!gameStateManager.isBonus) {
			this.playBackgroundMusic(MusicType.MAIN);
			this.startAmbientAudio();
		} else {
			// If we're in bonus mode but music isn't playing, don't auto-start bonus music
			// It should only start when the background actually changes
			console.log('[AudioManager] In bonus mode - bonus music will start when background changes');
		}
	}

	/**
	 * Start ambient audio
	 */
	startAmbientAudio(): void {
		if (this.isMuted || !this.ambientInstance) return;

		if (!this.ambientInstance.isPlaying) {
			this.ambientInstance.play();
			console.log('[AudioManager] Ambient audio started');
		}
	}

	/**
	 * Stop ambient audio
	 */
	stopAmbientAudio(): void {
		if (this.ambientInstance && this.ambientInstance.isPlaying) {
			this.ambientInstance.stop();
			console.log('[AudioManager] Ambient audio stopped');
		}
	}

	/**
	 * Set ambient audio volume
	 */
	setAmbientVolume(volume: number): void {
		this.ambientVolume = Math.max(0, Math.min(1, volume));
		
		if (this.ambientInstance && 'setVolume' in this.ambientInstance && typeof this.ambientInstance.setVolume === 'function') {
			this.ambientInstance.setVolume(this.ambientVolume);
		}
		
		console.log(`[AudioManager] Ambient volume set to: ${this.ambientVolume}`);
	}

	/**
	 * Get ambient audio volume
	 */
	getAmbientVolume(): number {
		return this.ambientVolume;
	}

	/**
	 * Handle game state changes and switch music accordingly
	 */
	onGameStateChange(): void {
		if (this.isMuted) return;

		// Only switch to main music when leaving bonus mode
		// Bonus music will be triggered when showBonusBackground event is emitted
		// Don't automatically switch to bonus music based on isBonus flag
		if (!gameStateManager.isBonus && this.currentMusic === MusicType.BONUS) {
			this.playBackgroundMusic(MusicType.MAIN);
		}
	}

	/**
	 * Switch to free spin music (can be called during bonus mode)
	 */
	switchToFreeSpinMusic(): void {
		if (this.isMuted) return;
		
		this.playBackgroundMusic(MusicType.FREE_SPIN);
		console.log('[AudioManager] Switched to free spin background music');
	}

	/**
	 * Whether a sound effect instance exists (e.g. optional SFX may not be loaded for this game).
	 */
	hasSoundEffect(sfxType: SoundEffectType): boolean {
		return this.sfxInstances.has(sfxType);
	}

	/**
	 * Play a sound effect
	 */
	playSoundEffect(sfxType: SoundEffectType, rate?: number): void {
		if (this.isMuted) return;

		const sfx = this.sfxInstances.get(sfxType);
		if (!sfx) return;

		try {
			if (typeof rate === 'number' && rate > 0) {
				try {
					if ('setRate' in sfx && typeof (sfx as any).setRate === 'function') {
						(sfx as any).setRate(rate);
					} else if ('rate' in (sfx as any)) {
						(sfx as any).rate = rate;
					}
				} catch { /* ignore */ }
			}
			sfx.play();
			if (
				sfxType === SoundEffectType.WIN_BIG ||
				sfxType === SoundEffectType.WIN_MEGA ||
				sfxType === SoundEffectType.WIN_SUPER ||
				sfxType === SoundEffectType.WIN_EPIC ||
				sfxType === SoundEffectType.MAX_WIN
			) {
				this.currentWinSfx = sfx;
			}
		} catch (error) {
			console.error(`[AudioManager] Error playing ${sfxType} sound effect:`, error);
		}
	}

	/**
	 * Fade out a specific SFX by type and stop it when done
	 */
	fadeOutSfx(sfxType: SoundEffectType, durationMs: number = 400): void {
		const sfx = this.sfxInstances.get(sfxType);
		if (!sfx || !sfx.isPlaying) return;
		try {
			const startVolume = (sfx as any).volume ?? this.sfxVolume;
			const steps = 8;
			const interval = Math.max(10, Math.floor(durationMs / steps));
			let step = 0;
			const timer = setInterval(() => {
				step++;
				const t = step / steps;
				const vol = startVolume * (1 - t);
				if ('setVolume' in sfx && typeof (sfx as any).setVolume === 'function') {
					(sfx as any).setVolume(Math.max(0, vol));
				}
				if (step >= steps) {
					clearInterval(timer);
					if (sfx.isPlaying) sfx.stop();
					if ('setVolume' in sfx && typeof (sfx as any).setVolume === 'function') {
						(sfx as any).setVolume(this.sfxVolume);
					}
				}
			}, interval);
		} catch (e) {
			console.warn('[AudioManager] Failed to fade out SFX:', e);
			try { if (sfx.isPlaying) sfx.stop(); } catch {}
		}
	}

	/**
	 * Fade out any currently playing win SFX and stop it when done
	 */
	fadeOutCurrentWinSfx(durationMs: number = 400): void {
		if (!this.currentWinSfx) return;
		const sfx = this.currentWinSfx;
		try {
			const startVolume = (sfx as any).volume ?? this.sfxVolume;
			const steps = 8;
			const interval = Math.max(10, Math.floor(durationMs / steps));
			let step = 0;
			const timer = setInterval(() => {
				step++;
				const t = step / steps;
				const vol = startVolume * (1 - t);
				if ('setVolume' in sfx && typeof (sfx as any).setVolume === 'function') {
					(sfx as any).setVolume(Math.max(0, vol));
				}
				if (step >= steps) {
					clearInterval(timer);
					if (sfx.isPlaying) sfx.stop();
					if ('setVolume' in sfx && typeof (sfx as any).setVolume === 'function') {
						(sfx as any).setVolume(this.sfxVolume);
					}
					if (this.currentWinSfx === sfx) this.currentWinSfx = null;
				}
			}, interval);
		} catch (e) {
			console.warn('[AudioManager] Failed to fade out win SFX:', e);
			try { if (sfx.isPlaying) sfx.stop(); } catch {}
			if (this.currentWinSfx === sfx) this.currentWinSfx = null;
		}
	}

	/**
	 * Play win dialog SFX based on dialog type
	 */
	playWinDialogSfx(dialogType: string): void {
		if (this.isMuted) return;
		let effect: SoundEffectType | null = null;
		const t = (dialogType || '').toLowerCase();

		switch (t) {
			case 'bigwin':
				effect = SoundEffectType.WIN_BIG; break;
			case 'megawin':
				effect = SoundEffectType.WIN_MEGA; break;
			case 'superwin':
				effect = SoundEffectType.WIN_SUPER; break;
			case 'epicwin':
				effect = SoundEffectType.WIN_EPIC; break;
			case 'maxwin':
				effect = SoundEffectType.MAX_WIN; break;
			case 'totalw_bz':
			case 'totalwin':
				effect = SoundEffectType.DIALOG_CONGRATS; break;
			default:
				break;
		}

		if (effect) {
			this.playSoundEffect(effect);
		}
	}

	/**
	 * Set sound effect volume
	 */
	setSfxVolume(volume: number): void {
		this.sfxVolume = Math.max(0, Math.min(1, volume));
		
		this.sfxInstances.forEach((sfx, type) => {
			const targetVolume = type === SoundEffectType.SPIN_CLICK
				? this.getSpinClickVolume()
				: this.sfxVolume;
			if ('setVolume' in sfx && typeof sfx.setVolume === 'function') {
				sfx.setVolume(targetVolume);
			}
		});
		
		console.log(`[AudioManager] Sound effect volume set to: ${this.sfxVolume}`);
	}

	private getSpinClickVolume(): number {
		const boosted = Math.max(this.sfxVolume * 1.8, this.musicVolume * 1.2);
		return Math.min(1.5, boosted);
	}

	/**
	 * Get sound effect volume
	 */
	getSfxVolume(): number {
		return this.sfxVolume;
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		console.log('[AudioManager] Destroying AudioManager...');
		this.stopAllMusic();
		this.musicInstances.clear();
		this.sfxInstances.clear();
		this.ambientInstance = null;
		console.log('[AudioManager] AudioManager destroyed');
	}

	/**
	 * Get current playing music type
	 */
	getCurrentMusicType(): MusicType | null {
		return this.currentMusic;
	}

	/**
	 * Check if any music is currently playing
	 */
	isMusicPlaying(): boolean {
		return this.currentMusic !== null && !this.isMuted;
	}
}


