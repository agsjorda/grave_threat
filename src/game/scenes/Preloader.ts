import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';
import { AssetConfig } from '../../config/AssetConfig';
import { AssetLoader } from '../../utils/AssetLoader';
import { GameAPI } from '../../backend/GameAPI';
import { GameData } from '../components/GameData';
import { FullScreenManager } from '../../managers/FullScreenManager';
import { ensureSpineFactory, ensureSpineLoader } from '../../utils/SpineGuard';
import { StudioLoadingScreen } from '../components/StudioLoadingScreen';
import { ClockDisplay } from '../components/ClockDisplay';
import { CLOCK_DISPLAY_NAME, GAME_DISPLAY_NAME, CLOCK_DISPLAY_CONFIG, PRELOADER_CONFIG, MAX_WIN_MULTIPLIER } from '../../config/GameConfig';
import { CurrencyManager } from '../components/CurrencyManager';
import { LOCALIZATION_DEFAULTS, PRELOADER_MAX_WIN } from '../../backend/LocalizationData';
import { localizationManager } from '../../managers/LocalizationManager';
import { unresolvedSpinManager } from '../../managers/UnresolvedSpinManager';
import { AudioManager } from '../../managers/AudioManager';

export class Preloader extends Scene
{
	private networkManager!: NetworkManager;
	private screenModeManager!: ScreenModeManager;
	private assetConfig!: AssetConfig;
	private assetLoader!: AssetLoader;
	private gameAPI!: GameAPI;
	private studio?: StudioLoadingScreen;
	private clockDisplay?: ClockDisplay;
	private preloaderVerticalOffsetModifier: number = PRELOADER_CONFIG.VERTICAL_OFFSET_MODIFIER;
	private bootProgressHandler?: (progress: number) => void;
	private initialBalance: number | null = null;
	private audioManager?: AudioManager;

	private buttonSpin?: Phaser.GameObjects.Image;
	private buttonBg?: Phaser.GameObjects.Image;
	private taglineText?: Phaser.GameObjects.Text;
	private websiteText?: Phaser.GameObjects.Text;
	private maxWinText?: Phaser.GameObjects.Text;
	private fullscreenBtn?: Phaser.GameObjects.Image;
	private preloaderCharacter: any = null;

	// Preloader character tweaks (BrittleJuiceForSpineMaxWinSpine)
	private preloaderCharacterXOffsetPx: number = 100;
	private preloaderCharacterYOffsetPx: number = 300;
	private preloaderCharacterScaleMultiplier: number = 1;
	private preloaderCharacterAngleOffsetDeg: number = -8;

	constructor ()
	{
		super('Preloader');
	}

	init (data: any)
	{
		// Check if add.spine is available - if not, reload the game
		const hasSpineFactory = ensureSpineFactory(this, '[Preloader] init');
		if (!hasSpineFactory) {
			console.error('[Preloader] add.spine is not recognized. Reloading the game...');
			setTimeout(() => {
				window.location.reload();
			}, 250);
			return;
		}

		// Receive managers from Boot scene
		this.networkManager = data.networkManager;
		this.screenModeManager = data.screenModeManager;
		
		// Initialize asset configuration
		this.assetConfig = new AssetConfig(this.networkManager, this.screenModeManager);
		this.assetLoader = new AssetLoader(this.assetConfig);
		
		// Initialize GameAPI
		const gameData = new GameData();
		this.gameAPI = new GameAPI(gameData);
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		
		this.cameras.main.setBackgroundColor(PRELOADER_CONFIG.BACKGROUND_COLOR);
		this.setupLoadingBackground();
		this.setupClock();
		this.setupLoadingFrameAndText();
		if (screenConfig.isPortrait) {
			this.setupPortraitUI(assetScale);
		}

		// Notify host page loader (if present) that Phaser boot loader can hide
		try {
			(window as any).hideBootLoader?.();
		} catch {}

		// Set up progress event listener (forward only to external listeners; studio/studio React handle bars)
		this.bootProgressHandler = (progress: number) => {
			EventBus.emit('progress', progress);
			try {
				(window as any).setBootLoaderProgress?.(0.25 + progress * 0.75);
			} catch {}
		};
		this.load.on('progress', this.bootProgressHandler as any);

		this.load.once('complete', () => {
			try {
				(window as any).setBootLoaderProgress?.(1);
			} catch {}
			// Detach this handler so subsequent background loads (audio) don't drive the boot progress UI.
			try {
				if (this.bootProgressHandler) {
					this.load.off('progress', this.bootProgressHandler as any);
					this.bootProgressHandler = undefined;
				}
			} catch {}
		});
		
		EventBus.emit('current-scene-ready', this);	
	}

	preload ()
	{
		// Prefer more parallel requests on modern networks
		this.load.maxParallelDownloads = Math.max(this.load.maxParallelDownloads, 8);
		// Show debug info
		this.assetConfig.getDebugInfo();

		
		// Load background and header assets (will be used in Game scene)
		this.assetLoader.loadBackgroundAssets(this);
		this.assetLoader.loadHeaderAssets(this);
		this.assetLoader.loadBonusHeaderAssets(this);
		this.assetLoader.loadSymbolAssets(this);
		this.assetLoader.loadButtonAssets(this);
		this.assetLoader.loadFontAssets(this);
		this.assetLoader.loadDialogAssets(this);
		// Load Scatter Anticipation spine (portrait/high only asset paths)
		this.assetLoader.loadScatterAnticipationAssets(this);
		this.assetLoader.loadBonusBackgroundAssets(this);
		this.assetLoader.loadNumberAssets(this);
		this.assetLoader.loadBuyFeatureAssets(this);
		this.assetLoader.loadMenuAssets(this);
		this.assetLoader.loadHelpScreenAssets(this);
		this.loadPreloaderTransitionAssets();
		// Whistle SFX for radial dimmer transition (Preloader → Game)
		const whistlePath = this.assetConfig.getAudioAssets().audio?.['whistle'];
		if (whistlePath) {
			this.load.audio('whistle', whistlePath);
		}

	}

	private startBackgroundAudioLoad(): void {
		try {
			const audioAssets = this.assetConfig.getAudioAssets();
			const audioMap = audioAssets.audio || {};
			const entries = Object.entries(audioMap);
			if (entries.length === 0) return;

			let queued = 0;
			for (const [key, path] of entries) {
				try {
					if ((this.cache.audio as any)?.exists?.(key)) continue;
				} catch {
					// If we can't check the cache, still attempt to queue.
				}
				try {
					this.load.audio(key, path);
					queued++;
				} catch {}
			}

			if (queued <= 0) return;


			this.load.once('complete', () => {
			});

			this.load.start();
		} catch (e) {
			console.warn('[Preloader] Failed to start background audio load:', e);
		}
	}

    async create ()
    {
		try {
			const demoState = this.gameAPI.getDemoState();
		} catch (error) {
			console.error('[Preloader] Failed to get demo state:', error);
		}

		// Initialize GameAPI, generate token, and call backend initialize endpoint (skip slot init in demo)
        try {
            const gameToken = await this.gameAPI.initializeGame();

			// Replay mode: fetch the recorded transaction before any other backend calls so
			// downstream consumers (Game scene, ClockDisplay, balance UI) can read it synchronously.
			try {
				await this.gameAPI.initReplayData();
				if (this.gameAPI.getReplayState()) {
					this.updateClockForReplay();
				}
			} catch (replayErr) {
				console.warn('[Preloader] initReplayData failed:', replayErr);
			}

			const isReplay = this.gameAPI.getReplayState();
			const isDemo = this.gameAPI.getDemoState();
			if (!isDemo && !isReplay) {
				const slotInitData = await this.gameAPI.initializeSlotSession();
				unresolvedSpinManager.setFromInitializationData(slotInitData);
				CurrencyManager.initializeFromInitData(slotInitData);
			} else {
				unresolvedSpinManager.setFromInitializationData(null);
			}

			try {
				await this.gameAPI.fetchLocalizationData();
				const localizationData = this.gameAPI.getLocalizationData();
				const locale = localizationData?.locale ?? '';
				if (locale.length > 0) {
					localizationManager.setTranslations(locale);
				} else {
					localizationManager.setTranslations(JSON.stringify(LOCALIZATION_DEFAULTS));
				}
			} catch (localizationError) {
				console.warn('[Preloader] Localization fetch failed, using defaults:', localizationError);
				localizationManager.setTranslations(JSON.stringify(LOCALIZATION_DEFAULTS));
			}
			this.refreshLocalizedPreloaderText();
			// shuten_doji parity: reveal after locale + maxWin source (init or localization API / config fallback).
			this.revealPreloaderMaxWinText();

			const initialBalance = Number(await this.gameAPI.initializeBalance());
			// `-1` is the replay-mode sentinel — propagate it so the Game scene does not
			// re-call initializeBalance(). Any other negative value is treated as invalid.
			if (Number.isFinite(initialBalance) && (initialBalance >= 0 || initialBalance === -1)) {
				this.initialBalance = initialBalance;
			} else {
				console.warn('[Preloader] Initial balance was invalid, Game scene will fall back to its own initialization.', {
					initialBalance
				});
			}

        } catch (error) {
            console.error('[Preloader] Failed to initialize GameAPI or slot session:', error);
			localizationManager.setTranslations(JSON.stringify(LOCALIZATION_DEFAULTS));
			this.refreshLocalizedPreloaderText();
			this.revealPreloaderMaxWinText();
        }

		// Create fullscreen toggle now that assets are loaded (using shared manager)
        const assetScale = this.networkManager.getAssetScale();
        this.fullscreenBtn = FullScreenManager.addToggle(this, {
            margin: PRELOADER_CONFIG.FULLSCREEN_MARGIN_BASE * assetScale,
            iconScale: PRELOADER_CONFIG.FULLSCREEN_ICON_SCALE_BASE * assetScale,
            depth: 10000,
            maximizeKey: 'maximize',
            minimizeKey: 'minimize'
        });

        if (this.buttonSpin) {
            this.buttonSpin.clearTint();
            this.buttonSpin.setAlpha(1);
            this.buttonSpin.setInteractive({ useHandCursor: true });
        }
        if (this.buttonBg) {
            this.buttonBg.clearTint();
            this.buttonBg.setAlpha(1);
        }

		// Start game on click – play the bat transition then start Game
        this.buttonSpin?.once('pointerdown', () => {
			// Attempt to unlock audio on the same gesture that starts the transition.
			try { (this.sound as any)?.unlock?.(); } catch {}
			try {
				const ctx: any = (this.sound as any)?.context;
				if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
					ctx.resume();
				}
			} catch {}

			if (!this.audioManager) {
				this.audioManager = new AudioManager(this);
				(window as any).audioManager = this.audioManager;
			}

			this.playBatTransitionThenStartGame();
        });

		// Start loading audio in the background now that the main visual load is complete.
		// If the user clicks early and this scene stops, Game scene will fall back to loading audio again.
		this.startBackgroundAudioLoad();

		this.applyPreloaderFonts();
	}

	private loadPreloaderTransitionAssets(): void {
		if (!ensureSpineLoader(this, '[Preloader] loadPreloaderTransitionAssets')) return;

		try {
			this.load.audio('bats_transition_GT', 'assets/sounds/SFX/bats_transition_GT.ogg');

			const anyLoad: any = this.load as any;
			if (typeof anyLoad.spine === 'function') {
				anyLoad.spine(
					'Bat_Transition_GT',
					'assets/portrait/high/vfx/Bat_Transition_GT.json',
					'assets/portrait/high/vfx/Bat_Transition_GT.atlas',
					true
				);
			} else {
				this.load.spineAtlas('Bat_Transition_GT-atlas', 'assets/portrait/high/vfx/Bat_Transition_GT.atlas');
				this.load.spineJson('Bat_Transition_GT', 'assets/portrait/high/vfx/Bat_Transition_GT.json');
			}
		} catch (e) {
			console.warn('[Preloader] Failed to load bat transition assets:', e);
		}
	}

	private startGameScene(options?: {
		initialFadeInDurationMs?: number;
	}): void {
		this.scene.start('Game', {
			networkManager: this.networkManager,
			screenModeManager: this.screenModeManager,
			gameAPI: this.gameAPI,
			initialBalance: this.initialBalance,
			initialFadeInDurationMs: options?.initialFadeInDurationMs,
			audioManager: this.audioManager,
		});
	}

	private coverPreloaderWithBlack(): Phaser.GameObjects.Rectangle {
		return this.add.rectangle(
			this.scale.width * 0.5,
			this.scale.height * 0.5,
			this.scale.width,
			this.scale.height,
			0x000000
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100001).setAlpha(1);
	}

	private playBatTransitionThenStartGame(): void {
		if (!ensureSpineFactory(this, '[Preloader] playBatTransitionThenStartGame')) {
			this.startGameScene();
			return;
		}

		try {
			const batTransition: any = this.add.spine(
				this.scale.width * 0.5,
				this.scale.height * 0.5,
				'Bat_Transition_GT',
				'Bat_Transition_GT-atlas'
			);

			if (this.cache.audio.exists('bats_transition_GT')) {
				this.sound.play('bats_transition_GT');
			}

			batTransition.setDepth(100000);
			batTransition.setScale(Math.max(this.scale.width / 428, this.scale.height / 926));

			let completed = false;
			const finish = () => {
				if (completed) return;
				completed = true;
				const blackCover = this.coverPreloaderWithBlack();
				try { batTransition.destroy(); } catch {}
				this.startGameScene({
					initialFadeInDurationMs: 2000
				});
				this.events.once('shutdown', () => {
					try { blackCover.destroy(); } catch {}
				});
			};

			const entry = batTransition?.animationState?.setAnimation?.(0, 'Bat_Transition_GT_Anim', false);
			if (batTransition?.animationState?.addListener && entry) {
				const listener = {
					complete: (completedEntry: any) => {
						if (completedEntry !== entry) return;
						try { batTransition.animationState.removeListener(listener); } catch {}
						finish();
					}
				};
				batTransition.animationState.addListener(listener);
			}

			this.time.delayedCall(1700, finish);
		} catch (e) {
			console.warn('[Preloader] Failed to play bat transition, starting game directly:', e);
			this.startGameScene();
		}
	}

	private setupLoadingBackground(): void {
		const background = this.add.image(
			this.scale.width * 0.5,
			this.scale.height * 0.5,
			'loading_background'
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(0);
		const scale = Math.max(this.scale.width / background.width, this.scale.height / background.height);
		background.setScale(scale);

		// BrittleJuiceForSpineMaxWinSpine: 1 depth above the loading background
		try {
			const key = 'BrittleJuiceForSpineMaxWinSpine';
			if (this.cache.json.has(key) && ensureSpineFactory(this, '[Preloader] BrittleJuiceForSpineMaxWinSpine')) {
				this.preloaderCharacter = (this.add as any).spine(
					this.scale.width * 0.5 + this.preloaderCharacterXOffsetPx,
					this.scale.height * 0.5 + this.preloaderCharacterYOffsetPx,
					key,
					`${key}-atlas`,
				);
				this.preloaderCharacter.setOrigin?.(0.5, 0.5);
				this.preloaderCharacter.setDepth(background.depth + 1);
				try {
					this.preloaderCharacter.setAngle?.(this.preloaderCharacterAngleOffsetDeg);
				} catch {}
				try {
					const rawW = this.preloaderCharacter.width || this.preloaderCharacter.skeleton?.data?.width || 1;
					const rawH = this.preloaderCharacter.height || this.preloaderCharacter.skeleton?.data?.height || 1;
					const m = Number(this.preloaderCharacterScaleMultiplier) || 1;
					const s = Math.max(this.scale.width / rawW, this.scale.height / rawH) * m;
					this.preloaderCharacter.setScale?.(s, s);
				} catch {}
				try {
					const state = this.preloaderCharacter.animationState || this.preloaderCharacter.spine?.animationState;
					// Prefer "idle" if it exists; fall back to "animation" or the first available animation.
					const data = this.preloaderCharacter?.skeleton?.data || this.preloaderCharacter?.skeletonData;
					const anims: any[] = Array.isArray(data?.animations) ? data.animations : [];
					const names = anims.map((a: any) => String(a?.name || '')).filter(Boolean);
					const pick =
						(names.includes('idle') && 'idle') ||
						(names.includes('animation') && 'animation') ||
						(names[0] || 'idle');
					state?.setAnimation?.(0, pick, true);
				} catch {}
			}
		} catch (e) {
			console.warn('[Preloader] Failed to create BrittleJuiceForSpineMaxWinSpine:', e);
			this.preloaderCharacter = null;
		}

		// Header logo at top of loading screen
		if (this.textures.exists('preload_logo')) {
			const logoX = this.scale.width * 0.5;
			const logoY = this.scale.height * 0.2; // change 0.2 to adjust y position of the logo
			const headerLogo = this.add.image(logoX, logoY, 'preload_logo')
				.setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(5);
			const maxWidth = this.scale.width * 0.85;
			if (headerLogo.width > maxWidth) {
				headerLogo.setScale(maxWidth / headerLogo.width);
			}
		}
	}

	private setupClock(): void {
		const isReplay = !!this.gameAPI?.getReplayState?.();
		this.clockDisplay = new ClockDisplay(this, {
			...CLOCK_DISPLAY_CONFIG,
			suffixText: isReplay
				? this.getReplayClockText()
				: ` | ${GAME_DISPLAY_NAME}${this.gameAPI.getDemoState() ? ' | DEMO' : ''}`,
			showClock: !isReplay,
			additionalText: CLOCK_DISPLAY_NAME,
		});
		this.clockDisplay.create();
		if (isReplay) {
			this.startReplayClockTitleRetry();
		}
	}

	/**
	 * Build the two-line replay clock label: `<Game> | Replay\nID: ${round_id}`.
	 * Falls back to `...` when replayData has not arrived yet.
	 */
	private getReplayClockText(): string {
		const roundId = this.gameAPI?.getReplayData?.()?.round_id;
		const idPart =
			roundId === undefined || roundId === null || String(roundId).trim() === ''
				? '...'
				: String(roundId);
		return `${GAME_DISPLAY_NAME} | Replay\nID: ${idPart}`;
	}

	/**
	 * Update the clock label immediately (used after initReplayData() resolves).
	 */
	private updateClockForReplay(): void {
		try {
			this.clockDisplay?.setSuffixText?.(this.getReplayClockText());
		} catch {}
	}

	private replayClockRetryTimer?: Phaser.Time.TimerEvent;
	/**
	 * Poll every 100ms until replayData.round_id is available so the static replay label
	 * stops showing the `...` placeholder.
	 */
	private getPreloaderMaxWinMultiplierDisplay(): string {
		const mult = this.gameAPI.getMaxWin() ?? MAX_WIN_MULTIPLIER;
		return mult.toLocaleString() + 'x';
	}

	private updatePreloaderMaxWinLine(): void {
		if (!this.maxWinText) {
			return;
		}
		const winUpToLabel =
			localizationManager.getTextByKey(PRELOADER_MAX_WIN) ??
			LOCALIZATION_DEFAULTS[PRELOADER_MAX_WIN] ??
			'Win up to';
		const multiplierStr = this.getPreloaderMaxWinMultiplierDisplay();
		this.maxWinText.setText(`${winUpToLabel} ${multiplierStr}`);
	}

	private revealPreloaderMaxWinText(): void {
		this.updatePreloaderMaxWinLine();
		this.maxWinText?.setAlpha(1);
	}

	private refreshLocalizedPreloaderText(): void {
		if (this.gameAPI.getReplayState()) {
			this.updateClockForReplay();
			this.updatePreloaderMaxWinLine();
			return;
		}
		this.updatePreloaderMaxWinLine();
	}

	private startReplayClockTitleRetry(): void {
		this.replayClockRetryTimer?.destroy();
		this.replayClockRetryTimer = this.time.addEvent({
			delay: 100,
			loop: true,
			callback: () => {
				const id = this.gameAPI?.getReplayData?.()?.round_id;
				if (id !== undefined && id !== null && String(id).trim().length > 0) {
					this.updateClockForReplay();
					try { this.replayClockRetryTimer?.destroy(); } catch {}
					this.replayClockRetryTimer = undefined;
				}
			}
		});
		this.events.once('shutdown', () => {
			try { this.replayClockRetryTimer?.destroy(); } catch {}
			this.replayClockRetryTimer = undefined;
		});
	}

	private setupLoadingFrameAndText(): void {
		const preload = PRELOADER_CONFIG;
		const { TAGLINE, WEBSITE, MAX_WIN } = preload;
		const centerX = this.scale.width * 0.5;
		const centerY = this.scale.height * 0.5;
		const textStyle = { fontFamily: 'poppins-regular', color: '#FFFFFF', fontStyle: 'normal' as const, align: 'center' as const };

		// Match pastry_cub: build the loading frame and lower branding text directly
		// in Preloader too, so portrait still shows the expected branding even if the
		// StudioLoadingScreen layer is unavailable or delayed.
		const loadingFrame = this.add.image(
			this.scale.width * 0.5,
			this.scale.height * 0.5 + preload.LOADING_FRAME_OFFSET_Y,
			'loading_frame_2'
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(10);
		const frameScale = (Math.max(this.scale.width / loadingFrame.width, this.scale.height / loadingFrame.height)) * preload.LOADING_FRAME_SCALE_MODIFIER;
		loadingFrame.setScale(frameScale);

		this.taglineText = this.add.text(centerX + TAGLINE.OFFSET_X, centerY + TAGLINE.OFFSET_Y, TAGLINE.TEXT, { ...textStyle, fontSize: `${TAGLINE.FONT_SIZE_PX}px` })
			.setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(1).setDepth(10);
		this.websiteText = this.add.text(centerX, centerY + WEBSITE.OFFSET_Y, WEBSITE.TEXT, { ...textStyle, fontSize: `${WEBSITE.FONT_SIZE_PX}px` })
			.setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(1).setDepth(10);

		const winTextY = MAX_WIN.OFFSET_Y_FROM_CENTER + this.preloaderVerticalOffsetModifier;
		this.maxWinText = this.add.text(centerX, centerY + winTextY, MAX_WIN.TEXT, {
			fontFamily: 'poppins-bold',
			fontSize: `${MAX_WIN.FONT_SIZE_PX}px`,
			color: '#FFFFFF',
			align: 'center',
		}).setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(0).setDepth(1000);
		this.tweens.add({
			targets: this.maxWinText,
			scale: { from: MAX_WIN.BREATHING_SCALE_FROM, to: MAX_WIN.BREATHING_SCALE_TO },
			duration: MAX_WIN.BREATHING_DURATION_MS,
			ease: 'Sine.easeInOut',
			yoyo: true,
			repeat: -1,
			hold: 0,
			delay: 0,
		});
		this.maxWinText.setStroke('#379557', 4).setShadow(0, 2, '#000000', 4, true, true);
	}

	private setupPortraitUI(assetScale: number): void {
		const preload = PRELOADER_CONFIG;
		this.studio = new StudioLoadingScreen(this, {
			loadingFrameOffsetX: 0,
			loadingFrameOffsetY: preload.LOADING_FRAME_OFFSET_Y,
			loadingFrameScaleModifier: preload.LOADING_FRAME_SCALE_MODIFIER,
			text: preload.TAGLINE.TEXT,
			textOffsetX: preload.TAGLINE.OFFSET_X,
			textOffsetY: preload.TAGLINE.OFFSET_Y,
			textScale: 1,
			textColor: '#FFFFFF',
			text2: preload.WEBSITE.TEXT,
			text2OffsetX: 0,
			text2OffsetY: preload.WEBSITE.OFFSET_Y,
			text2Scale: 1,
			text2Color: '#FFFFFF',
		});
		this.studio.show();
		this.events.once('studio-fade-complete', () => {});

		const buttonY = this.scale.height * preload.BUTTON_Y_RATIO;
		const centerX = this.scale.width * 0.5;
		this.buttonBg = this.add.image(centerX, buttonY, 'button_bg').setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		this.buttonSpin = this.add.image(centerX, buttonY, 'button_spin').setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		this.buttonSpin.setTint(0x777777).setAlpha(0.9);
		this.buttonBg.setTint(0x777777).setAlpha(0.9);
		this.buttonSpin.disableInteractive();
		this.tweens.add({
			targets: this.buttonSpin,
			rotation: Math.PI * 2,
			duration: preload.SPIN_BUTTON_ROTATION_DURATION_MS,
			repeat: -1,
		});
	}

	/** Apply Poppins font families to all preloader text (once fonts are ready or as fallback). */
	private applyPreloaderFonts(): void {
		const apply = () => {
			this.taglineText?.setFontFamily('poppins-regular');
			this.websiteText?.setFontFamily('poppins-regular');
			this.maxWinText?.setFontFamily('poppins-bold');
		};
		const fontsObj: any = (document as any).fonts;
		if (fontsObj && typeof fontsObj.ready?.then === 'function') {
			fontsObj.ready.then(apply).catch(apply);
		} else {
			apply();
		}
	}
}
