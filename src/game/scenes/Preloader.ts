import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';
import { AssetConfig } from '../../config/AssetConfig';
import { AssetLoader } from '../../utils/AssetLoader';
import { GameAPI } from '../../backend/GameAPI';
import { GameData } from '../components/GameData';
import { FullScreenManager } from '../../managers/FullScreenManager';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { StudioLoadingScreen } from '../components/StudioLoadingScreen';
import { ClockDisplay } from '../components/ClockDisplay';
import { CLOCK_DISPLAY_NAME, GAME_DISPLAY_NAME, CLOCK_DISPLAY_CONFIG, PRELOADER_CONFIG } from '../../config/GameConfig';
import { CurrencyManager } from '../components/CurrencyManager';
import { playRadialDimmerTransition } from '../utils/playRadialDimmerTransition';
import { unresolvedSpinManager } from '../../managers/UnresolvedSpinManager';

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

	private buttonSpin?: Phaser.GameObjects.Image;
	private buttonBg?: Phaser.GameObjects.Image;
	private taglineText?: Phaser.GameObjects.Text;
	private websiteText?: Phaser.GameObjects.Text;
	private maxWinText?: Phaser.GameObjects.Text;
	private fullscreenBtn?: Phaser.GameObjects.Image;

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
		
		console.log(`[Preloader] Applying asset scale: ${assetScale}x`);
		
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
		// Whistle SFX for radial dimmer transition (Preloader → Game)
		const whistlePath = this.assetConfig.getAudioAssets().audio?.['whistle'];
		if (whistlePath) {
			this.load.audio('whistle', whistlePath);
		}

		console.log(`[Preloader] Loading assets for Preloader and Game scenes`);
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

			console.log(`[Preloader] Background-loading ${queued} audio files (non-blocking for StudioLoading)`);

			this.load.once('complete', () => {
				console.log('[Preloader] Background audio load complete');
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
			console.log('[Preloader] Demo state:', demoState);
		} catch (error) {
			console.error('[Preloader] Failed to get demo state:', error);
		}

		// Initialize GameAPI, generate token, and call backend initialize endpoint (skip slot init in demo)
        try {
            console.log('[Preloader] Initializing GameAPI...');
            const gameToken = await this.gameAPI.initializeGame();
            console.log('[Preloader] Game URL Token:', gameToken);

			const isDemo = this.gameAPI.getDemoState();
			if (!isDemo) {
				console.log('[Preloader] Calling backend slot initialization...');
				const slotInitData = await this.gameAPI.initializeSlotSession();
				console.log('[Preloader] Slot initialization data:', slotInitData);
				unresolvedSpinManager.setFromInitializationData(slotInitData);
				CurrencyManager.initializeFromInitData(slotInitData);
			} else {
				console.log('[Preloader] Demo mode active - skipping backend slot initialization');
				unresolvedSpinManager.setFromInitializationData(null);
			}

            console.log('[Preloader] GameAPI and slot session initialized successfully!');
        } catch (error) {
            console.error('[Preloader] Failed to initialize GameAPI or slot session:', error);
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

		// Start game on click – use radial dimmer transition then start Game
        this.buttonSpin?.once('pointerdown', () => {
            playRadialDimmerTransition(this, () => {
                console.log('[Preloader] Starting Game scene after radial dimmer');
                this.scene.start('Game', {
                    networkManager: this.networkManager,
                    screenModeManager: this.screenModeManager,
                    gameAPI: this.gameAPI
                });
            });
        });

		// Start loading audio in the background now that the main visual load is complete.
		// If the user clicks early and this scene stops, Game scene will fall back to loading audio again.
		this.startBackgroundAudioLoad();

		this.applyPreloaderFonts();
	}

	private setupLoadingBackground(): void {
		const background = this.add.image(
			this.scale.width * 0.5,
			this.scale.height * 0.5,
			'loading_background'
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(0);
		const scale = Math.max(this.scale.width / background.width, this.scale.height / background.height);
		background.setScale(scale);
		console.log(`[Preloader] Background scale: ${scale}, canvas: ${this.scale.width}x${this.scale.height}`);

		// Header logo at top of loading screen
		if (this.textures.exists('header_logo')) {
			const logoX = this.scale.width * 0.5;
			const logoY = this.scale.height * 0.12;
			const headerLogo = this.add.image(logoX, logoY, 'header_logo')
				.setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(5);
			const maxWidth = this.scale.width * 0.85;
			if (headerLogo.width > maxWidth) {
				headerLogo.setScale(maxWidth / headerLogo.width);
			}
		}
	}

	private setupClock(): void {
		this.clockDisplay = new ClockDisplay(this, {
			...CLOCK_DISPLAY_CONFIG,
			suffixText: ` | ${GAME_DISPLAY_NAME}${this.gameAPI.getDemoState() ? ' | DEMO' : ''}`,
			additionalText: CLOCK_DISPLAY_NAME,
		});
		this.clockDisplay.create();
	}

	private setupLoadingFrameAndText(): void {
		const preload = PRELOADER_CONFIG;
		const loadingFrame = this.add.image(
			this.scale.width * 0.5,
			this.scale.height * 0.5 + preload.LOADING_FRAME_OFFSET_Y,
			'loading_frame_2'
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(10);
		const frameScale = (Math.max(this.scale.width / loadingFrame.width, this.scale.height / loadingFrame.height)) * preload.LOADING_FRAME_SCALE_MODIFIER;
		loadingFrame.setScale(frameScale);

		const { TAGLINE, WEBSITE, MAX_WIN } = preload;
		const centerX = this.scale.width * 0.5;
		const centerY = this.scale.height * 0.5;
		const textStyle = { fontFamily: 'poppins-regular', color: '#FFFFFF', fontStyle: 'normal' as const, align: 'center' as const };

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
		}).setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(1).setDepth(10);
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
		console.log(`[Preloader] Button scaling: ${assetScale}x`);
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
