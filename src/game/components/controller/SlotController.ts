import { Scene } from "phaser";
import { NetworkManager } from "../../../managers/NetworkManager";
import { ScreenModeManager } from "../../../managers/ScreenModeManager";
import { EventBus } from "../../EventBus";
import { GameData, setSpeed } from "../GameData";
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';
import { DELAY_BETWEEN_SPINS, LOADING_SPINNER_ENABLED, LOADING_SPINNER_SIMULATE_MIN_DISPLAY_MS, SHOW_BUTTON_HITBOXES, GRID_CENTER_X_RATIO, GRID_CENTER_X_OFFSET_PX, GRID_CENTER_Y_RATIO, GRID_CENTER_Y_OFFSET_PX } from '../../../config/GameConfig';
import { GameAPI } from '../../../backend/GameAPI';
import { SpinData, SpinDataUtils } from '../../../backend/SpinData';
import { Symbols } from '../symbols/index';
import { SoundEffectType } from '../../../managers/AudioManager';
import { LoadingSpinner } from '../LoadingSpinner';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { startAnimation, startAnimationWithEntry } from '../../../utils/SpineAnimationHelper';
import { AmplifyBetController } from './AmplifyBetController';
import { TurboButtonController } from './TurboButtonController';
import { MenuButtonController } from './MenuButtonController';
import { BuyFeatureController } from './BuyFeatureController';
import { BalanceController } from './BalanceController';
import { CurrencyManager } from '../CurrencyManager';
import { formatCurrencyNumber } from '../../../utils/NumberPrecisionFormatter';
import { localizationManager } from "../../../managers/LocalizationManager";
import * as LK from "../../../backend/LocalizationData";
import { 
	BetController, 
	AutoplayController, 
	SpinButtonController 
} from './index';

export class SlotController {
	private controllerContainer!: Phaser.GameObjects.Container;
	private controllerVerticalOffset: number = 0;
	// Horizontal offset for SlotController container
	private controllerHorizontalOffset: number = 0;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private scene: Scene | null = null;
	private gameData: GameData | null = null;
	private gameAPI: GameAPI | null = null;
	private symbols: Symbols | null = null;
	private buttons: Map<string, Phaser.GameObjects.Image> = new Map();
	
	// Controller modules
	private betController!: BetController;
	private autoplayController!: AutoplayController;
	private spinButtonController!: SpinButtonController;
	
	// Properties still needed (not yet migrated to controllers)
	private spinButtonAnimation: any = null;
	private freeRoundSpinButtonAnimation: any = null;
	private spinIcon!: Phaser.GameObjects.Image;
	private spinIconTween: Phaser.Tweens.Tween | null = null;
	private autoplayStopIcon!: Phaser.GameObjects.Image;
	private autoplayButtonAnimation: any = null;
	private autoplaySpinsRemainingText!: Phaser.GameObjects.Text;
	private baseBetAmount: number = 0.2;
	private betAmountText!: Phaser.GameObjects.Text;
	private betLabelText!: Phaser.GameObjects.Text;
	
	// UI elements not managed by controllers
	private featureAmountText!: Phaser.GameObjects.Text;
	private featureDollarText!: Phaser.GameObjects.Text;
	private featureLabelText: Phaser.GameObjects.Text | null = null;
	private featureLabelContainer: Phaser.GameObjects.Container | null = null;
	private featureButtonHitbox: Phaser.GameObjects.Rectangle | null = null;
	private featureButtonAmountOverride: number | null = null;
	private primaryControllers!: Phaser.GameObjects.Container;
	private controllerTexts: Phaser.GameObjects.Text[] = [];
	private freeSpinLabel!: Phaser.GameObjects.Text;
	private freeSpinNumber!: Phaser.GameObjects.Text;
	private freeSpinSubLabel!: Phaser.GameObjects.Text;
	
	// UI override for free spin remaining display
	private freeSpinDisplayOverride: number | null = null;
	private pendingFreeSpinsData: { scatterIndex: number; actualFreeSpins: number; isRetrigger?: boolean; fromUnresolvedSpin?: boolean } | null = null;
	private pendingFakeDataRetriggerNextSpinsLeft: number | null = null;
	private pendingFakeDataRetriggerAdded: number | null = null;
	private freeSpinAutoplaySimInFlight: boolean = false;
	
	private balanceController: BalanceController | null = null;
	private pendingSpinUntilBalanceReady: boolean = false;
	
	private turboButtonController!: TurboButtonController;
	private menuButtonController!: MenuButtonController;
	
	// Loading spinner for when API requests take > 2 seconds (after symbols clear)
	private loadingSpinner: LoadingSpinner | null = null;
	
	// When true, prevent the free spin display from being shown (e.g., after congrats)
	private freeSpinDisplaySuppressed: boolean = false;
	
	// For free spin autoplay UI sync: subtract 1 from server value for current spin
	private shouldSubtractOneFromServerFsDisplay: boolean = false;
	private uiFsDecrementApplied: boolean = false;
	
	// Flag to track if we're in buy feature free spins and waiting for TotalWin dialog
	private isBuyFeatureFreeSpinsActive: boolean = false;
	
	private buyFeatureController!: BuyFeatureController;

	private getLocalizedText(key: string): string {
		return localizationManager.getTextByKey(key) ?? LK.LOCALIZATION_DEFAULTS[key] ?? key;
	}

	private rebuildFeatureLabel(): void {
		if (!this.scene) return;
		if (!this.featureLabelContainer) return;

		const scene = this.scene;
		const featureX = scene.scale.width * 0.5;
		const featureY = scene.scale.height * 0.724;
		const isDemo = this.gameAPI?.getDemoState();

		this.featureLabelContainer.removeAll(true);

		const buyText = this.getLocalizedText(LK.CONTROLLER_BUY_FEATURE);
		const currencyCode = isDemo ? '' : CurrencyManager.getCurrencyCode();

		let currentX = 0;

		// "BUY" - white, poppins-bold
		const buyWordText = scene.add.text(
			currentX,
			0,
			buyText,
			{
				fontSize: '12px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0, 0.5);
		this.featureLabelContainer.add(buyWordText);
		currentX += buyWordText.width;

		// Add currency code in parentheses if available
		if (currencyCode) {
			const leftParenText = scene.add.text(
				currentX,
				0,
				' (',
				{
					fontSize: '12px',
					color: '#ffffff',
					fontFamily: 'poppins-regular'
				}
			).setOrigin(0, 0.5);
			this.featureLabelContainer.add(leftParenText);
			currentX += leftParenText.width;

			const currencyText = scene.add.text(
				currentX,
				0,
				currencyCode,
				{
					fontSize: '12px',
					color: '#ffffff',
					fontFamily: 'poppins-regular'
				}
			).setOrigin(0, 0.5);
			this.featureLabelContainer.add(currencyText);
			currentX += currencyText.width;

			const rightParenText = scene.add.text(
				currentX,
				0,
				')',
				{
					fontSize: '12px',
					color: '#ffffff',
					fontFamily: 'poppins-regular'
				}
			).setOrigin(0, 0.5);
			this.featureLabelContainer.add(rightParenText);
			currentX += rightParenText.width;
		}

		// Center the container by adjusting its position
		this.featureLabelContainer.setX(featureX - currentX / 2);
		this.featureLabelContainer.setY(featureY - 8);
	}
	private hasScatterRetriggerInSpinData(): boolean {
		try {
			if (!gameStateManager.isBonus) return false;
			const spinData = this.gameAPI?.getCurrentSpinData() || (this.scene as any)?.symbols?.currentSpinData;
			const area = spinData?.slot?.area;
			if (!Array.isArray(area)) return false;
			let scatterCount = 0;
			for (const col of area) {
				if (!Array.isArray(col)) continue;
				for (const v of col) {
					if (v === 0) scatterCount++;
				}
			}
			return scatterCount >= 3;
		} catch {
			return false;
		}
	}

	// Keep UI controls locked during buy feature flow or its free spins sequence.
	private isBuyFeatureControlsLocked(): boolean {
		return this.buyFeatureController.isSpinLocked() || this.isBuyFeatureFreeSpinsActive;
	}
	
	private amplifyBetController!: AmplifyBetController;
	
	// Flag to prevent amplify bet reset during internal bet changes
	private isInternalBetChange: boolean = false;

	// Feature button enable guard: only allow enabling after explicit setBonusMode(false)
	private canEnableFeatureButton: boolean = true;
	
	// When true, current autoplay session is a dedicated "freeround autoplay"
	private isFreeRoundAutoplay: boolean = false;
	// Cached base-game autoplay spins used when a scatter-triggered bonus pauses autoplay.
	private pausedAutoplaySpinsRemaining: number | null = null;
	// Single retry timer used when paused autoplay resume is blocked by transient state.
	private resumePausedAutoplayRetryTimer: Phaser.Time.TimerEvent | null = null;
	// Flag to track if we need to re-enable spin button after first autoplay spin in normal mode
	private shouldReenableSpinButtonAfterFirstAutoplay: boolean = false;
	// Throttle API spin requests to prevent spam
	private lastSpinRequestAt: number = 0;
	private readonly spinRequestMinIntervalMs: number = 200;
	// Local lock to prevent rapid spin re-entry before reel state updates
	private isSpinLocked: boolean = false;
	// Prevent re-enabling spin while win animations are pending
	private pendingWinLock: boolean = false;
	// Guard to ensure balance API is called only once per spin (REELS_STOP can fire multiple times: Symbols + WinLineDrawer)
	private balanceApiCalledThisSpin: boolean = false;
	// Guard so bonus total is credited once when TotalWin appears
	private hasFinalizedBonusBalanceForCurrentRound: boolean = false;
	// Set when TotalWin is shown; consumed when that dialog fully closes.
	private pendingTotalWinBalanceFinalize: boolean = false;

	// Debug: visualize button hitboxes (red outlines); default from GameConfig.SHOW_BUTTON_HITBOXES
	private showButtonHitboxes: boolean = SHOW_BUTTON_HITBOXES;
	private buttonHitboxGraphics: Phaser.GameObjects.Graphics | null = null;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
		
		this.buyFeatureController = new BuyFeatureController({
			getGameData: () => this.getGameData(),
			getScene: () => this.scene,
			getGameAPI: () => this.gameAPI,
			getBalanceAmount: () => this.getBalanceAmount(),
			updateBalanceAmount: (balance: number) => this.updateBalanceAmount(balance),
			updateBetAmount: (bet: number) => this.updateBetAmount(bet),
			setFeatureButtonAmountOverride: (amount: number | null) => this.setFeatureButtonAmountOverride(amount),
			enableSpinButton: () => this.enableSpinButton(),
			enableAutoplayButton: () => this.enableAutoplayButton(),
			enableFeatureButton: () => this.enableFeatureButton(),
			enableBetButtons: () => this.enableBetButtons(),
			enableAmplifyButton: () => this.enableAmplifyButton(),
			enableTurboButton: () => this.enableTurboButton(),
			disableSpinButton: () => this.disableSpinButton(),
			disableAutoplayButton: () => this.disableAutoplayButton(),
			disableFeatureButton: () => this.disableFeatureButton(),
			disableBetButtons: () => this.disableBetButtons(),
			disableAmplifyButton: () => this.disableAmplifyButton(),
			disableTurboButton: () => this.disableTurboButton(),
			enableBetBackgroundInteraction: (reason: string) => this.enableBetBackgroundInteraction(reason),
			disableBetBackgroundInteraction: (reason: string) => this.disableBetBackgroundInteraction(reason),
			showOutOfBalancePopup: () => this.showOutOfBalancePopup(),
			updateSpinButtonState: () => this.updateSpinButtonState(),
		});
		
		// Listen for autoplay state changes
		this.setupAutoplayEventListeners();
	}

	/**
	 * Set the loading spinner (e.g. from Game scene so it's on the correct display list).
	 * Call before create() if the scene creates the spinner.
	 */
	public setLoadingSpinner(spinner: LoadingSpinner): void {
		this.loadingSpinner = spinner;
	}

	/**
	 * Initialize the loading spinner if not already set by the scene
	 */
	private initializeLoadingSpinner(): void {
		if (!this.scene) {
			console.warn('[SlotController] Cannot initialize spinner - scene not set');
			return;
		}
		if (this.loadingSpinner) {
			// Already set by Game scene – position at reel center
			const centerX = this.scene.scale.width * GRID_CENTER_X_RATIO + GRID_CENTER_X_OFFSET_PX;
			const centerY = this.scene.scale.height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX;
			this.loadingSpinner.updatePosition(centerX, centerY);
			return;
		}

		const centerX = this.scene.scale.width * GRID_CENTER_X_RATIO + GRID_CENTER_X_OFFSET_PX;
		const centerY = this.scene.scale.height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX;
		this.loadingSpinner = new LoadingSpinner(this.scene, centerX, centerY);
	}

	/**
	 * Hide the spinner (call when data is received)
	 */
	private hideSpinner(): void {
		if (!this.loadingSpinner) {
			return;
		}
		this.loadingSpinner.hide();
	}

	private showOutOfBalancePopup(message?: string): void {
		const scene = this.scene as Scene | null;
		if (!scene) return;
		import('../OutOfBalancePopup').then(module => {
			const Popup = module.OutOfBalancePopup;
			const popup = new Popup(scene);
			if (message) popup.updateMessage(message);
			popup.show();
		}).catch(() => {});
	}

	/**
	 * Expose the primary controllers container so external UI (e.g., FreeRoundManager)
	 * can align itself within the same coordinate space as the spin button.
	 */
	public getPrimaryControllersContainer(): Phaser.GameObjects.Container | null {
		return this.primaryControllers || null;
	}

	/**
	 * Expose the main spin button image for other UI components (e.g., FreeRoundManager).
	 */
	public getSpinButton(): Phaser.GameObjects.Image | null {
		return this.buttons.get('spin') || null;
	}

	/**
	 * Expose the spin icon overlay image (if created).
	 */
	public getSpinIcon(): Phaser.GameObjects.Image | null {
		return this.spinIcon;
	}

	/**
	 * Expose the autoplay stop icon overlay image (if created).
	 */
	public getAutoplayStopIcon(): Phaser.GameObjects.Image | null {
		return this.autoplayStopIcon;
	}

	/**
	 * Disable UI controls that should not be usable during free rounds.
	 * - Buy Feature button
	 * - Autoplay button
	 * - Amplify bet button
	 * - Bet +/- buttons
	 * - Bet background (that opens bet options)
	 */
	public disableControlsForFreeRounds(): void {

		this.disableBetButtons();
		this.disableFeatureButton();

		// Completely hide the Buy Feature visuals while free rounds are active so the
		// center row can be used by the FreeRoundManager info panel instead.
		this.setBuyFeatureVisible(false);

		this.disableButton('autoplay');
		this.disableButtonWithAlpha('amplify', 0.2);

		this.disableBetBackgroundInteraction('free rounds');
	}

	/**
	 * Re-enable UI controls after free rounds end.
	 */
	public enableControlsAfterFreeRounds(): void {

		this.updateSpinButtonState();
		this.enableBetButtons();
		this.enableFeatureButton();

		this.setBuyFeatureVisible(true);

		this.enableButton('autoplay');
		this.enableButton('amplify');

		this.enableBetBackgroundInteraction('after free rounds');
	}

	/**
	 * Disable core controls when a manual spin is initiated.
	 */
	private lockControlsForSpinAction(): void {
		this.disableSpinButton();
		this.disableBetButtons();
		this.disableFeatureButton();
		this.disableAutoplayButton();
		this.disableTurboButton();
	}

	/**
	 * Disable controls while scatter/bonus flow blocks input.
	 */
	private lockControlsForScatterOrBonus(): void {
		this.disableSpinButton();
		this.disableAutoplayButton();
		this.disableAmplifyButton();
	}

	/**
	 * Disable interaction on the bet background that opens the bet options panel.
	 * This is used in multiple states (free rounds, buy feature, etc.).
	 */
	public disableBetBackgroundInteraction(reason: string = ''): void {
		if (!this.controllerContainer) {
			return;
		}

		this.controllerContainer.iterate((child: any) => {
			if (child && child.getData && child.getData('isBetBackground')) {
				child.disableInteractive();
				const suffix = reason ? ` (${reason})` : '';
			}
		});
		// Also disable the bet amount text so tapping it cannot open the bet options popup
		if (this.betAmountText) {
			this.betAmountText.disableInteractive();
		}
	}

	/**
	 * Re-enable interaction on the bet background that opens the bet options panel.
	 */
	private enableBetBackgroundInteraction(reason: string = ''): void {
		if (!this.controllerContainer) {
			return;
		}

		this.controllerContainer.iterate((child: any) => {
			if (child && child.getData && child.getData('isBetBackground')) {
				child.setInteractive();
				const suffix = reason ? ` (${reason})` : '';
			}
		});
		// Also re-enable the bet amount text
		if (this.betAmountText) {
			this.betAmountText.setInteractive();
		}
	}

	/**
	 * Show or hide Buy Feature visuals (button, hitbox, labels). Used when free rounds
	 * replace the center row with the FreeRoundManager info panel.
	 */
	private setBuyFeatureVisible(visible: boolean): void {
		const featureButton = this.buttons.get('feature');
		if (featureButton) featureButton.setVisible(visible);
		if (this.featureButtonHitbox) this.featureButtonHitbox.setVisible(visible);
		if (this.featureAmountText) this.featureAmountText.setVisible(visible);
		if (this.featureDollarText) this.featureDollarText.setVisible(visible);
		if (this.featureLabelText) this.featureLabelText.setVisible(visible);
		if (this.featureLabelContainer) this.featureLabelContainer.setVisible(visible);
	}

	/**
	 * Prevent the free spin display from appearing until cleared.
	 * Also immediately hides the display if it is currently visible.
	 */
	public suppressFreeSpinDisplay(): void {
		this.freeSpinDisplaySuppressed = true;
		this.hideFreeSpinDisplay();
	}

	/**
	 * Allow the free spin display to appear again.
	 */
	public clearFreeSpinDisplaySuppression(): void {
		this.freeSpinDisplaySuppressed = false;
	}

	/**
	 * Set the symbols component reference
	 * This allows the SlotController to access free spin data from the Symbols component
	 */
	public setSymbols(symbols: Symbols): void {
		this.symbols = symbols;
		
		// Update loading spinner position at center of reel (symbols grid)
		if (this.loadingSpinner && this.scene) {
			const centerX = this.scene.scale.width * GRID_CENTER_X_RATIO + GRID_CENTER_X_OFFSET_PX;
			const centerY = this.scene.scale.height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX;
			this.loadingSpinner.updatePosition(centerX, centerY);
		}
	}

	/**
	 * Set the BuyFeature reference in the BuyFeature component
	 * This allows the BuyFeature to access current bet information
	 */
	public setBuyFeatureReference(): void {
		this.buyFeatureController.setSlotController(this);
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
	}

	create(scene: Scene): void {
		
		// Store scene reference for event listening
		this.scene = scene;
		
		// Initialize loading spinner at center of symbols grid
		this.initializeLoadingSpinner();

		// Get GameData from the scene
		if (scene.scene.key === 'Game') {
			this.gameData = (scene as any).gameData;
			this.gameAPI = (scene as any).gameAPI;
		}
		
		// Create main container for all controller elements
		this.controllerContainer = scene.add.container(0, 0);
		this.balanceController = new BalanceController(this.controllerContainer, {
			getScene: () => this.scene,
			getGameAPI: () => this.gameAPI,
			getGameData: () => this.getGameData(),
			getBaseBetAmount: () => this.getBaseBetAmount(),
			updateBetAmount: (bet: number) => this.updateBetAmount(bet),
			showOutOfBalancePopup: () => this.showOutOfBalancePopup(),
		});
		// Scale the SlotController container to 0.95 (adjust as needed)
		this.controllerContainer.setScale(0.95);
		// The scale affects all child elements proportionally

		// Apply a small downward offset to move the whole controller slightly down
		this.controllerVerticalOffset = scene.scale.height * 0.1;
		this.controllerContainer.setY(this.controllerVerticalOffset);

		// Ensure controller UI renders above coin animations (800) but below dialogs (1000)
		this.controllerContainer.setDepth(900);
		
		const assetScale = this.networkManager.getAssetScale();

		this.amplifyBetController = new AmplifyBetController(
			scene,
			this.controllerContainer,
			this.buttons,
			this.networkManager,
			{
				getGameData: () => this.getGameData(),
				enableFeatureButton: () => this.enableFeatureButton(),
				disableFeatureButton: () => this.disableFeatureButton(),
				applyAmplifyBetIncrease: () => this.applyAmplifyBetIncrease(),
				restoreOriginalBetAmount: () => this.restoreOriginalBetAmount(),
				updateFeatureAmountFromCurrentBet: () => this.updateFeatureAmountFromCurrentBet(),
			}
		);
		

		// Initialize controller modules
		this.betController = new BetController(scene, this.controllerContainer, {
			onBetChange: (newBet: number, prevBet: number) => this.handleBetChange(newBet, prevBet),
			getBaseBetAmount: () => this.baseBetAmount || 0,
			getGameData: () => this.gameData,
		});
		
		this.autoplayController = new AutoplayController(scene, this.controllerContainer, {
			onSpinRequested: () => this.handleSpin(),
			onAutoplayStarted: () => this.handleAutoplayStart(),
			onAutoplayStopped: () => this.handleAutoplayStop(),
			getSymbols: () => (this.scene as any)?.symbols,
		});
		
		this.spinButtonController = new SpinButtonController(scene, this.controllerContainer, {
			onSpinRequested: () => this.handleSpin(),
			onSpinBlocked: (reason: string) => {},
			isAutoplayActive: () => this.autoplayController?.isActive() || false,
			stopAutoplay: () => this.stopAutoplay(),
		});

		// Add controller elements
		this.createControllerElements(scene, assetScale);
		// Center the full controller UI as a block *after* children are created.
		// (Children currently use screen-based coordinates; centering earlier will push them off-screen.)
		this.recenterControllerContainer(scene);
		
		// Create buy feature component
		this.buyFeatureController.create(scene);
		
		// Setup bonus mode event listener
		this.setupBonusModeEventListener();
		
		// Setup spin state change listener
		this.setupSpinStateListener();
		
		// Setup dialog shown listener for TotalWin dialog
		this.setupDialogShownListener();
		
		// No need to set initial spin button state here - will be handled when reels finish
	}

	/**
	 * Centers the controller container horizontally based on its visual bounds.
	 * This is robust to changes in controller width (e.g. different button sets, scaling).
	 */
	private recenterControllerContainer(scene: Scene): void {
		if (!this.controllerContainer) {
			return;
		}

		// Measure bounds with a stable baseline x so the math is deterministic.
		this.controllerContainer.x = 0;
		const bounds = this.controllerContainer.getBounds();
		const targetCenterX = scene.scale.width * 0.5;
		const horizontalOffsetPx = this.controllerHorizontalOffset;

		// Shift container so its bounds' center lines up with the screen center.
		this.controllerContainer.x = (targetCenterX - bounds.centerX) + horizontalOffsetPx;
		if (this.showButtonHitboxes) this.renderButtonHitboxes();
	}

	/**
	 * Toggle debug visualization for button hitboxes.
	 */
	public setShowButtonHitboxes(enabled: boolean): void {
		this.showButtonHitboxes = enabled;
		this.renderButtonHitboxes();
	}

	/**
	 * Draw red outlines around all button hitboxes for debugging.
	 */
	private renderButtonHitboxes(): void {
		if (!this.scene) {
			return;
		}

		if (!this.showButtonHitboxes) {
			if (this.buttonHitboxGraphics) {
				this.buttonHitboxGraphics.clear();
				this.buttonHitboxGraphics.setVisible(false);
			}
			return;
		}

		if (!this.buttonHitboxGraphics) {
			this.buttonHitboxGraphics = this.scene.add.graphics();
			this.buttonHitboxGraphics.setDepth(999);
		}

		const graphics = this.buttonHitboxGraphics;
		if (!graphics) {
			return;
		}

		graphics.setVisible(true);
		graphics.clear();
		graphics.lineStyle(2, 0xff0000, 0.9);

		this.buttons.forEach((button) => {
			if (!button || !button.visible) {
				return;
			}
			// For feature button, draw the hitbox Rectangle instead of the image bounds
			if (button === this.buttons.get('feature') && this.featureButtonHitbox) {
				const hb = this.featureButtonHitbox.getBounds();
				graphics.strokeRect(hb.x, hb.y, hb.width, hb.height);
				return;
			}
			const bounds = button.getBounds();
			graphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
		});
	}

	// ============================================================================
	// Controller Callback Handlers
	// ============================================================================

	/**
	 * Handle bet change from BetController
	 */
	private handleBetChange(newBet: number, prevBet: number): void {
		this.updateBetAmount(newBet);
	}

	/**
	 * Handle autoplay start from AutoplayController (called after user confirms autoplay dialog)
	 */
	private handleAutoplayStart(): void {
		const gameData = this.getGameData();
		if (gameData) {
			gameData.isAutoPlaying = true;
		}
		this.updateTurboButtonStateWithLock();
	}

	/**
	 * Handle autoplay stop from AutoplayController
	 */
	private handleAutoplayStop(): void {
		const gameData = this.getGameData();
		if (gameData) {
			gameData.isAutoPlaying = false;
		}
	}

	private getAutoplaySpinsRemaining(): number {
		return this.autoplayController?.getSpinsRemaining() ?? 0;
	}

	private getPausedAutoplaySpinsRemaining(): number {
		return this.pausedAutoplaySpinsRemaining ?? 0;
	}

	// ============================================================================
	// Existing Methods
	// ============================================================================

	private getTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
		return {
			fontSize: '10px',
			color: '#ffffff',
			fontFamily: 'poppins-regular'
		};
	}

	private createControllerElements(scene: Scene, assetScale: number): void {
		const screenConfig = this.screenModeManager.getScreenConfig();
		
		if (screenConfig.isPortrait) {
			this.createPortraitController(scene, assetScale);
		} else {
			this.createLandscapeController(scene, assetScale);
		}
	}

	/**
	 * Helper to center a Spine animation visually on top of the main spin button.
	 * This uses the Spine bounds (offset + size) so the visual center of the
	 * animation lines up with the spin button's center, not just the skeleton
	 * origin. Falls back to simple x/y copy if bounds are not available.
	 */
	private centerSpineOnSpinButton(spineObj: any, spinButton: Phaser.GameObjects.Image): void {
		if (!spineObj || !spinButton) {
			return;
		}

		try {
			const anySpine: any = spineObj as any;

			if (typeof anySpine.getBounds !== 'function') {
				spineObj.setPosition(spinButton.x, spinButton.y);
				return;
			}

			const bounds = anySpine.getBounds();
			if (!bounds || !bounds.offset || !bounds.size) {
				spineObj.setPosition(spinButton.x, spinButton.y);
				return;
			}

			const centerX = bounds.offset.x + bounds.size.x * 0.5;
			const centerY = bounds.offset.y + bounds.size.y * 0.5;

			const scaleX = (spineObj.scaleX !== undefined ? spineObj.scaleX : spineObj.scale) || 1;
			const scaleY = (spineObj.scaleY !== undefined ? spineObj.scaleY : spineObj.scale) || 1;

			spineObj.x = spinButton.x - centerX * scaleX;
			spineObj.y = spinButton.y - centerY * scaleY;
		} catch (e) {
			console.warn('[SlotController] Failed to auto-center spin button animation:', e);
			spineObj.setPosition(spinButton.x, spinButton.y);
		}
	}

	/**
	 * Create the spin button spine animation
	 */
	private createSpinButtonAnimation(scene: Scene, assetScale: number): void {
		try {
			if (!ensureSpineFactory(scene, '[SlotController] createSpinButtonAnimation')) {
				console.warn('[SlotController] Spine factory not available yet; will retry spin button spine shortly');
				scene.time.delayedCall(250, () => this.createSpinButtonAnimation(scene, assetScale));
				return;
			}

			if (!scene.cache.json.has('spin_button_animation')) {
				console.warn('[SlotController] spin_button_animation spine assets not loaded yet, will retry later');
				scene.time.delayedCall(1000, () => this.createSpinButtonAnimation(scene, assetScale));
				return;
			}

			const spinButton = this.buttons.get('spin');
			if (!spinButton) {
				console.warn('[SlotController] Spin button not found, cannot position animation');
				return;
			}

			this.spinButtonAnimation = scene.add.spine(
				spinButton.x,
				spinButton.y,
				"spin_button_animation",
				"spin_button_animation-atlas"
			);

			this.spinButtonAnimation.setOrigin(0.5, 0.5);
			this.spinButtonAnimation.setScale(assetScale * 0.435);
			this.spinButtonAnimation.setDepth(9);

			this.centerSpineOnSpinButton(this.spinButtonAnimation, spinButton);

			this.spinButtonAnimation.animationState.timeScale = 1.3;
			this.spinButtonAnimation.setVisible(false);

			if (this.primaryControllers) {
				const spinIndex = this.primaryControllers.getIndex(spinButton);
				this.primaryControllers.addAt(this.spinButtonAnimation, spinIndex);
			} else {
				this.controllerContainer.add(this.spinButtonAnimation);
			}


			if (scene.cache.json.has('fr_spin_button_animation')) {
				try {
					const spineScale = assetScale * 1.2;

					this.freeRoundSpinButtonAnimation = scene.add.spine(
						spinButton.x,
						spinButton.y,
						"fr_spin_button_animation",
						"fr_spin_button_animation-atlas"
					);
					this.freeRoundSpinButtonAnimation.setOrigin(0.5, 0.5);
					this.freeRoundSpinButtonAnimation.setScale(spineScale);
					this.freeRoundSpinButtonAnimation.setDepth(11);
					this.freeRoundSpinButtonAnimation.setVisible(false);

					this.centerSpineOnSpinButton(this.freeRoundSpinButtonAnimation, spinButton);

					try {
						const anySpine: any = this.freeRoundSpinButtonAnimation as any;
						if (typeof anySpine.getBounds === 'function') {
							const bounds = anySpine.getBounds();
							if (bounds && bounds.offset && bounds.size) {
								this.freeRoundSpinButtonAnimation.x = spinButton.x * spineScale;
								this.freeRoundSpinButtonAnimation.y = spinButton.y * spineScale;
							}
						}
					} catch (e) {
						console.warn('[SlotController] Failed to auto-center free-round spin animation:', e);
					}

					if (this.primaryControllers) {
						const spinIndex = this.primaryControllers.getIndex(spinButton);
						this.primaryControllers.addAt(this.freeRoundSpinButtonAnimation, spinIndex + 1);
					} else {
						this.controllerContainer.add(this.freeRoundSpinButtonAnimation);
					}

				} catch (e) {
					console.warn('[SlotController] Failed to create free-round spin button animation:', e);
					this.freeRoundSpinButtonAnimation = null;
				}
			} else {
				console.warn('[SlotController] fr_spin_button_animation spine assets not found in cache; free-round spin animation will be skipped');
			}
		} catch (error) {
			console.error('[SlotController] Error creating Spine button animation:', error);
		}
	}

	/**
	 * Create the autoplay button spine animation
	 */
	private createAutoplayButtonAnimation(scene: Scene): void {
		// Now handled by AutoplayController
	}

	/**
	 * Create the turbo button spine animation
	 */
	private createTurboButtonAnimation(scene: Scene, assetScale: number): void {
		this.turboButtonController.createTurboButtonAnimation(scene, assetScale);
	}

	/**
	 * Create the autoplay spins remaining text
	 */
	private createAutoplaySpinsRemainingText(scene: Scene): void {
		const spinButton = this.buttons.get('spin');
		if (!spinButton) {
			console.warn('[SlotController] Spin button not found, cannot position autoplay spins text');
			return;
		}

		this.autoplaySpinsRemainingText = scene.add.text(
			spinButton.x,
			spinButton.y,
			'0',
			{
				fontSize: '24px',
				color: '#ffffff',
				fontFamily: 'poppins-regular',
				stroke: '#379557',
				strokeThickness: 4
			}
		);
		this.autoplaySpinsRemainingText.setOrigin(0.5, 0.5);
		this.autoplaySpinsRemainingText.setDepth(20);
		this.autoplaySpinsRemainingText.setVisible(false);

		// Clicking the count (or the overlay area) stops autoplay when active
		const hitW = Math.max(spinButton.displayWidth, this.autoplaySpinsRemainingText.width);
		const hitH = Math.max(spinButton.displayHeight, this.autoplaySpinsRemainingText.height);
		this.autoplaySpinsRemainingText.setInteractive(
			new Phaser.Geom.Rectangle(-hitW * 0.5, -hitH * 0.5, hitW, hitH),
			Phaser.Geom.Rectangle.Contains
		);
		if (this.autoplaySpinsRemainingText.input) this.autoplaySpinsRemainingText.input.cursor = 'pointer';
		this.autoplaySpinsRemainingText.on('pointerdown', () => {
			if (gameStateManager.isAutoPlaying || gameStateManager.isAutoPlaySpinRequested) {
				this.stopAutoplay();
			}
		});

		if (this.primaryControllers) {
			this.primaryControllers.add(this.autoplaySpinsRemainingText);
			this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
		}
	}

	/**
	 * Show the autoplay spins remaining text - now handled by AutoplayController
	 */
	private showAutoplaySpinsRemainingText(): void {
		if (this.autoplaySpinsRemainingText) {
			this.autoplaySpinsRemainingText.setVisible(true);
			if (this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
		}
	}

	/**
	 * Hide the autoplay spins remaining text - now handled by AutoplayController
	 */
	private hideAutoplaySpinsRemainingText(): void {
		if (this.autoplaySpinsRemainingText) {
			this.autoplaySpinsRemainingText.setVisible(false);
		}
	}

	/**
	 * Disable bet buttons (grey out and disable interaction)
	 */
	private disableBetButtons(): void {
		const disabledAlpha = 0.5;
		if (this.betController) {
			this.betController.disableBetButtons(disabledAlpha);
		}
		// Also disable legacy bet buttons if present
		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');
		if (decreaseBetButton) {
			decreaseBetButton.setAlpha(disabledAlpha);
			decreaseBetButton.setTint(0x555555);
			decreaseBetButton.disableInteractive();
		}
		if (increaseBetButton) {
			increaseBetButton.setAlpha(disabledAlpha);
			increaseBetButton.setTint(0x555555);
			increaseBetButton.disableInteractive();
		}
	}

	/**
	 * Enable bet buttons (restore opacity and enable interaction)
	 */
	private enableBetButtons(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableBetButtons();
			return;
		}

		if (this.isSpinLocked || gameStateManager.isReelSpinning) {
			this.disableBetButtons();
			return;
		}

		if (this.betController) {
			this.betController.enableBetButtons();
		}
		// Apply limit states for legacy buttons (or as a fallback)
		const currentBaseBet = this.getBaseBetAmount() || 0.2;
		this.updateBetLimitButtons(currentBaseBet);
	}

	/**
	 * Get the bet ladder levels - delegated to BetController
	 */
	private getBetLevels(): number[] {
		// Now handled by BetController
		const levels = this.betController?.getBetLevels();
		return levels ? [...levels] : [];
	}

	/**
	 * Grey out and disable the bet +/- buttons when the current bet
	 * is at the minimum or maximum level in the bet ladder.
	 */
	private updateBetLimitButtons(currentBet: number): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableBetButtons();
			return;
		}
		if (this.isSpinLocked || gameStateManager.isReelSpinning) {
			this.disableBetButtons();
			return;
		}

		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');
		if (!decreaseBetButton && !increaseBetButton) {
			return;
		}

		const betLevels = this.getBetLevels();
		if (!betLevels.length) {
			return;
		}

		let idx = 0;
		let bestDiff = Number.POSITIVE_INFINITY;
		for (let i = 0; i < betLevels.length; i++) {
			const diff = Math.abs(betLevels[i] - currentBet);
			if (diff < bestDiff) {
				bestDiff = diff;
				idx = i;
			}
		}

		const minBet = betLevels[0] ?? 0.2;
		const isAtMin = idx === 0 || currentBet <= minBet + 1e-6;
		const isAtMax = idx === betLevels.length - 1;

		if (decreaseBetButton) {
			if (isAtMin) {
				decreaseBetButton.setAlpha(0.5);
				decreaseBetButton.setTint(0x555555);
				decreaseBetButton.disableInteractive();
			} else {
				decreaseBetButton.setAlpha(1.0);
				decreaseBetButton.clearTint();
				decreaseBetButton.setInteractive();
			}
		}

		if (increaseBetButton) {
			if (isAtMax) {
				increaseBetButton.setAlpha(0.5);
				increaseBetButton.setTint(0x555555);
				increaseBetButton.disableInteractive();
			} else {
				increaseBetButton.setAlpha(1.0);
				increaseBetButton.clearTint();
				increaseBetButton.setInteractive();
			}
		}
	}

	/**
	 * Disable feature button (grey out and disable interaction)
	 */
	private disableFeatureButton(): void {
		const featureButton = this.buttons.get('feature');
		
		if (featureButton) {
			featureButton.setAlpha(0.5); // Make it semi-transparent/greyed out
			featureButton.setTint(0x555555); // Apply dark grey tint
			if (this.featureButtonHitbox) {
				this.featureButtonHitbox.disableInteractive();
			}
		}
	}

	/**
	 * Enable feature button (restore opacity and enable interaction)
	 */
	private enableFeatureButton(): void {
		const featureButton = this.buttons.get('feature');

		if (featureButton) {
			// Keep Buy Feature disabled until the full spin/tumble/win flow is complete.
			if (gameStateManager.isReelSpinning || this.pendingWinLock || gameStateManager.isShowingWinDialog) {
				return;
			}
			// Guard: do not re-enable during bonus or before explicit allow
			if (gameStateManager.isBonus || !this.canEnableFeatureButton) {
				return;
			}
			// Also keep Buy Feature disabled while enhance/amplify bet is active
			const gameData = this.getGameData();
			if (gameData && gameData.isEnhancedBet) {
				return;
			}
			// Also keep Buy Feature disabled while buy feature flow or free spins are active
			if (this.isBuyFeatureControlsLocked()) {
				return;
			}
			// Also keep Buy Feature disabled if balance cannot afford its price.
			try {
				const price = this.getBuyFeaturePrice();
				const balance = this.getBalanceAmount() || 0;
				if (price > 0 && balance + 1e-9 < price) {
					this.disableFeatureButton();
					return;
				}
			} catch {}
			featureButton.setAlpha(1.0); // Restore full opacity
			featureButton.clearTint(); // Remove grey tint
			if (this.featureButtonHitbox) {
				this.featureButtonHitbox.setInteractive();
			}
		}
	}

	private handleBuyFeaturePress(): void {
		const inputEnabled = (this.featureButtonHitbox as any)?.input?.enabled;
		if (this.featureButtonHitbox && inputEnabled === false) {
			return;
		}

		let playedClick = false;
		try {
			this.scene?.sound?.play('click');
			playedClick = true;
		} catch {}

		if (!playedClick) {
			const audioManager = (this.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
		}

		this.showBuyFeatureDrawer();
	}

	/**
	 * Generic button disable function - can be used for any button
	 * @param buttonKey - The key of the button to disable (e.g., 'spin', 'feature', 'autoplay')
	 */
	private disableButton(buttonKey: string): void {
		const button = this.buttons.get(buttonKey);
		if (button) {
			button.setAlpha(0.5);
			button.setTint(0x555555);
			button.disableInteractive();
		}
	}

	private disableButtonWithAlpha(buttonKey: string, alpha: number): void {
		const button = this.buttons.get(buttonKey);
		if (button) {
			button.setAlpha(alpha);
			button.setTint(0x555555);
			button.disableInteractive();
		}
	}

	/**
	 * Generic button enable function - can be used for any button
	 * @param buttonKey - The key of the button to enable (e.g., 'spin', 'feature', 'autoplay')
	 */
	private enableButton(buttonKey: string): void {
		const button = this.buttons.get(buttonKey);
		if (button) {
			button.setAlpha(1.0);
			button.clearTint();
			button.setInteractive();
		}
	}

	/**
	 * Update the autoplay spins remaining text - now handled by AutoplayController
	 */
	private updateAutoplaySpinsRemainingText(spinsRemaining: number): void {
		if (this.autoplaySpinsRemainingText) {
			this.autoplaySpinsRemainingText.setText(spinsRemaining.toString());
			if (this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
		}
	}

	/**
	 * Bounce the autoplay spins remaining text - now handled by AutoplayController
	 */
	private bounceAutoplaySpinsRemainingText(): void {
		if (!this.autoplaySpinsRemainingText || !this.scene) {
			return;
		}
		try {
			this.scene.tweens.add({
				targets: this.autoplaySpinsRemainingText,
				scaleX: 1.45,
				scaleY: 1.45,
				duration: 100,
				ease: 'Power2',
				yoyo: true,
				onComplete: () => {
					this.autoplaySpinsRemainingText?.setScale(1, 1);
				}
			});
		} catch (error) {
			console.warn('[SlotController] Failed to bounce autoplay spins text:', error);
		}
	}

	/**
	 * Play the autoplay button animation once per spin
	 */
	private playAutoplayAnimation(): void {
		// Ensure the animation exists
		this.ensureAutoplayAnimationExists();
		
		if (!this.autoplayButtonAnimation) {
			console.warn('[SlotController] Autoplay button animation not available');
			return;
		}

		try {
			// Show the animation
			this.autoplayButtonAnimation.setVisible(true);
			
			// Play animation once following the same pattern as spin button
			const animationName = startAnimation(this.autoplayButtonAnimation, {
				animationName: 'animation',
				loop: false,
				fallbackToFirstAvailable: true,
				logWhenMissing: false
			}) ?? 'animation';
			
			// Listen for animation completion to hide it
			this.autoplayButtonAnimation.animationState.addListener({
				complete: (entry: any) => {
					if (entry.animation.name === animationName) {
						this.autoplayButtonAnimation.setVisible(false);
					}
				}
			});
			
		} catch (error) {
			console.error('[SlotController] Error playing autoplay button animation:', error);
			// Hide the animation if there's an error
			if (this.autoplayButtonAnimation) {
				this.autoplayButtonAnimation.setVisible(false);
			}
		}
	}

	/**
	 * Start the autoplay button animation - now handled by AutoplayController
	 */
	private startAutoplayAnimation(): void {
		// Now handled by AutoplayController
	}

	/**
	 * Stop the autoplay button animation - now handled by AutoplayController
	 */
	private stopAutoplayAnimation(): void {
		// Now handled by AutoplayController
	}

	/**
	 * Ensure the autoplay animation exists - now handled by AutoplayController
	 */
	private ensureAutoplayAnimationExists(): void {
		// Now handled by AutoplayController
	}

	/**
	 * Play the spin button spine animation
	 */
	private playSpinButtonAnimation(): void {
		// During initialization free-round spins, prefer the dedicated free-round
		// animation when available. This flag is managed by FreeRoundManager.
		const isInFreeRoundSpins =
			(gameStateManager as any)?.isInFreeSpinRound === true;

		const targetAnimation = isInFreeRoundSpins && this.freeRoundSpinButtonAnimation
			? this.freeRoundSpinButtonAnimation
			: this.spinButtonAnimation;

		if (!targetAnimation) {
			console.warn('[SlotController] Spin button animation not available (no default or free-round animation)');
			return;
		}

		try {
			// Hide the non-selected animation (if any) so only one effect plays
			if (targetAnimation === this.freeRoundSpinButtonAnimation && this.spinButtonAnimation) {
				this.spinButtonAnimation.setVisible(false);
			}
			if (targetAnimation === this.spinButtonAnimation && this.freeRoundSpinButtonAnimation) {
				this.freeRoundSpinButtonAnimation.setVisible(false);
			}

			// Show the chosen animation
			targetAnimation.setVisible(true);
			
			// Play the animation following the same pattern as kobi-ass
			// Use animationState.setAnimation like in Header.ts.
			// For the free-round button animation, the Spine animation name is
			// "Button_Bonus_Bottom" (see Button_Bonus_VFX.json). The default
			// spin button animation uses "animation".
			const animationName =
				targetAnimation === this.freeRoundSpinButtonAnimation
					? "Button_Bonus_Bottom"
					: "animation";

			// Start the animation and obtain the track entry so we can adjust
			// its effective duration for the free-round Spine.
			const startResult = startAnimationWithEntry(targetAnimation, {
				animationName,
				loop: false,
				fallbackToFirstAvailable: true,
				logWhenMissing: false
			});
			const playedAnimationName = startResult?.animationName ?? animationName;
			const trackEntry: any = startResult?.entry;

			// For the free-round Spine, stop the animation 0.5s before the end so
			// the last few frames are not played.
			if (targetAnimation === this.freeRoundSpinButtonAnimation && trackEntry) {
				try {
					const anySpine: any = targetAnimation as any;
					const animData = anySpine?.skeleton?.data?.findAnimation?.(playedAnimationName);
					const duration: number | undefined = animData?.duration;
					if (typeof duration === 'number' && duration > 0.01) {
						trackEntry.animationEnd = Math.max(0, duration - 0.01);
					}
				} catch (e) {
					console.warn('[SlotController] Failed to clamp free-round spin animationEnd:', e);
				}
			}
			
			// Listen for animation completion to hide it
			targetAnimation.animationState.addListener({
				complete: (entry: any) => {
				if (entry.animation.name === playedAnimationName) {
						targetAnimation.setVisible(false);
				}
				}
			});
			
		} catch (error) {
			console.error('[SlotController] Error playing Spine button animation:', error);
			// Hide the animation if there's an error
			if (this.spinButtonAnimation) {
				this.spinButtonAnimation.setVisible(false);
			}
			if (this.freeRoundSpinButtonAnimation) {
				this.freeRoundSpinButtonAnimation.setVisible(false);
			}
		}
	}

	/**
	 * Rotate the spin button - now handled by SpinButtonController
	 */
	private rotateSpinButton(): void {
		// Now handled by SpinButtonController
	}

	private createPortraitController(scene: Scene, assetScale: number): void {
		
		// Create primary controllers container
		this.primaryControllers = scene.add.container(0, 0);
		this.controllerContainer.add(this.primaryControllers);

		this.turboButtonController = new TurboButtonController(
			scene,
			this.controllerContainer,
			this.primaryControllers,
			this.buttons,
			this.networkManager,
			{
				getGameData: () => this.getGameData(),
				applyTurboSpeedModifications: () => this.applyTurboSpeedModifications(),
				forceApplyTurboToSceneGameData: () => this.forceApplyTurboToSceneGameData(),
			}
		);

		this.menuButtonController = new MenuButtonController(
			scene,
			this.controllerContainer,
			this.primaryControllers,
			this.buttons
		);

		this.menuButtonController = new MenuButtonController(
			scene,
			this.controllerContainer,
			this.primaryControllers,
			this.buttons
		);

		this.turboButtonController = new TurboButtonController(
			scene,
			this.controllerContainer,
			this.primaryControllers,
			this.buttons,
			this.networkManager,
			{
				getGameData: () => this.getGameData(),
				applyTurboSpeedModifications: () => this.applyTurboSpeedModifications(),
				forceApplyTurboToSceneGameData: () => this.forceApplyTurboToSceneGameData(),
			}
		);
		
		// Create vertical buttons on the right side
		const middleRef = scene.scale.height * 0.82;
		// Spin button (main action)
		const spinButton = scene.add.image(
			scene.scale.width * 0.5,
			middleRef,
			'spin'
		).setOrigin(0.5, 0.5).setScale(assetScale * 1.2).setDepth(10);


		// Spin icon overlay in front of and aligned with the spin button
		// (kept above the free-round Spine effect)
		this.spinIcon = scene.add.image(
			spinButton.x,
			spinButton.y,
			'spin_icon'
		).setOrigin(0.5, 0.5).setScale(assetScale * 1.2).setDepth(12);
		this.primaryControllers.add(this.spinIcon);

		// Gentle rotation animation for the icon
		this.spinIconTween = scene.tweens.add({
			targets: this.spinIcon,
			angle: 360,
			duration: 4000,
			repeat: -1,
			ease: 'Linear'
		});

		// Autoplay stop icon overlay (hidden by default), same position as spin
		// (on top of both the spin icon and the Spine effect)
		this.autoplayStopIcon = scene.add.image(
			spinButton.x,
			spinButton.y,
			'autoplay_stop_icon'
		).setOrigin(0.5, 0.5).setScale(assetScale * 0.45).setDepth(13).setVisible(false);
		this.primaryControllers.add(this.autoplayStopIcon);

		spinButton.setInteractive();
		spinButton.on('pointerdown', async () => {
			// Debounce is handled by SpinButtonController, no need to check here
			// If autoplay is active (or about to start), clicking spin will stop autoplay instead
			if (gameStateManager.isAutoPlaying || gameStateManager.isAutoPlaySpinRequested) {
				this.stopAutoplay();
				return;
			}
			if (this.isSpinLocked) {
				return;
			}
			if (gameStateManager.isReelSpinning) {
				return;
			}
			// Hard guard: block spin if balance can't cover current bet.
			if (!this.canAffordCurrentSpin()) {
				this.disableSpinButton();
				this.updateFeatureButtonState();
				return;
			}
			
			// Disable spin button, bet buttons, feature button and play animations
			this.lockControlsForSpinAction();
			this.playSpinButtonAnimation();
			this.rotateSpinButton();
			
			// Use the centralized spin handler
			await this.handleSpin();
		});
		this.buttons.set('spin', spinButton);
		this.primaryControllers.add(spinButton);

		// Ensure icon is positioned exactly and rendered above the spin button
		if (this.spinIcon) {
			this.spinIcon.setPosition(spinButton.x, spinButton.y);
			this.primaryControllers.bringToTop(this.spinIcon);
		}

		// Turbo button
		this.turboButtonController.createButton(
			scene.scale.width * 0.9,
			middleRef + 5,
			assetScale,
			this.getTextStyle(),
			this.controllerTexts
		);

		// Amplify button
		this.amplifyBetController.createButton(
			scene.scale.width * 0.73,
			middleRef,
			assetScale,
			this.getTextStyle(),
			this.primaryControllers,
			this.controllerTexts
		);

		// Amplify description container
		this.amplifyBetController.createDescription(scene);

		// Autoplay button
		const autoplayButton = scene.add.image(
			scene.scale.width * 0.27,
			middleRef,
			'autoplay_off'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		autoplayButton.setInteractive();
		autoplayButton.on('pointerdown', () => {
			const audioManager =
				(this.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			this.handleAutoplayButtonClick();
		});
		this.buttons.set('autoplay', autoplayButton);
		this.primaryControllers.add(autoplayButton);

		// Autoplay text label
		const autoplayText = scene.add.text(
			scene.scale.width * 0.27,
			middleRef + (autoplayButton.displayHeight * 0.5) + 15,
			'Autoplay',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(autoplayText);
		this.controllerTexts.push(autoplayText);

		// Menu button
		this.menuButtonController.createButton(
			scene.scale.width * 0.1,
			middleRef + 5,
			assetScale,
			this.getTextStyle(),
			this.controllerTexts
		);

		// Balance display container
		this.createBalanceDisplay(scene);

		// Bet display container
		this.createBetDisplay(scene, assetScale);
		
		// Feature button container
		this.createFeatureButton(scene, assetScale);
		
		// Free spin display container
		this.createFreeSpinDisplay(scene);
		
		// Create the spin button animation
		this.createSpinButtonAnimation(scene, assetScale);
		
		// Create the autoplay button animation
		this.createAutoplayButtonAnimation(scene);
		
		// Create the turbo button animation
		this.createTurboButtonAnimation(scene, assetScale);
		
		// Create the autoplay spins remaining text
		this.createAutoplaySpinsRemainingText(scene);

		// Hand off autoplay UI elements to AutoplayController
		this.autoplayController?.attachUiElements({
			button: autoplayButton,
			stopIcon: this.autoplayStopIcon,
			spinsText: this.autoplaySpinsRemainingText,
			buttonTextureOn: 'autoplay_on',
			buttonTextureOff: 'autoplay_off',
			uiContainer: this.primaryControllers
		});
		
		// Initialize amplify button state
		this.initializeAmplifyButtonState();
	}

	private createBalanceDisplay(scene: Scene): void {
		this.balanceController?.createBalanceDisplay(scene);
	}

	private createBetDisplay(scene: Scene, assetScale: number): void {
		// Position for bet display (proportionate opposite side of balance display)
		const betX = scene.scale.width * 0.81;
		const betY = scene.scale.height * 0.724;
		const containerWidth = 125;
		const containerHeight = 55;
		const cornerRadius = 10;
		// Check if demo mode is active - if so, hide currency symbol
		const isDemoBet = this.gameAPI?.getDemoState();


		// Create amplify bet spine animation (behind bet background)
		this.createAmplifyBetAnimation(scene, betX, betY, containerWidth, containerHeight);
		// Create enhance-bet idle spine animation (behind bet background)
		this.createEnhanceBetIdleAnimation(scene, betX, betY, containerWidth, containerHeight);
		
		// Create rounded rectangle background
		const betBg = scene.add.graphics();
		betBg.fillStyle(0x000000, 0.65); // Dark gray with 65% alpha
		betBg.fillRoundedRect(
			betX - containerWidth / 2,
			betY - containerHeight / 2,
			containerWidth,
			containerHeight,
			cornerRadius
		);
		betBg.setDepth(8);
		// Tag this graphics as the bet background so it can be disabled/enabled for free rounds
		(betBg as any).setData && betBg.setData('isBetBackground', true);
		this.controllerContainer.add(betBg);

		// Bet background is visual only; bet options open via bet amount text
		

		// "BET (USD)" label (1st line)
		const currencyCode = isDemoBet ? '' : CurrencyManager.getCurrencyCode();
		const betLabelString = currencyCode ? `BET (${currencyCode})` : 'BET';
		this.betLabelText = scene.add.text(
			betX,
			betY - 8,
			betLabelString,
			{
				fontSize: '12px',
				color: '#00ff00', // Green color
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(this.betLabelText);

		// "0.60" amount (2nd line, right part)
		this.betAmountText = scene.add.text(
			betX,
			betY + 8,
			'0.20',
			{
				fontSize: '14px',
				color: '#ffffff', // White color
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(this.betAmountText);
		this.betAmountText.setInteractive();
		this.betAmountText.on('pointerdown', () => {
			const audioManager =
				(this.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}

			// Prevent opening bet options while spin/tumbles are in progress or autoplay is active
			const gsm: any = gameStateManager as any;
			if (gameStateManager.isReelSpinning || gameStateManager.isAutoPlaying || gsm?.isProcessingSpin || gameStateManager.isShowingWinDialog) {
				return;
			}

			// Also prevent opening bet options while scatter animation is in progress
			// (so the player cannot raise the bet once a scatter has triggered)
			let isScatterAnimating = false;
			try {
				if (this.scene) {
					const gameScene: any = this.scene as any;
					const symbolsComponent = gameScene.symbols;
					const scatterManager = symbolsComponent && symbolsComponent.scatterAnimationManager;
					if (scatterManager && typeof scatterManager.isAnimationInProgress === 'function') {
						isScatterAnimating = !!scatterManager.isAnimationInProgress();
					}
				}
			} catch (e) {
				console.warn('[SlotController] Unable to determine scatter animation state:', e);
			}

			if (gameStateManager.isScatter || isScatterAnimating) {
				return;
			}

			EventBus.emit('show-bet-options');
		});

		// Initialize base bet amount
		this.baseBetAmount = 0.20;

		// Decrease bet button (left side within container)
		const decreaseBetButton = scene.add.image(
			betX - 42, // Left side within container
			betY + 8,
			'decrease_bet'
		).setOrigin(0.5, 0.5).setScale(assetScale * 0.55).setDepth(10);
		decreaseBetButton.setInteractive();
		decreaseBetButton.on('pointerdown', () => {
			const audioManager = (this.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			this.adjustBetByStep(-1);
		});
		this.buttons.set('decrease_bet', decreaseBetButton);
		this.controllerContainer.add(decreaseBetButton);

		// Increase bet button (right side within container)
		const increaseBetButton = scene.add.image(
			betX + 42, // Right side within container
			betY + 8,
			'increase_bet'
		).setOrigin(0.5, 0.5).setScale(assetScale * 0.55).setDepth(10);
		increaseBetButton.setInteractive();
		increaseBetButton.on('pointerdown', () => {
			const audioManager = (this.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			this.adjustBetByStep(1);
		});
		this.buttons.set('increase_bet', increaseBetButton);
		this.controllerContainer.add(increaseBetButton);

		// Initialize bet button states based on the starting bet (min bet greys out the decrement button)
		this.updateBetLimitButtons(this.baseBetAmount);
	}

	/** Move the bet to the next/previous level based on the BetOptions ladder */
	private adjustBetByStep(direction: 1 | -1): void {
		if (this.betController) {
			this.betController.adjustBetByStep(direction);
		} else {
			console.warn('[SlotController] BetController not initialized');
		}
	}

	/**
	 * Create amplify bet spine animation behind the bet background
	 */
	private createAmplifyBetAnimation(scene: Scene, betX: number, betY: number, containerWidth: number, containerHeight: number): void {
		this.amplifyBetController.createAmplifyBetAnimation(scene, betX, betY);
	}

	/**
	 * Create the Enhance Bet idle loop spine animation - now handled by BetController
	 */
	private createEnhanceBetIdleAnimation(scene: Scene, betX: number, betY: number, containerWidth: number, containerHeight: number): void {
		this.amplifyBetController.createEnhanceBetIdleAnimation(scene, betX, betY);
	}

	/** Start the enhance bet idle loop - now handled by BetController */
	private showEnhanceBetIdleLoop(): void {
		this.amplifyBetController.showEnhanceBetIdleLoop();
	}

	/** Stop and hide the enhance bet idle loop - now handled by BetController */
	private hideEnhanceBetIdleLoop(): void {
		this.amplifyBetController.hideEnhanceBetIdleLoop();
	}

	private createFeatureButton(scene: Scene, assetScale: number): void {
		// Position for feature button (between balance and bet containers)
		const featureX = scene.scale.width * 0.5; // Center between balance and bet
		const featureY = scene.scale.height * 0.724; // Same Y as balance and bet containers
		// Check if demo mode is active - if so, hide currency symbol
		const isDemoFeature = this.gameAPI?.getDemoState();

		// Visual image for the feature button (non-interactive)
		const featureButton = scene.add.image(
			featureX,
			featureY,
			'feature'
		).setOrigin(0.5, 0.5).setDepth(10);
		const featureContainerWidth = 170 * assetScale;
		const featureContainerHeight = 120 * assetScale;
		const scaleX = featureContainerWidth / featureButton.width;
		const scaleY = featureContainerHeight / featureButton.height;
		featureButton.setScale(scaleX, scaleY);
		featureButton.setSize(featureButton.displayWidth, featureButton.displayHeight);
		this.buttons.set('feature', featureButton);
		this.controllerContainer.add(featureButton);

		// Interactable area (slightly smaller than the visual) as an invisible rectangle
		const baseWidth = featureButton.displayWidth;
		const baseHeight = featureButton.displayHeight;
		const hitbox = scene.add.rectangle(
			featureX,
			featureY,
			baseWidth * 0.65, //Set base width to 65% of feature button width
			baseHeight * 0.49, //Set base height to 49% of feature button height
			0xffffff,
			0 // fully transparent
		).setOrigin(0.5, 0.5).setDepth(11);
		hitbox.setInteractive();
		hitbox.on('pointerdown', () => {
			this.handleBuyFeaturePress();
		});
		this.featureButtonHitbox = hitbox;
		this.controllerContainer.add(hitbox);

		// "BUY (CUR)" label (1st line) - Shuten Doji style (separate text parts)
		this.featureLabelContainer = scene.add.container(featureX, featureY - 8);
		this.featureLabelContainer.setDepth(9);
		this.controllerContainer.add(this.featureLabelContainer);
		// Keep legacy label hidden (it may still be referenced by other code paths)
		if (this.featureLabelText) {
			try { this.featureLabelText.setVisible(false); } catch {}
		}
		this.rebuildFeatureLabel();

		// Amount (2nd line, right part) - bound to current bet x100
		this.featureAmountText = scene.add.text(
			featureX,
			featureY + 8,
			'0',
			{
				fontSize: '14px',
				color: '#ffffff',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(this.featureAmountText);

		// Currency glyph moved into label; keep this hidden (used by legacy layoutCurrencyPair helpers).
		this.featureDollarText = scene.add.text(
			featureX,
			featureY + 8,
			CurrencyManager.getCurrencyGlyph(),
			{
				fontSize: '14px',
				color: '#ffffff',
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.featureDollarText.setVisible(false);
		this.controllerContainer.add(this.featureDollarText);
		// Amount stays centered now (no currency glyph on this line).
		this.featureAmountText.setPosition(featureX, featureY + 8);

		// Initialize amount from current bet
		this.updateFeatureAmountFromCurrentBet();
	}

	private createLandscapeController(scene: Scene, assetScale: number): void {
		
		// Create primary controllers container
		this.primaryControllers = scene.add.container(0, 0);
		this.controllerContainer.add(this.primaryControllers);
		
		// Create buttons for landscape layout
		const middleRef = scene.scale.height * 0.9;
		const buttonSpacing = 100;
		
		// Spin button (main action)
		const spinButton = scene.add.image(
			scene.scale.width * 0.5,
			middleRef,
			'spin'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);

		// Spin icon overlay in front of and aligned with the spin button (landscape)
		// (kept above the free-round Spine effect)
		if (!this.spinIcon) {
			this.spinIcon = scene.add.image(
				spinButton.x,
				spinButton.y,
				'spin_icon'
			).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(12);
			this.primaryControllers.add(this.spinIcon);
			this.spinIconTween = scene.tweens.add({
				targets: this.spinIcon,
				angle: 360,
				duration: 4000,
				repeat: -1,
				ease: 'Linear'
			});
		}

		// Autoplay stop icon overlay (hidden by default), same position as spin (landscape)
		// (on top of both the spin icon and the Spine effect)
		if (!this.autoplayStopIcon) {
			this.autoplayStopIcon = scene.add.image(
				spinButton.x,
				spinButton.y,
				'autoplay_stop_icon'
			).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(13).setVisible(false);
			this.primaryControllers.add(this.autoplayStopIcon);
		}

		spinButton.setInteractive();
		spinButton.on('pointerdown', async () => {
			// Debounce is handled by SpinButtonController, no need to check here
			// If autoplay is active (or about to start), clicking spin will stop autoplay instead
			if (gameStateManager.isAutoPlaying || gameStateManager.isAutoPlaySpinRequested) {
				this.stopAutoplay();
				return;
			}
			if (this.isSpinLocked) {
				return;
			}
			if (gameStateManager.isReelSpinning) {
				return;
			}
			
			// Disable spin button, bet buttons, feature button and play animations
			this.lockControlsForSpinAction();
			this.playSpinButtonAnimation();
			this.rotateSpinButton();
			
			// Use the centralized spin handler
			await this.handleSpin();
		});
		this.buttons.set('spin', spinButton);
		this.primaryControllers.add(spinButton);

		// Turbo button
		this.turboButtonController.createButton(
			scene.scale.width * 0.5 - buttonSpacing,
			middleRef,
			assetScale,
			this.getTextStyle(),
			this.controllerTexts
		);

		// Autoplay button
		const autoplayButton = scene.add.image(
			scene.scale.width * 0.5 + buttonSpacing,
			middleRef,
			'autoplay_off'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		autoplayButton.setInteractive();
		autoplayButton.on('pointerdown', () => {
			this.handleAutoplayButtonClick();
		});
		this.buttons.set('autoplay', autoplayButton);
		this.primaryControllers.add(autoplayButton);

		// Autoplay text label
		const autoplayText = scene.add.text(
			scene.scale.width * 0.5 + buttonSpacing,
			middleRef + (autoplayButton.displayHeight * 0.5) + 15,
			'Autoplay',
			this.getTextStyle(),
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(autoplayText);
		this.controllerTexts.push(autoplayText);

		// Menu button
		this.menuButtonController.createButton(
			scene.scale.width * 0.5 + buttonSpacing * 2,
			middleRef,
			assetScale,
			this.getTextStyle(),
			this.controllerTexts
		);

		// Amplify description container
		this.amplifyBetController.createDescription(scene);

		// Balance display container
		this.createBalanceDisplay(scene);

		// Bet display container
		this.createBetDisplay(scene, assetScale);
		
		// Feature button container
		this.createFeatureButton(scene, assetScale);
		
		// Free spin display container
		this.createFreeSpinDisplay(scene);
		
		// Create the spin button animation
		this.createSpinButtonAnimation(scene, assetScale);
		
		// Create the autoplay button animation
		this.createAutoplayButtonAnimation(scene);
		
		// Create the turbo button animation
		this.createTurboButtonAnimation(scene, assetScale);
		
		// Create the autoplay spins remaining text
		this.createAutoplaySpinsRemainingText(scene);

		// Hand off autoplay UI elements to AutoplayController
		this.autoplayController?.attachUiElements({
			button: autoplayButton,
			stopIcon: this.autoplayStopIcon,
			spinsText: this.autoplaySpinsRemainingText,
			buttonTextureOn: 'autoplay_on',
			buttonTextureOff: 'autoplay_off',
			uiContainer: this.primaryControllers
		});
	}

	updateButtonState(buttonName: string, isActive: boolean): void {
		const button = this.buttons.get(buttonName);
		if (button) {
			const newTexture = isActive ? `${buttonName}_on` : `${buttonName}_off`;
			button.setTexture(newTexture);
		}
	}

	resize(scene: Scene): void {
		if (this.controllerContainer) {
			// Reapply vertical offset on resize to maintain spacing
			if (this.controllerVerticalOffset === 0) {
				this.controllerVerticalOffset = scene.scale.height * 0.02;
			}
			this.controllerContainer.setY(this.controllerVerticalOffset);
			// Recenter horizontally in case layout/scale changes with the new size.
			this.recenterControllerContainer(scene);
		}
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.controllerContainer;
	}

	getButton(buttonName: string): Phaser.GameObjects.Image | undefined {
		return this.buttons.get(buttonName);
	}

	/**
	 * Update bet amount from autoplay panel without resetting amplify/enhanced bet state.
	 * This preserves existing enhance bet if it was enabled before autoplay starts.
	 */
	public updateBetAmountFromAutoplay(betAmount: number): void {
		// Treat this as an internal bet change so resetAmplifyBetOnBetChange is not triggered
		this.isInternalBetChange = true;
		try {
			// External bet changes clear any buy-feature-confirmed display override.
			this.setFeatureButtonAmountOverride(null);
			// Update base bet BEFORE updateBetAmount so that
			// updateFeatureAmountFromCurrentBet (called inside) reads the new value.
			this.baseBetAmount = betAmount;

			// Also re-seed BuyFeature's internal bet ladder so its options reflect
			// the autoplay-selected base bet (option 1 = base, option 2 = 5x base).
			try {
				if (this.buyFeatureController && typeof this.buyFeatureController.resetBetFromExternal === 'function') {
					this.buyFeatureController.resetBetFromExternal(betAmount);
				}
			} catch (e) {
				console.warn('[SlotController] Failed to sync BuyFeature bet from autoplay:', e);
			}

			this.updateBetAmount(betAmount);

			// If enhance/amplify bet is currently ON, keep the displayed bet at +25%
			// while the underlying base bet (used for API and Buy Feature price) is betAmount.
			const gameData = this.getGameData();
			if (gameData && gameData.isEnhancedBet && this.betAmountText) {
				const increasedBet = betAmount * 1.25;
				this.betAmountText.setText(formatCurrencyNumber(increasedBet));
			}

			// Bet changed -> re-evaluate whether spin is affordable/enabled.
			this.updateSpinButtonState();
		} finally {
			this.isInternalBetChange = false;
		}
	}

	updateBetAmount(betAmount: number): void {
		// Preserve amplify/enhanced state when base bet changes via +/- controls.
		const gameData = this.getGameData();
		const isEnhanced = !!gameData?.isEnhancedBet;
		const displayBet = isEnhanced ? betAmount * 1.25 : betAmount;
		if (this.betAmountText) {
			this.betAmountText.setText(formatCurrencyNumber(displayBet));
		}

		// Update base bet amount when changed externally (not by amplify bet)
		if (!this.isInternalBetChange) {
			// External bet changes clear any buy-feature-confirmed display override.
			this.featureButtonAmountOverride = null;
			this.baseBetAmount = betAmount;
			// Also sync BuyFeature's internal bet ladder so its options reflect
			// the latest base bet chosen via BetOptions/bet controls.
			try {
				if (this.buyFeatureController && typeof this.buyFeatureController.resetBetFromExternal === 'function') {
					this.buyFeatureController.resetBetFromExternal(betAmount);
				}
			} catch (e) {
				console.warn('[SlotController] Failed to sync BuyFeature bet from base bet change:', e);
			}
			// Keep amplify ON when user changes base bet from +/- controls.
			// Legacy reset path remains for non-enhanced states only.
			if (!isEnhanced) {
				this.resetAmplifyBetOnBetChange();
			}
		}

		// Keep the Buy Feature amount synced with current base bet (using the updated baseBetAmount)
		this.updateFeatureAmountFromCurrentBet();

		// Update bet +/- button states based on the new bet (for min/max greying)
		this.updateBetLimitButtons(betAmount);

		// Bet changed -> re-evaluate whether spin is affordable/enabled.
		this.updateSpinButtonState();
	}

	/**
	 * Update the Buy Feature button amount to current base bet x100
	 */
	private updateFeatureAmountFromCurrentBet(): void {
		if (!this.featureAmountText || !this.featureDollarText) {
			return;
		}
		// Always use base bet for Buy Feature price; enhanced bet's +25% is display-only
		const baseBet = this.getBaseBetAmount() || 0;
		const hasOverride =
			this.featureButtonAmountOverride !== null &&
			Number.isFinite(this.featureButtonAmountOverride);
		const price = hasOverride
			? this.featureButtonAmountOverride!
			: baseBet * 100;
		this.featureAmountText.setText(formatCurrencyNumber(price));
		if (this.scene) {
			const featureX = this.scene.scale.width * 0.5;
			this.featureAmountText.setPosition(featureX, this.featureAmountText.y);
		}
	}

	private setFeatureButtonAmountOverride(amount: number | null): void {
		this.featureButtonAmountOverride =
			amount !== null && Number.isFinite(amount) && amount >= 0
				? amount
				: null;
		this.updateFeatureAmountFromCurrentBet();
		// Feature price changed -> re-evaluate whether it's affordable/enabled.
		this.updateFeatureButtonState();
	}

	private getBuyFeaturePrice(): number {
		const baseBet = this.getBaseBetAmount() || 0;
		const hasOverride =
			this.featureButtonAmountOverride !== null &&
			Number.isFinite(this.featureButtonAmountOverride);
		const price = hasOverride ? this.featureButtonAmountOverride! : baseBet * 100;
		return Number.isFinite(price) ? price : 0;
	}

	private canAffordCurrentSpin(): boolean {
		const gameData = this.getGameData();
		const baseBet = this.getBaseBetAmount() || 0;
		const requiredBet = gameData?.isEnhancedBet ? baseBet * 1.25 : baseBet;
		const balance = this.getBalanceAmount() || 0;
		if (!(requiredBet > 0)) return true;
		return balance + 1e-9 >= requiredBet;
	}

	public refreshCurrencySymbols(): void {
		this.balanceController?.refreshCurrencySymbols();
		// Bet label includes currency code (amount remains centered).
		if (this.scene && this.betLabelText) {
			const isDemo = this.gameAPI?.getDemoState();
			const currencyCode = isDemo ? '' : CurrencyManager.getCurrencyCode();
			this.betLabelText.setText(currencyCode ? `BET (${currencyCode})` : 'BET');
		}
		this.rebuildFeatureLabel();
	}

	private layoutCurrencyPair(
		centerX: number,
		y: number,
		currencyText: Phaser.GameObjects.Text,
		amountText: Phaser.GameObjects.Text,
		isDemo: boolean,
		spacing: number
	): void {
		const glyph = CurrencyManager.getCurrencyGlyph();
		const showCurrency = !isDemo && glyph.length > 0;

		if (!showCurrency) {
			try { currencyText.setVisible(false); } catch {}
			amountText.setPosition(centerX, y);
			return;
		}

		currencyText.setVisible(true);
		currencyText.setText(glyph);

		const glyphWidth = currencyText.width || 0;
		const amountWidth = amountText.width || 0;
		const totalWidth = glyphWidth + spacing + amountWidth;
		const startX = centerX - (totalWidth / 2);

		currencyText.setPosition(startX + glyphWidth / 2, y);
		amountText.setPosition(startX + glyphWidth + spacing + (amountWidth / 2), y);
	}

	getBetAmountText(): string | null {
		return this.betAmountText ? this.betAmountText.text : null;
	}

	/**
	 * Get the base bet amount for API calls (without amplify bet increase)
	 */
	getBaseBetAmount(): number {
		return this.baseBetAmount;
	}

	updateBalanceAmount(balanceAmount: number): void {
		this.balanceController?.updateBalanceAmount(balanceAmount);
		// Balance changed -> re-evaluate whether spin is affordable/enabled.
		this.updateSpinButtonState();
	}

	/**
	 * Decrement balance by the current bet amount (frontend only)
	 */
	private decrementBalanceByBet(): void {
		this.balanceController?.decrementBalanceByBet();
	}

	getBalanceAmountText(): string | null {
		return this.balanceController?.getBalanceAmountText() ?? null;
	}

	getBalanceAmount(): number {
		return this.balanceController?.getBalanceAmount() ?? 0;
	}

	enablePrimaryControllers(): void {
		if (this.primaryControllers) {
			this.primaryControllers.setVisible(true);
			this.primaryControllers.setInteractive(true);
		}
	}

	disablePrimaryControllers(): void {
		if (this.primaryControllers) {
			this.primaryControllers.setVisible(false);
			this.primaryControllers.setInteractive(false);
		}
	}

	/**
	 * Setup event listeners for autoplay state changes
	 */
	private setupAutoplayEventListeners(): void {
		// Listen for balance initialization
		gameEventManager.on(GameEventType.BALANCE_INITIALIZED, (data: any) => {
			const resolvedBalance = Number(data?.newBalance ?? data?.balance ?? data?.currentBalance);
			if (!Number.isFinite(resolvedBalance)) return;
			this.updateBalanceAmount(resolvedBalance);
			if (this.pendingSpinUntilBalanceReady && !gameStateManager.isReelSpinning) {
				this.pendingSpinUntilBalanceReady = false;
				try { this.scene?.time?.delayedCall?.(0, () => { void this.handleSpin(); }); } catch { void this.handleSpin(); }
			}
		});

		// Reset pending win lock on spin start
		gameEventManager.on(GameEventType.SPIN, () => {
			this.pendingWinLock = false;
		});

		// Track whether the current spin has wins so we can defer UI re-enable until WIN_STOP
		gameEventManager.on(GameEventType.SPIN_DATA_RESPONSE, (data: any) => {
			try {
				const spinData: any = data?.spinData;
				this.pendingWinLock = this.spinDataHasWins(spinData);
				if (this.pendingWinLock) {
					this.disableSpinButton();
				}
			} catch { }
		});

		// During autoplay, play spin button animation on each spin (SPIN is only emitted for the first; subsequent spins use SPIN_DATA_RESPONSE only)
		gameEventManager.on(GameEventType.SPIN_DATA_RESPONSE, () => {
			if (!gameStateManager.isAutoPlaying) return;
			const symbolsComponent = (this.scene as any)?.symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				return;
			}
			this.playSpinButtonAnimation();
			this.rotateSpinButton();
		});

		// Listen for any spin to start (manual or autoplay)
		gameEventManager.on(GameEventType.SPIN, () => {
			
			// CRITICAL: Block autoplay spins if win dialog is showing, but allow manual spins
			// This fixes the timing issue where manual spin button animation was blocked
			if (gameStateManager.isShowingWinDialog && this.gameData?.isAutoPlaying) {
				return;
			}
			
			// Check if free spin autoplay is active - if so, don't play spin button animation
			const symbolsComponent = (this.scene as any).symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				return;
			}
			
			// For manual spins, disable spin. Keep enabled during autoplay to allow stopping autoplay
			if (!gameStateManager.isAutoPlaying) {
				this.disableSpinButton();
			}
			
			// Play the spin button spine animation for all spins (manual and autoplay)
			this.playSpinButtonAnimation();
			
			// Rotate the spin button for all spins (manual and autoplay)
			this.rotateSpinButton();
			
			
			// Removed pulsing of autoplay spins remaining text during spin
			
			// Log current GameData animation values to debug turbo mode
			
			// Ensure turbo speed is applied to scene GameData
			this.forceApplyTurboToSceneGameData();
		});

		// Listen for reels start to disable amplify button
		gameEventManager.on(GameEventType.REELS_START, () => {
			this.balanceApiCalledThisSpin = false; // Reset guard for new spin
			this.disableSpinButton();
			this.disableAmplifyButton();
			const isFake = !!this.gameAPI?.isFakeDataEnabled?.();
			// Autoplay counter is managed by AutoplayController
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			if (spinsRemaining > 0 && gameStateManager.isAutoPlaying && !gameStateManager.isBonus) {
				// If this autoplay session is a freeround autoplay, broadcast remaining spins
				// so FreeRoundManager can update its text display.
				if (this.isFreeRoundAutoplay && this.scene) {
					this.scene.events.emit('freeround-autoplay-remaining', spinsRemaining);
				}

				// Re-enable spin button interaction after first autoplay spin is triggered in normal mode
				if (this.shouldReenableSpinButtonAfterFirstAutoplay) {
					const spinButton = this.buttons.get('spin');
					if (spinButton) {
						spinButton.setInteractive();
						this.shouldReenableSpinButtonAfterFirstAutoplay = false;
					}
				}
			}
			// During bonus mode, decrement the remaining free spins at the start of the spin.
			// In fake-data mode, the display is updated only in FREE_SPIN_AUTOPLAY from spinData.
			if (gameStateManager.isBonus && !isFake) {
				try {
					if (this.shouldSubtractOneFromServerFsDisplay && !this.uiFsDecrementApplied && this.freeSpinNumber) {
						let nextVal: number | null = null;
						try {
							const sym = (this.scene as any)?.symbols;
							if (sym && typeof sym.freeSpinAutoplaySpinsRemaining === 'number') {
								nextVal = sym.freeSpinAutoplaySpinsRemaining;
							}
						} catch {}

						const currentText = (this.freeSpinNumber.text || '').toString().trim();
						const currentVal = parseInt(currentText, 10);
						if (!isNaN(currentVal)) {
							const decremented = Math.max(0, nextVal !== null ? nextVal : (currentVal - 1));
							this.updateFreeSpinNumber(decremented);
							this.freeSpinDisplayOverride = decremented;
							this.uiFsDecrementApplied = true;
							this.shouldSubtractOneFromServerFsDisplay = false;
						}
					}
				} catch (e) {
					console.warn('[SlotController] Failed to decrement free spin display on REELS_START:', e);
				}
			}
		});

		gameEventManager.on(GameEventType.REELS_STOP, () => {
			
			// Update balance from server once per spin (REELS_STOP can fire multiple times: Symbols + WinLineDrawer)
			if (!gameStateManager.isScatter && !gameStateManager.isBonus) {
				if (this.shouldDeferBalanceSyncToTotalWinDialog()) {
				} else if (this.balanceController?.hasPendingBalanceUpdate()) {
				} else if (!this.balanceApiCalledThisSpin) {
					this.balanceApiCalledThisSpin = true;
					this.updateBalanceFromServer();
				} else {
				}
			} else {
			}
			
			// If we're in bonus mode, check if free spins are finishing now
			if (gameStateManager.isBonus) {
				try {
					const isFake = !!this.gameAPI?.isFakeDataEnabled?.();
					// Sync free spin display after the spin completes
					try {
						if (this.freeSpinNumber) {
							if (!isFake) {
								const symbolsComponent = (this.scene as any)?.symbols;
								const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
								if (typeof rem === 'number') {
									this.updateFreeSpinNumber(rem);
								}
							}
						}
					} catch (e) {
						console.warn('[SlotController] Failed to sync free spin display on REELS_STOP:', e);
					}

					const gameScene: any = this.scene as any;
					const symbolsComponent = gameScene?.symbols;
					
					// Check if there's a pending scatter retrigger that will add more free spins
					// If so, don't set isBonusFinished because the bonus will continue
					const hasPendingRetrigger = symbolsComponent && typeof symbolsComponent.hasPendingScatterRetrigger === 'function' 
						? symbolsComponent.hasPendingScatterRetrigger() 
						: false;
					const hasScatterRetriggerInSpin = this.hasScatterRetriggerInSpinData();
					
					if (hasPendingRetrigger || hasScatterRetriggerInSpin) {
					} else {
						// Prefer Symbols' remaining counter if available
						if (symbolsComponent && typeof symbolsComponent.freeSpinAutoplaySpinsRemaining === 'number') {
							const remaining: number = symbolsComponent.freeSpinAutoplaySpinsRemaining;
							// If after this spin there are no spins remaining, flag bonus finished
							if (remaining <= 0) {
								gameStateManager.isBonusFinished = true;
							}
						} else if (this.gameAPI && typeof this.gameAPI.getCurrentSpinData === 'function') {
							// Fallback: inspect GameAPI spin data for remaining spins
							const apiSpinData: any = this.gameAPI.getCurrentSpinData();
							const fs = apiSpinData?.slot?.freespin || apiSpinData?.slot?.freeSpin;
							if (fs?.items && Array.isArray(fs.items)) {
								const totalRemaining = fs.items.reduce((sum: number, it: any) => sum + (it?.spinsLeft || 0), 0);
								if (totalRemaining <= 1) {
									gameStateManager.isBonusFinished = true;
								}
							}
						}
					}
				} catch (e) {
					console.warn('[SlotController] REELS_STOP: Unable to evaluate bonus finish state:', e);
				}
			}
			
			// If scatter bonus just triggered or bonus mode is active, keep buttons disabled
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				return;
			}

			// If we are in initialization free-round mode, keep autoplay/bet controls
			// disabled/greyed-out for the duration of the free rounds. Only the spin
			// button should be re-enabled between spins.
			const gsmAny: any = gameStateManager as any;
			if (gsmAny.isInFreeSpinRound === true) {
				this.updateSpinButtonState();
				return;
			}
			
			// Check if free spin autoplay is active - if so, don't re-enable buttons
			const symbolsComponent = (this.scene as any).symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				return;
			}

			// If win animations are pending, defer UI re-enable until WIN_STOP
			if (this.pendingWinLock || gameStateManager.isShowingWinDialog) {
				return;
			}
			
			// Note: autoplay counter is managed by AutoplayController
			
			// Note: AUTO_STOP is emitted by AutoplayController when autoplay finishes
			
			// For manual spins, re-enable spin button and hide autoplay counter immediately after REELS_STOP
			// Check autoplay counter instead of state manager to avoid timing issues
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			if (spinsRemaining === 0 && !gameStateManager.isAutoPlaying) {
				this.updateSpinButtonState();
				// Don't re-enable auxiliary buttons if buy feature spin lock is active
				if (!this.isBuyFeatureControlsLocked()) {
					this.enableAutoplayButton();
					this.enableTurboButton();
					this.enableBetButtons();
					this.enableAmplifyButton();
				}
				// Keep feature disabled during bonus or until explicitly allowed
				if (!gameStateManager.isBonus && this.canEnableFeatureButton) {
					this.enableFeatureButton();
				}
				// Don't enable bet background if buy feature spin lock is active
				if (!this.isBuyFeatureControlsLocked()) {
					this.enableBetBackgroundInteraction('after manual spin REELS_STOP');
				}
				this.hideAutoplaySpinsRemainingText();
				this.updateAutoplayButtonState();
				this.updateTurboButtonState();
				return;
			}
			
			// Update spin button state when spin completes
			// Only enable spin button if not autoplaying AND reels are not spinning
			if(!this.gameData?.isAutoPlaying && !gameStateManager.isReelSpinning) {
				this.updateSpinButtonState();
				// Don't re-enable auxiliary buttons if buy feature spin lock is active
				if (!this.isBuyFeatureControlsLocked()) {
					this.enableAutoplayButton();
					this.enableTurboButton();
					this.enableBetButtons();
					this.enableAmplifyButton();
				}
				// Keep feature disabled during bonus or until explicitly allowed
				if (!gameStateManager.isBonus && this.canEnableFeatureButton) {
					this.enableFeatureButton();
				}
				// Don't enable bet background if buy feature spin lock is active
				if (!this.isBuyFeatureControlsLocked()) {
					this.enableBetBackgroundInteraction('after manual spin complete');
				}
				this.updateTurboButtonState();
				return;
			}
			
			// If autoplaying or reels still spinning, keep button disabled
			if(this.gameData?.isAutoPlaying) {
			} else if(gameStateManager.isReelSpinning) {
			}
		});

		// Disable spin during tumble sequence; re-enable when tumbles finish
		gameEventManager.on(GameEventType.TUMBLE_WIN_PROGRESS, () => {
			if (!gameStateManager.isAutoPlaying) {
				this.disableSpinButton();
			}
			this.disableAutoplayButton();
			// Keep turbo clickable during autoplay so user can toggle speed
			if (!gameStateManager.isAutoPlaying) {
				this.disableTurboButton();
			}
			this.disableBetButtons();
			this.disableAmplifyButton();
		});
		gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, () => {
			if (!gameStateManager.isAutoPlaying) {
				// Scatter/bonus: disable spin and return (don't re-enable any controls)
				if (gameStateManager.isScatter || gameStateManager.isBonus) {
					this.disableSpinButton();
					return;
				}
				// Pending balance: keep spin disabled but fall through to re-enable autoplay/others
				if (this.balanceController?.hasPendingBalanceUpdate()) {
					this.disableSpinButton();
				} else {
					this.updateSpinButtonState();
				}
			}
			// Only keep autoplay/others disabled for scatter/bonus (not for pending balance)
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				this.disableAutoplayButton();
				this.disableTurboButton();
				this.disableBetButtons();
				this.disableAmplifyButton();
				return;
			}
			// Do not re-enable autoplay while a win dialog is still showing; wait until it closes.
			const holdForDialog = gameStateManager.isShowingWinDialog;
			if (!this.isBuyFeatureControlsLocked() && !holdForDialog) {
				this.enableTurboButton();
				if (!gameStateManager.isAutoPlaying) {
					this.enableBetButtons();
					this.enableAmplifyButton();
				}
				// Only re-enable autoplay when autoplay has fully stopped and this is the
				// final tumble completion (e.g., after a cancel).
				const autoplayFullyStopped =
					!gameStateManager.isAutoPlaying &&
					this.getAutoplaySpinsRemaining() === 0;
				if (autoplayFullyStopped && !gameStateManager.isReelSpinning) {
					this.enableAutoplayButton();
				}
			}
			// Delayed re-apply so autoplay button is enabled after balance/lock state settles
			this.scene?.time.delayedCall(250, () => {
				if (gameStateManager.isScatter || gameStateManager.isBonus) return;
				const delayedHoldForDialog = gameStateManager.isShowingWinDialog;
				if (!this.isBuyFeatureControlsLocked() && !gameStateManager.isReelSpinning && !delayedHoldForDialog) {
					const autoplayFullyStoppedLater =
						!gameStateManager.isAutoPlaying &&
						this.getAutoplaySpinsRemaining() === 0;
					if (autoplayFullyStoppedLater) {
						this.enableAutoplayButton();
					} else {
						this.updateAutoplayButtonState();
					}
				} else {
					this.updateAutoplayButtonState();
				}
			});
		});

		// Listen for autoplay start
		gameEventManager.on(GameEventType.AUTO_START, () => {
			
			// Update GameData autoplay state
			if (this.gameData) {
				this.gameData.isAutoPlaying = true;
			}
			
			this.setAutoplayButtonState(true);
			// Keep spin button enabled during autoplay (allow stopping autoplay)
			// Hide and pause spin icon completely during autoplay, show stop icon
			if (this.spinIcon) {
				this.spinIcon.setVisible(false);
			}
			if (this.spinIconTween) {
				this.spinIconTween.pause();
			}
			if (this.autoplayStopIcon) {
				this.autoplayStopIcon.setVisible(true);
				this.primaryControllers.bringToTop(this.autoplayStopIcon);
			}
			// Keep spins text above all
			if (this.autoplaySpinsRemainingText && this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
			this.updateTurboButtonStateWithLock();
			// No need to update spin button state here - will be handled when reels finish
		});

		// Listen for autoplay stop
		gameEventManager.on(GameEventType.AUTO_STOP, () => {

			// Sync gameData.isAutoPlaying immediately - onAutoplayStopped runs after emit,
			// so updateSpinButtonState would see stale true and disable the button
			const gameData = this.getGameData();
			if (gameData) {
				gameData.isAutoPlaying = false;
			}

			// Hide autoplay spin count display
			this.hideAutoplaySpinsRemainingText();

			// Always reset/disable autoplay button on AUTO_STOP; re-enabling is handled
			// explicitly by TUMBLE_SEQUENCE_DONE / WIN_DIALOG_CLOSED once spins/tumbles
			// and any win dialogs are fully complete.
			this.setAutoplayButtonState(false);
			this.disableAutoplayButton();

			// If we are in initialization free-round mode, do not re-enable autoplay
			// or bet controls here; they stay disabled/greyed-out until free rounds
			// are fully completed.
			const gsmAny: any = gameStateManager as any;
			if (gsmAny.isInFreeSpinRound === true && !gameStateManager.isBonus) {
				// Ensure spin button itself is usable for manual free-round spins.
				this.updateSpinButtonState();
				return;
			}
			
			// Re-enable non-autoplay controls as appropriate now that autoplay has stopped.
			// The autoplay button itself must stay disabled until spin resolution is fully done
			// (all tumbles/dialogs complete, or scatter/bonus flow takes over).
			this.updateSpinButtonState();
			this.scene?.time.delayedCall(150, () => this.updateSpinButtonState());
			if (!this.isBuyFeatureControlsLocked()) {
				this.enableBetButtons();
				this.enableAmplifyButton();
				this.enableBetBackgroundInteraction('after autoplay stop');
			}
			this.updateAutoplayButtonState();
			this.updateTurboButtonStateWithLock();
			this.enableFeatureButton();

			// Show and resume spin icon after autoplay stops, hide stop icon
			if (this.spinIcon) {
				this.spinIcon.setVisible(true);
			}
			if (this.spinIconTween) {
				this.spinIconTween.resume();
			}
			if (this.autoplayStopIcon) {
				this.autoplayStopIcon.setVisible(false);
			}
			if (this.autoplaySpinsRemainingText && this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}

			// Safety fallback: force-verify all button states after a short delay
			// to catch any edge-case where an event ordering issue left buttons disabled.
			// Two-stage fallback: 200ms covers pending balance clearing, 600ms covers late events.
			const runSafetyFallback = (label: string) => {
				if (gameStateManager.isAutoPlaying || gameStateManager.isReelSpinning) return;
				if (gameStateManager.isScatter || gameStateManager.isBonus) return;
				if (this.isBuyFeatureControlsLocked()) return;
				const gsmSafety: any = gameStateManager as any;
				if (gsmSafety.isInFreeSpinRound === true) return;
				// Clear any stale pending balance that might block spin button
				this.balanceController?.applyPendingBalanceUpdateIfAny();
				this.updateSpinButtonState();
				this.updateAllAuxiliaryButtonStates();
				this.updateFeatureButtonState();
				this.enableBetBackgroundInteraction(label);
			};
			this.scene?.time.delayedCall(200, () => runSafetyFallback('safety-200ms'));
			this.scene?.time.delayedCall(600, () => runSafetyFallback('safety-600ms'));
		});


		// Listen for when reels stop spinning to enable spin button for manual spins
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			this.pendingWinLock = false;

			// Finalize base-spin balance only after WIN_STOP (post-tumbles).
			if (!gameStateManager.isScatter && !gameStateManager.isBonus) {
				if (this.shouldDeferBalanceSyncToTotalWinDialog()) {
				} else if (this.balanceController?.hasPendingBalanceUpdate()) {
					this.balanceController.applyPendingBalanceUpdateIfAny();
				} else if (!this.balanceApiCalledThisSpin) {
					try {
						const spinData = this.gameAPI?.getCurrentSpinData() || (this.scene as any)?.symbols?.currentSpinData;
						const baseWin = spinData ? this.getBaseSpinWinForBalance(spinData as SpinData) : 0;
						if (baseWin > 0) {
							this.balanceApiCalledThisSpin = true;
							this.updateBalanceFromServer();
						}
					} catch (e) {
						console.warn('[SlotController] Failed WIN_STOP base-win balance fallback:', e);
					}
				}
			}
			
			// If scatter bonus is in progress or bonus mode is active, keep buttons disabled
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				return;
			}

			// If free-round mode is active, don't re-enable buttons (only turbo and menu stay enabled)
			const gsmWinStop: any = gameStateManager as any;
			if (gsmWinStop.isInFreeSpinRound === true) {
				return;
			}
			
			// Check if free spin autoplay is active - if so, don't re-enable buttons
			const symbolsComponent = (this.scene as any).symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				return;
			}
			
			// Handle autoplay spin completion
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			const isAutoplayActive = spinsRemaining > 0 || gameStateManager.isAutoPlaying;

			if (isAutoplayActive) {
				return;
			}

			// Re-enable buttons directly for manual spins instead of emitting
			// AUTO_STOP (which AutoplayController already emits for natural completion).
			this.updateSpinButtonState();
			if (!this.isBuyFeatureControlsLocked()) {
				this.enableAutoplayButton();
				this.enableBetButtons();
				this.enableAmplifyButton();
				this.enableBetBackgroundInteraction('after spin WIN_STOP');
			}
			this.updateTurboButtonStateWithLock();
			this.enableFeatureButton();
			this.hideAutoplaySpinsRemainingText();
			if (this.spinIcon) { this.spinIcon.setVisible(true); }
			if (this.spinIconTween) { this.spinIconTween.resume(); }
			if (this.autoplayStopIcon) { this.autoplayStopIcon.setVisible(false); }
		});

		// Listen for win dialog close (for high winnings case)
		gameEventManager.on(GameEventType.WIN_DIALOG_CLOSED, () => {
			const pausedAutoplaySpins = this.getPausedAutoplaySpinsRemaining();
			if (
				pausedAutoplaySpins > 0 &&
				!gameStateManager.isAutoPlaying &&
				!gameStateManager.isScatter &&
				!gameStateManager.isBonus
			) {
				this.resumeAutoplayFromPause();
				return;
			}

			// When a win dialog closes after an autoplay cancel, this is one of the final
			// points where we can safely re-enable the autoplay button (along with
			// TUMBLE_SEQUENCE_DONE) once the game is fully idle.
			this.updateSpinButtonState();
			this.updateAllAuxiliaryButtonStates();
			this.updateFeatureButtonState();
			if (!this.isBuyFeatureControlsLocked()) {
				const autoplayFullyStopped =
					!gameStateManager.isAutoPlaying &&
					this.getAutoplaySpinsRemaining() === 0 &&
					!gameStateManager.isReelSpinning;
				if (autoplayFullyStopped && !gameStateManager.isScatter && !gameStateManager.isBonus) {
					this.enableAutoplayButton();
				} else {
					this.updateAutoplayButtonState();
				}
			}
			this.enableBetBackgroundInteraction('after win dialog closed');
		});

		// Note: SPIN_RESPONSE event listeners removed - now using SPIN_DATA_RESPONSE
	}

	/**
	 * Handle autoplay button click - either start autoplay or stop if already running
	 */
	private handleAutoplayButtonClick(): void {
		// Check if autoplay is currently active
		if (this.autoplayController?.isActive() || gameStateManager.isAutoPlaying) {
			// Autoplay is active, stop it
			this.stopAutoplay();
		} else {
			// Autoplay is not active, show options to start it
			EventBus.emit('autoplay');
		}
	}

	/**
	 * Start autoplay with specified number of spins
	 */
	public startAutoplay(spins: number): void {

		// Safety: if we're not in any free spin / bonus context, ensure we treat this
		// as a normal base-game autoplay (not a leftover freeround autoplay state).
		const inFreeRoundContext =
			gameStateManager.isBonus ||
			((gameStateManager as any).isInFreeSpinRound === true);
		if (!inFreeRoundContext) {
			this.isFreeRoundAutoplay = false;
		}
		const showBaseUi = !(this.isFreeRoundAutoplay || inFreeRoundContext);
		this.autoplayController?.startAutoplay(spins, { showBaseUi });

		// For normal autoplay, hide the spin icon and pause rotation.
		// For free-round autoplay, keep the base spin icon visible.
		if (showBaseUi) {
			if (this.spinIcon) {
				this.spinIcon.setVisible(false);
			}
			if (this.spinIconTween) {
				this.spinIconTween.pause();
			}
			// Disable spin button interaction for normal mode autoplay until first spin is triggered
			const spinButton = this.buttons.get('spin');
			if (spinButton) {
				spinButton.disableInteractive();
				this.shouldReenableSpinButtonAfterFirstAutoplay = true;
			}
		} else {
			if (this.spinIcon) {
				this.spinIcon.setVisible(true);
			}
		}

		// Keep spin button enabled during autoplay (allow stopping autoplay)
		this.disableBetButtons();
		this.disableFeatureButton();
		this.disableAmplifyButton();
	}

	/**
	 * Pause base-game autoplay, caching the remaining spins so it can be resumed
	 * after a scatter-triggered bonus (e.g. once the bonus/Congrats flow fully completes).
	 */
	public pauseAutoplay(reason: string = 'pauseAutoplay'): void {
		const gameData = this.getGameData();
		const spinsRemaining = this.getAutoplaySpinsRemaining();
		const isAutoplayActive =
			spinsRemaining > 0 ||
			!!gameStateManager.isAutoPlaying ||
			!!gameData?.isAutoPlaying;

		if (!isAutoplayActive) {
			return;
		}

		// Cache remaining spins (counter may already have been decremented for the current spin).
		this.pausedAutoplaySpinsRemaining = spinsRemaining;

		// Reuse existing stop logic to clear timers and reset UI/state.
		this.stopAutoplay();
	}

	/**
	 * Consume (read + clear) the paused autoplay cache.
	 */
	private consumePausedAutoplaySpinsRemaining(): number {
		const spins = this.pausedAutoplaySpinsRemaining ?? 0;
		this.pausedAutoplaySpinsRemaining = null;
		return spins;
	}

	private scheduleResumeAutoplayFromPauseRetry(delayMs: number, reason: string, spins: number): void {
		if (!this.scene?.time) {
			return;
		}
		if (this.resumePausedAutoplayRetryTimer) {
			return;
		}
		this.resumePausedAutoplayRetryTimer = this.scene.time.delayedCall(delayMs, () => {
			this.resumePausedAutoplayRetryTimer = null;
			this.resumeAutoplayFromPause();
		});
	}

	/**
	 * Resume base-game autoplay using cached data from `pauseAutoplay()`.
	 * Safe to call multiple times; it will no-op unless a paused cache exists.
	 */
	public resumeAutoplayFromPause(): void {
		const spins = this.pausedAutoplaySpinsRemaining ?? 0;
		if (spins <= 0) {
			this.pausedAutoplaySpinsRemaining = null;
			if (this.resumePausedAutoplayRetryTimer) {
				try { this.resumePausedAutoplayRetryTimer.destroy(); } catch {}
				this.resumePausedAutoplayRetryTimer = null;
			}
			return;
		}

		// Only resume in base mode after transitions finish.
		if (gameStateManager.isBonus || gameStateManager.isScatter || gameStateManager.isShowingWinDialog) {
			this.scheduleResumeAutoplayFromPauseRetry(450, 'waiting-for-bonus-scatter-dialog-state', spins);
			return;
		}

		// Do not resume while a spin is still finishing.
		if (gameStateManager.isProcessingSpin || gameStateManager.isReelSpinning) {
			this.scheduleResumeAutoplayFromPauseRetry(450, 'spin-in-flight', spins);
			return;
		}

		if (this.resumePausedAutoplayRetryTimer) {
			try { this.resumePausedAutoplayRetryTimer.destroy(); } catch {}
			this.resumePausedAutoplayRetryTimer = null;
		}

		this.consumePausedAutoplaySpinsRemaining();
		this.startAutoplay(spins);
	}

	/**
	 * Start a dedicated "freeround autoplay" sequence.
	 * This uses the same internal autoplay system, but is logged separately so we can
	 * distinguish it from normal autoplay in debugging/analytics.
	 */
	public startFreeRoundAutoplay(spins: number): void {
		this.isFreeRoundAutoplay = true;
		this.startAutoplay(spins);
	}

	/**
	 * Stop autoplay
	 */
	public stopAutoplay(): void {
		// Immediately disable autoplay button (stays disabled until spin/tumbles finish)
		this.setAutoplayButtonState(false);
		this.disableAutoplayButton();
		this.hideAutoplaySpinsRemainingText();
		// Stop the underlying autoplay controller without emitting AUTO_STOP
		// (we will emit AUTO_STOP ourselves below after state is fully synced).
		this.autoplayController?.stopAutoplay(false);
		this.isFreeRoundAutoplay = false;
		this.shouldReenableSpinButtonAfterFirstAutoplay = false;

		
		// Emit AUTO_STOP so UI listeners (including this controller) can re-enable
		// appropriate buttons even if WIN_STOP already fired earlier in the spin.
		try {
			gameEventManager.emit(GameEventType.AUTO_STOP);
		} catch { /* avoid breaking stop flow on emit issues */ }
		
		// Update UI
		// Show and resume spin icon after autoplay stops, hide stop icon
		if (this.spinIcon) {
			this.spinIcon.setVisible(true);
		}
		if (this.spinIconTween) {
			this.spinIconTween.resume();
		}
		
		// If scatter/bonus active, keep controls disabled
		if (gameStateManager.isScatter || gameStateManager.isBonus) {
			this.lockControlsForScatterOrBonus();
			return;
		}
		
		// Re-enable controls if not spinning and we're back in normal mode (autoplay re-enables only in TUMBLE_SEQUENCE_DONE)
		if (!gameStateManager.isReelSpinning) {
			this.updateSpinButtonState();
			// Don't re-enable auxiliary buttons if buy feature flow is active
			if (!this.isBuyFeatureControlsLocked()) {
				this.enableBetButtons();
				this.enableAmplifyButton();
				this.enableBetBackgroundInteraction('after stopAutoplay');
			}
			// Keep feature disabled during bonus or until explicitly allowed
			if (!gameStateManager.isBonus && this.canEnableFeatureButton) {
				this.enableFeatureButton();
			}
			this.updateAutoplayButtonState();
		} else {
			// Safety: if the final spin had no tumbles or missed the TUMBLE_SEQUENCE_DONE path,
			// ensure controls are re-enabled shortly after reels fully stop.
			this.scene?.time.delayedCall(300, () => {
				if (gameStateManager.isReelSpinning) return;
				if (gameStateManager.isScatter || gameStateManager.isBonus) return;
				this.updateSpinButtonState();
				if (!this.isBuyFeatureControlsLocked()) {
					this.enableBetButtons();
					this.enableAmplifyButton();
					this.enableBetBackgroundInteraction('after stopAutoplay (safety)');
				}
				if (!this.canEnableFeatureButton || gameStateManager.isBonus) {
					// Keep feature disabled during bonus or when explicitly disallowed
				} else {
					this.enableFeatureButton();
				}
				this.updateAutoplayButtonState();
				this.updateTurboButtonStateWithLock();
			});
		}
	}

	/**
	 * Change autoplay button visual state
	 */
	public setAutoplayButtonState(isOn: boolean): void {
		const autoplayButton = this.buttons.get('autoplay');
		if (autoplayButton) {
			const textureKey = isOn ? 'autoplay_on' : 'autoplay_off';
			autoplayButton.setTexture(textureKey);
		}
		
		// Control the autoplay animation based on state
		if (isOn) {
			this.startAutoplayAnimation();
		} else {
			this.stopAutoplayAnimation();
		}
	}

	/**
	 * Disable the turbo button (grey out and disable interaction)
	 */
	public disableTurboButton(): void {
		const disabledAlpha = 0.5;
		this.disableButtonWithAlpha('turbo', disabledAlpha);
	}

	/**
	 * Enable the turbo button (remove grey tint and enable interaction).
	 * Turbo is clickable during autoplay so the user can toggle speed.
	 */
	public enableTurboButton(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableTurboButton();
			return;
		}
		this.enableButton('turbo');
	}

	/**
	 * Disable the amplify button (disable interaction only, no visual changes)
	 */
	public disableAmplifyButton(): void {
		this.amplifyBetController.disableButton();
	}

	/**
	 * Enable the amplify button (enable interaction)
	 */
	public enableAmplifyButton(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableAmplifyButton();
			return;
		}
		// Enforce affordability here too, because many flows call enableAmplifyButton()
		// directly (bypassing updateAmplifyButtonStateWithLock()).
		try {
			const isBalanceReady = this.balanceController?.hasInitializedBalance() ?? false;
			if (isBalanceReady) {
				const gameData = this.getGameData();
				const baseBet = this.getBaseBetAmount() || 0;
				const requiredBet = gameData?.isEnhancedBet ? baseBet * 1.25 : baseBet;
				const requiredBetIfAmplified = baseBet * 1.25;
				const balance = this.getBalanceAmount() || 0;
				if (
					(requiredBet > 0 && balance + 1e-9 < requiredBet) ||
					(!gameData?.isEnhancedBet && requiredBetIfAmplified > 0 && balance + 1e-9 < requiredBetIfAmplified)
				) {
					this.disableAmplifyButton();
					return;
				}
			}
		} catch {}
		this.amplifyBetController.enableButton();
	}

	/**
	 * Update turbo button state based on game conditions.
	 * Turbo remains enabled during autoplay so the user can toggle it.
	 */
	public updateTurboButtonState(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableTurboButton();
			return;
		}
		this.turboButtonController.updateButtonState();
	}

	/**
	 * Change turbo button visual state
	 */
	public setTurboButtonState(isOn: boolean): void {
		this.turboButtonController.setTurboButtonState(isOn);
	}

	/**
	 * Change amplify button visual state
	 */
	public setAmplifyButtonState(isOn: boolean): void {
		this.amplifyBetController.setAmplifyButtonState(isOn);
	}

	/**
	 * Initialize amplify button state based on GameData
	 */
	private initializeAmplifyButtonState(): void {
		this.amplifyBetController.initializeAmplifyButtonState();
	}

	/**
	 * Control the amplify bet animation based on toggle state
	 */
	private controlAmplifyBetAnimation(): void {
		this.amplifyBetController.controlAmplifyBetAnimation();
	}



	/**
	 * Start the amplify button pulsing effect
	 */
	private startAmplifyBetBouncing(): void {
		this.amplifyBetController.startAmplifyBetBouncing();
	}

	/**
	 * Stop the amplify button pulsing effect
	 */
	private stopAmplifyBetBouncing(): void {
		this.amplifyBetController.stopAmplifyBetBouncing();
	}

	/**
	 * Trigger amplify bet spine animation when spin occurs while amplify bet is on
	 */
	private triggerAmplifyBetAnimation(): void {
		this.amplifyBetController.triggerAmplifyBetAnimation();
	}

	/**
	 * Hide amplify bet animation
	 */
	private hideAmplifyBetAnimation(): void {
		this.amplifyBetController.hideAmplifyBetAnimation();
	}

	/**
	 * Apply 25% bet increase when amplify bet is activated
	 */
	private applyAmplifyBetIncrease(): void {
		const currentBetText = this.getBetAmountText();
		if (!currentBetText) {
			console.warn('[SlotController] No current bet amount to increase');
			return;
		}

		const currentBet = parseFloat(currentBetText);
		const increasedBet = currentBet * 1.25; // Add 25%
		
		// Only update the display, keep baseBetAmount unchanged for API calls
		if (this.betAmountText) {
			this.betAmountText.setText(formatCurrencyNumber(increasedBet));
		}
		
		// Even though base bet doesn't change, price uses base bet x100
		this.updateFeatureAmountFromCurrentBet();
		
	}

	/**
	 * Restore original bet amount when amplify bet is deactivated
	 */
	private restoreOriginalBetAmount(): void {
		// Restore display to base bet amount
		if (this.betAmountText) {
			this.betAmountText.setText(formatCurrencyNumber(this.baseBetAmount));
		}
		
		// Keep Buy Feature price in sync
		this.updateFeatureAmountFromCurrentBet();
		
	}

	/**
	 * Reset amplify bet state when bet amount is changed externally
	 */
	private resetAmplifyBetOnBetChange(): void {
		this.amplifyBetController.resetAmplifyBetOnBetChange();
	}


	/**
	 * Apply turbo speed modifications to animations
	 */
	private applyTurboSpeedModifications(): void {
		const gameData = this.getGameData();
		if (!gameData) {
			console.warn('[SlotController] GameData not available for turbo speed modifications');
			return;
		}


		if (gameData.isTurbo) {
			// Apply turbo speed to the UI GameData only.
			// Scene GameData (used by Symbols) will be synchronized separately via
			// forceApplyTurboToSceneGameData to avoid double-scaling.
			const originalWinUp = gameData.winUpDuration;
			const originalDrop = gameData.dropDuration;
			const originalDelay = gameData.dropReelsDelay;
			const originalDuration = gameData.dropReelsDuration;
			
			gameData.winUpDuration = gameData.winUpDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
			gameData.dropDuration = gameData.dropDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
			gameData.dropReelsDelay = gameData.dropReelsDelay * TurboConfig.TURBO_DELAY_MULTIPLIER;
			gameData.dropReelsDuration = gameData.dropReelsDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
			(gameData as any).compressionDelayMultiplier = TurboConfig.TURBO_DELAY_MULTIPLIER;
			
		} else {
			// Reset to normal speed by calling setSpeed with GameConfig delay
			setSpeed(gameData, DELAY_BETWEEN_SPINS);
			(gameData as any).compressionDelayMultiplier = 1;
		}
	}

	/**
	 * Hide the primary controller during bonus mode
	 */
	public hidePrimaryController(): void {
		if (this.primaryControllers) {
			this.primaryControllers.setVisible(false);
		}
		
		// Hide all controller text labels
		this.controllerTexts.forEach(text => {
			text.setVisible(false);
		});
		
		// Hide amplify description container
		this.amplifyBetController.setDescriptionVisible(false);
		
		// Grey out the feature button
		const featureButton = this.buttons.get('feature');
		if (featureButton) {
			featureButton.setAlpha(0.5); // Make it semi-transparent/greyed out
			featureButton.setTint(0x555555); // Apply dark grey tint
			if (this.featureButtonHitbox) {
				this.featureButtonHitbox.disableInteractive();
			}
		}
		
		// Grey out the bet buttons
		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');
		
		if (decreaseBetButton) {
			decreaseBetButton.setAlpha(0.5); // Make it semi-transparent/greyed out
			decreaseBetButton.setTint(0x555555); // Apply dark grey tint
			decreaseBetButton.disableInteractive(); // Disable clicking
		}
		
		if (increaseBetButton) {
			increaseBetButton.setAlpha(0.5); // Make it semi-transparent/greyed out
			increaseBetButton.setTint(0x555555); // Apply dark grey tint
			increaseBetButton.disableInteractive(); // Disable clicking
		}
		
		// Note: Free spin display will be shown separately with actual scatter data
	}

	/**
	 * Hide the primary controller during bonus mode with scatter data
	 */
	public hidePrimaryControllerWithScatter(scatterIndex: number): void {
		// Hide the primary controller first
		this.hidePrimaryController();
		
		// Note: Free spin display will be shown after dialog animations complete
	}

	/**
	 * Show the primary controller after bonus mode ends
	 */
	public showPrimaryController(): void {
		if (this.primaryControllers) {
			this.primaryControllers.setVisible(true);
		}
		
		// Show all controller text labels
		this.controllerTexts.forEach(text => {
			text.setVisible(true);
		});
		
		// Show amplify description container
		this.amplifyBetController.setDescriptionVisible(true);
		
		// Restore the feature button
		const featureButton = this.buttons.get('feature');
		if (featureButton) {
			featureButton.setAlpha(1.0); // Restore full opacity
			if (this.featureButtonHitbox) {
				this.featureButtonHitbox.setInteractive();
			}
		}
		
		// Restore the bet buttons
		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');

		if (decreaseBetButton) {
			decreaseBetButton.setAlpha(1.0); // Restore full opacity before applying limit logic
			decreaseBetButton.setInteractive(); // Re-enable clicking before applying limit logic
		}

		if (increaseBetButton) {
			increaseBetButton.setAlpha(1.0); // Restore full opacity before applying limit logic
			increaseBetButton.setInteractive(); // Re-enable clicking before applying limit logic
		}

		// Apply min/max greying based on the current base bet after bonus ends
		const currentBaseBet = this.getBaseBetAmount() || 0.2;
		this.updateBetLimitButtons(currentBaseBet);

		// Ensure feature/spin states reflect affordability after controller restore.
		this.updateSpinButtonState();
		this.updateFeatureButtonState();
		
		// Hide the free spin display when bonus mode ends
		this.hideFreeSpinDisplay();
		
		// Clear any pending free spins data
		if (this.pendingFreeSpinsData) {
			this.pendingFreeSpinsData = null;
		}
	}

	/**
	 * Create the free spin display elements
	 */
	private createFreeSpinDisplay(scene: Scene): void {
		// Position for free spin display (centrally below control panel)
		const freeSpinX = scene.scale.width * 0.45;
		const freeSpinY = scene.scale.height * 0.81; // Below the control panel
		
		// Create "Remaining" label (first line)
		this.freeSpinLabel = scene.add.text(
			freeSpinX - 20, // Offset to the left to center with the number
			freeSpinY - 10, // First line, positioned above
			'Remaining',
			{
				fontSize: '30px',
				color: '#00ff00', // Bright vibrant green as shown in image
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(15);
		this.controllerContainer.add(this.freeSpinLabel);
		
		// Create "Free Spin : " label (second line)
		this.freeSpinSubLabel = scene.add.text(
			freeSpinX - 15, // Same X position as first line
			freeSpinY + 20, // Second line, positioned below
			'Free Spin : ',
			{
				fontSize: '30px',
				color: '#00ff00', // Bright vibrant green as shown in image
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(15);
		this.controllerContainer.add(this.freeSpinSubLabel);
		
		// Create free spin number display
		this.freeSpinNumber = scene.add.text(
			freeSpinX + 110, // Positioned to the right of the label
			freeSpinY + 5, // Centered vertically between the two lines
			'3', // Default value, will be updated dynamically
			{
				fontSize: '80px', // Larger and bolder than the label
				color: '#ffffff', // Pure white as shown in image
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(15);
		this.controllerContainer.add(this.freeSpinNumber);
		
		// Initially hide the free spin display (only show during bonus mode)
		this.freeSpinLabel.setVisible(false);
		this.freeSpinSubLabel.setVisible(false);
		this.freeSpinNumber.setVisible(false);
		
	}

	/**
	 * Show the free spin display with the specified number of spins
	 */
	public showFreeSpinDisplay(spinsRemaining: number): void {
		if (this.freeSpinDisplaySuppressed) {
			return;
		}
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinNumber.setText(spinsRemaining.toString());
			this.freeSpinLabel.setVisible(true);
			this.freeSpinSubLabel.setVisible(true);
			this.freeSpinNumber.setVisible(true);
		}
	}

	/**
	 * Show the free spin display with the actual free spins won from scatter bonus
	 */
	public showFreeSpinDisplayFromScatter(scatterIndex: number): void {
		if (this.freeSpinDisplaySuppressed) {
			return;
		}
		// The actual free spins value will be passed directly from ScatterAnimationManager
		// This method is called when scatterBonusActivated event is received
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			// Initially show with the scatter index, will be updated with actual value
			this.freeSpinNumber.setText(`Index: ${scatterIndex}`);
			this.freeSpinLabel.setVisible(true);
			this.freeSpinSubLabel.setVisible(true);
			this.freeSpinNumber.setVisible(true);
		}
	}

	/**
	 * Show the free spin display with the actual free spins value
	 */
	public showFreeSpinDisplayWithActualValue(actualFreeSpins: number): void {
		if (this.freeSpinDisplaySuppressed) {
			return;
		}
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinNumber.setText(actualFreeSpins.toString());
			this.freeSpinLabel.setVisible(true);
			this.freeSpinSubLabel.setVisible(true);
			this.freeSpinNumber.setVisible(true);
		}
	}

	/**
	 * Update the free spin display with the actual free spins value
	 */
	public updateFreeSpinDisplayWithActualValue(actualFreeSpins: number): void {
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinNumber.setText(actualFreeSpins.toString());
		}
	}

	/**
	 * Disable the autoplay button (grey out and disable interaction)
	 */
	public disableAutoplayButton(): void {
		const disabledAlpha = 0.5;
		this.disableButtonWithAlpha('autoplay', disabledAlpha);
	}

	/**
	 * Enable the autoplay button (remove grey tint and enable interaction)
	 */
	public enableAutoplayButton(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableAutoplayButton();
			return;
		}
		this.enableButton('autoplay');
	}

	/**
	 * Update autoplay button state based on game conditions
	 */
	public updateAutoplayButtonState(): void {
		const gameData = this.getGameData();
		if (!gameData || !this.buttons.has('autoplay')) {
			return;
		}

		const autoplayButton = this.buttons.get('autoplay');
		if (!autoplayButton) return;

		// Disable autoplay button after cancel while spin/tumbles still running (not during active autoplay)
		const disableBecauseSpinning = gameStateManager.isReelSpinning && !gameStateManager.isAutoPlaying;
		if (disableBecauseSpinning || this.isBuyFeatureControlsLocked()) {
			this.disableAutoplayButton();
		} else {
			this.enableAutoplayButton();
		}
	}

	/**
	 * Hide the free spin display
	 */
	public hideFreeSpinDisplay(): void {
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinLabel.setVisible(false);
			this.freeSpinSubLabel.setVisible(false);
			this.freeSpinNumber.setVisible(false);
		}
	}

	/**
	 * Update the free spin number display
	 * In bonus mode, decrement the display value by 1 for frontend only
	 */
	public updateFreeSpinNumber(spinsRemaining: number): void {
		if (this.freeSpinNumber) {
			// In bonus mode, decrement display value by 1 for frontend only
			const displayValue = spinsRemaining;
			if (gameStateManager.isBonus && spinsRemaining > 0) {
			}
			
			this.freeSpinNumber.setText(displayValue.toString());
		}
	}

	/**
	 * Safely get freespin items from either legacy 'freespin' or camelCase 'freeSpin'
	 */
	private getFreeSpinItems(spinData: SpinData): any[] {
		const fs = spinData?.slot?.freespin || (spinData as any)?.slot?.freeSpin;
		return Array.isArray(fs?.items) ? fs.items : [];
	}

	/**
	 * Compare two 2D number arrays for equality
	 */
	private areasEqual(a: number[][] | undefined, b: number[][] | undefined): boolean {
		if (!a || !b) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			const rowA = a[i];
			const rowB = b[i];
			if (!rowA || !rowB || rowA.length !== rowB.length) return false;
			for (let j = 0; j < rowA.length; j++) {
				if (rowA[j] !== rowB[j]) return false;
			}
		}
		return true;
	}

	private spinsLeftDisplayForFreeSpinItem(items: any[], idx: number): number {
		if (!Array.isArray(items) || idx < 0 || idx >= items.length) return 0;
		const it = items[idx];
		const raw = Number(it?.spinsLeft ?? 0) || 0;
		if (it?.isMaxWin === true && idx > 0) {
			const prev = items[idx - 1];
			if (prev && typeof prev.spinsLeft === 'number') {
				return Math.max(0, Number(prev.spinsLeft) - 1);
			}
		}
		return raw;
	}

	/**
	 * Determine the spinsLeft to display from the provided spinData.
	 * Uses next freeSpin.items.spinsLeft when area match: remaining = next item's spinsLeft.
	 * Priority:
	 * 1) Match by area → use next item's spinsLeft if exists, else current item's
	 * 2) First item with spinsLeft > 0
	 * 3) fs.count if items have no spinsLeft
	 */
	private computeDisplaySpinsLeft(spinData: SpinData): number {
		const items = this.getFreeSpinItems(spinData);
		const fs = spinData?.slot?.freespin || (spinData as any)?.slot?.freeSpin;
		const isFake = !!this.gameAPI?.isFakeDataEnabled?.();

		if (isFake) {
			try {
				const area = (spinData as any)?.slot?.area;
				if (Array.isArray(area) && Array.isArray(items) && items.length > 0) {
					const idx = items.findIndex((it: any) => this.areasEqual(it?.area, area));
					if (idx >= 0) {
						return this.spinsLeftDisplayForFreeSpinItem(items, idx);
					}
				}
			} catch {}

			// No area match (e.g. trigger spin: slot.area has scatters, items[0].area is first free spin result).
			// Use first item's spinsLeft as initial count so display shows correct remaining.
			if (items.length > 0 && typeof items[0]?.spinsLeft === 'number') {
				return items[0].spinsLeft;
			}
			return 0;
		}

		if (items.length === 0) {
			const count = typeof fs?.count === 'number' ? fs.count : 0;
			return count > 0 ? count : 0;
		}

		// Match by area - use NEXT item's spinsLeft for remaining display
		const currentArea = spinData?.slot?.area;
		if (currentArea) {
			const idx = items.findIndex((it: any) => this.areasEqual(it?.area, currentArea));
			if (idx >= 0) {
				const nextItem = items[idx + 1];
				if (nextItem && typeof nextItem.spinsLeft === 'number') {
					return nextItem.spinsLeft;
				}
				const currentItem = items[idx];
				if (currentItem && typeof currentItem.spinsLeft === 'number') {
					return this.spinsLeftDisplayForFreeSpinItem(items, idx);
				}
			}
		}

		// Fallback: first with spinsLeft > 0
		const firstWithSpins = items.find((it: any) => typeof it?.spinsLeft === 'number' && it.spinsLeft > 0);
		if (firstWithSpins) return firstWithSpins.spinsLeft;

		// Last resort from spin data: fs.count
		const count = typeof fs?.count === 'number' ? fs.count : 0;
		return count > 0 ? count : 0;
	}

	/**
	 * Prefer the free spin item's totalWin/subTotalWin when in bonus mode.
	 * Falls back to payline total win if a matching item isn't found.
	 */
	private getBonusSpinWin(spinData: SpinData): number {
		let totalWin = SpinDataUtils.getTotalWin(spinData);
		try {
			const slotAny: any = spinData?.slot || {};
			const fs = slotAny.freespin || slotAny.freeSpin;
			const items = Array.isArray(fs?.items) ? fs.items : [];
			const area = slotAny.area;

			if (items.length > 0 && Array.isArray(area)) {
				const areaJson = JSON.stringify(area);
				const currentItem = items.find((item: any) =>
					Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
				);

				if (currentItem) {
					const itemTotalWinRaw = (currentItem as any).totalWin ?? (currentItem as any).subTotalWin ?? 0;
					const itemTotalWin = Number(itemTotalWinRaw);
					if (!isNaN(itemTotalWin) && itemTotalWin > 0) {
						totalWin = itemTotalWin;
					}
				}
			}
		} catch (e) {
			console.warn('[SlotController] Failed to derive free spin item totalWin; using payline totalWin', e);
		}
		return totalWin;
	}

	private spinDataHasWins(spinData: SpinData | any): boolean {
		try {
			if (!spinData || !spinData.slot) return false;
			if (gameStateManager.isBonus) {
				const bonusWin = this.getBonusSpinWin(spinData);
				if (bonusWin > 0) return true;
			} else {
				const baseWin = this.getBaseSpinWinForBalance(spinData);
				if (baseWin > 0) return true;
			}
			const slotTumbles = spinData?.slot?.tumbles;
			if (Array.isArray(slotTumbles) && slotTumbles.length > 0) {
				return true;
			}
		} catch { }
		return false;
	}

	/**
	 * During buy-feature free spins, balance must only be finalized on TotalWin close.
	 * This blocks intermediate REELS_STOP/WIN_STOP balance syncs.
	 */
	private shouldDeferBalanceSyncToTotalWinDialog(): boolean {
		const buyFeatureSpinLocked = !!this.buyFeatureController?.isSpinLocked?.();
		return (
			buyFeatureSpinLocked ||
			this.isBuyFeatureFreeSpinsActive ||
			this.pendingTotalWinBalanceFinalize ||
			!!gameStateManager.isBuyFeatureSpin
		);
	}

	private getBaseSpinWinForBalance(spinData: SpinData): number {
		try {
			const slotAny: any = spinData?.slot;
			const fs = slotAny?.freespin || slotAny?.freeSpin;
			const fsCount = Number(fs?.count ?? 0);
			const hasFreeSpinItems = Array.isArray(fs?.items) && fs.items.length > 0;
			// If this spin carries free-spin payload, defer all win credit to TotalWin.
			if (hasFreeSpinItems || (Number.isFinite(fsCount) && fsCount > 0) || SpinDataUtils.hasFreeSpins(spinData)) {
				return 0;
			}
			const slotTotalWin = Number(slotAny?.totalWin ?? 0);
			if (Number.isFinite(slotTotalWin) && slotTotalWin > 0) {
				return slotTotalWin;
			}
			const tumbles = slotAny?.tumbles;
			if (Array.isArray(tumbles) && tumbles.length > 0) {
				let total = 0;
				for (const tumble of tumbles) {
					const w = Number((tumble as any)?.win ?? 0);
					if (Number.isFinite(w) && w > 0) {
						total += w;
						continue;
					}
					const outsArr = Array.isArray((tumble as any)?.symbols?.out)
						? (tumble as any).symbols.out
						: [];
					for (const out of outsArr) {
						const ow = Number(out?.win ?? 0);
						total += Number.isFinite(ow) ? ow : 0;
					}
				}
				return total;
			}
		} catch (e) {
			console.warn('[SlotController] Failed to derive base spin win from tumbles/totalWin:', e);
		}
		return SpinDataUtils.getTotalWin(spinData);
	}

	/**
	 * Handle spin logic - either normal API call or free spin simulation
	 */
	private async handleSpin(): Promise<void> {
		if (this.isSpinLocked || gameStateManager.isReelSpinning) {
			return;
		}
		this.balanceController?.finalizeBalanceTweenBeforeSpin();
		this.isSpinLocked = true;
		gameStateManager.isProcessingSpin = true;
		let shouldClearProcessingOnExit = true;
		try {
			if (!this.gameAPI) {
				console.warn('[SlotController] GameAPI not available, falling back to EventBus');
				EventBus.emit('spin');
				gameStateManager.isProcessingSpin = false;
				return;
			}

			// Throttle spin requests slightly to avoid API spam
			try {
				const now = Date.now();
				const elapsed = now - this.lastSpinRequestAt;
				if (elapsed < this.spinRequestMinIntervalMs) {
					const waitMs = this.spinRequestMinIntervalMs - elapsed;
					await new Promise<void>((resolve) => this.scene?.time?.delayedCall?.(waitMs, () => resolve()) || setTimeout(resolve, waitMs));
				}
				this.lastSpinRequestAt = Date.now();
			} catch { }

			// Determine if we're in initialization free-round context.
			// In this mode, spins should not be blocked by base balance checks.
			const inInitFreeRoundContext =
				(gameStateManager as any)?.isInFreeSpinRound === true && !gameStateManager.isBonus;

			// Guard: ensure sufficient balance before proceeding (base-game only).
			if (!inInitFreeRoundContext) {
				try {
					const currentBalance = this.getBalanceAmount();
					if (!this.balanceController?.hasInitializedBalance() || !Number.isFinite(currentBalance)) {
						this.pendingSpinUntilBalanceReady = true;
						gameStateManager.isProcessingSpin = false;
						return;
					}
					const currentBet = this.getBaseBetAmount() || 0;
					const gd = this.getGameData();
					const totalBetToCharge = gd && gd.isEnhancedBet ? currentBet * 1.25 : currentBet;
					if (currentBalance < totalBetToCharge) {
						console.error(`[SlotController] Insufficient balance for spin: ${currentBalance} < ${totalBetToCharge}`);
						if (this.autoplayController?.isActive() || this.gameData?.isAutoPlaying || gameStateManager.isAutoPlaying) {
							this.stopAutoplay();
						}
						this.showOutOfBalancePopup();
						this.updateSpinButtonState();
						// Don't re-enable auxiliary buttons if buy feature flow is active
						if (!this.isBuyFeatureControlsLocked()) {
							this.enableAutoplayButton();
							this.enableBetButtons();
							this.enableAmplifyButton();
						}
						this.enableFeatureButton();
						gameStateManager.isProcessingSpin = false;
						return;
					}
				} catch {}
			}

		// Start dropping old symbols immediately while waiting for spin data response.
		// Keep grave_threat's existing reel-drop style by only pre-dropping old symbols here;
		// new symbol drop still runs in Symbols.dropReels() after SPIN_DATA_RESPONSE.
		if (!gameStateManager.isBonus) {
			try {
				if (this.symbols && typeof this.symbols.startPreSpinDrop === 'function') {
					this.symbols.startPreSpinDrop();
				}
			} catch (e) {
				console.warn('[SlotController] Failed to start pre-spin symbol drop:', e);
			}
		}

		// Play spin sound effect
		if ((window as any).audioManager) {
			(window as any).audioManager.playSoundEffect(SoundEffectType.SPIN);
		}
		
		// Clear any stale pending balance update before starting a new spin
		this.balanceController?.clearPendingBalanceUpdate();

		if (!this.isFreeRoundAutoplay && !inInitFreeRoundContext) {
			this.decrementBalanceByBet();
		}

		try {
			let spinData: SpinData;
			const spinStartTime = Date.now();

				// Show loading spinner only while fetching API and when enabled
				if (LOADING_SPINNER_ENABLED && this.loadingSpinner) {
					this.loadingSpinner.showNow();
				} else if (!LOADING_SPINNER_ENABLED) {
					// no-op when disabled
				} else {
					console.warn('[SlotController] No loadingSpinner instance – spinner will not show');
				}

				// In bonus mode, free spins are driven by FreeSpinController via FREE_SPIN_AUTOPLAY.
				// Do NOT simulate free spins here, otherwise fake freeSpin.items can advance twice
				// (especially during retriggers) and the remaining display will jump (e.g. showing 12).
				if (gameStateManager.isBonus) {
					try { this.symbols?.clearPreSpinDropState?.(); } catch {}
					this.hideSpinner();
					gameStateManager.isProcessingSpin = false;
					return;
				}
				{
					// Use base bet amount for API calls (without amplify bet increase)
					const currentBet = this.getBaseBetAmount() || 10;
					const gameData = this.getGameData();
					const isEnhancedBet = gameData ? gameData.isEnhancedBet : false;
					
					// Check if this is an initialization free spin
					const isInitFreeRound = inInitFreeRoundContext;
					spinData = await this.gameAPI.doSpin(currentBet, false, isEnhancedBet, isInitFreeRound);
					
					// Hide spinner: if simulating, keep it visible for at least LOADING_SPINNER_SIMULATE_MIN_DISPLAY_MS
					const elapsed = Date.now() - spinStartTime;
					const hideDelay = LOADING_SPINNER_SIMULATE_MIN_DISPLAY_MS > 0
						? Math.max(0, LOADING_SPINNER_SIMULATE_MIN_DISPLAY_MS - elapsed)
						: 0;
					if (hideDelay > 0) {
						setTimeout(() => this.hideSpinner(), hideDelay);
					} else {
						this.hideSpinner();
					}
					
					
					// If spinData is null, it means the free spins have ended (422 error handled gracefully)
					if (!spinData) {
						
						// Create a dummy SpinData with initial symbols so reels drop naturally
						spinData = this.createDummySpinDataWithInitialSymbols(currentBet);
					}
				}

				// Display comprehensive spin data information
				
            if (spinData.slot?.area) {
                // area is [column][row]
                for (let col = 0; col < spinData.slot.area.length; col++) {
                }
                // Also show a row-wise view for readability
                const cols = spinData.slot.area.length;
                const rows = cols > 0 ? spinData.slot.area[0].length : 0;
                for (let row = 0; row < rows; row++) {
                    const rowValues: number[] = [];
                    for (let col = 0; col < cols; col++) {
                        rowValues.push(spinData.slot.area[col][row]);
                    }
                }
            } else {
            }
				
				if (spinData.slot?.paylines && spinData.slot.paylines.length > 0) {
					spinData.slot.paylines.forEach((payline, index) => {
					});
				} else {
				}
				
				if (spinData.slot?.freespin) {
				} else {
				}
				

				// Queue a pending balance update for base-game spins (apply after reels stop)
				if (!gameStateManager.isBonus) {
					const winTotal = this.getBaseSpinWinForBalance(spinData);
					if (winTotal > 0) {
						const currentBalance = this.getBalanceAmount();
						const pendingBalance = currentBalance + winTotal;
						this.balanceController?.setPendingBalanceUpdate({
							balance: pendingBalance,
							bet: this.getBaseBetAmount() || 0,
							winnings: winTotal
						});
					}
				}

				
				// Emit the spin data response event
				gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, {
					spinData: spinData
				});
				shouldClearProcessingOnExit = false;

			} catch (error) {
				console.error('[SlotController] ❌ Spin failed:', error);
				// Don't emit the spin event if the API call failed
				try { this.symbols?.clearPreSpinDropState?.(); } catch {}
				gameStateManager.isProcessingSpin = false;
			}
		} finally {
			this.isSpinLocked = false;
			if (shouldClearProcessingOnExit) {
				gameStateManager.isProcessingSpin = false;
			}
		}
	}

	/**
	 * Show the buy feature drawer
	 */
	private showBuyFeatureDrawer(): void {
		this.buyFeatureController.showDrawer();
	}

	/**
	 * Update balance from server using getBalance API
	 */
	private async updateBalanceFromServer(): Promise<void> {
		await this.balanceController?.updateBalanceFromServer();
	}

	/**
	 * Setup bonus mode event listener to hide/show primary controller
	 */
	private setupBonusModeEventListener(): void {
		if (!this.scene) {
			console.warn('[SlotController] Cannot setup bonus mode listener - scene not available');
			return;
		}

		
		// Listen for bonus mode events from the scene
		this.scene.events.on('setBonusMode', (isBonus: boolean) => {
			if (isBonus) {
				this.hasFinalizedBonusBalanceForCurrentRound = false;
				this.pendingTotalWinBalanceFinalize = false;
				this.balanceController?.clearPendingBalanceUpdate();
				this.hidePrimaryController();
				// Always keep the buy feature disabled during bonus mode
				this.canEnableFeatureButton = false;
				this.disableFeatureButton();
				// If buy feature spin lock is active, mark that we're in buy feature free spins
				if (this.buyFeatureController.isSpinLocked()) {
					this.isBuyFeatureFreeSpinsActive = true;
				}
			} else {
				// Do not clear TotalWin finalization flags here.
				// For end-of-free-spin flow, Dialogs emits setBonusMode(false) before
				// dialogAnimationsComplete, and clearing these flags here can skip
				// the final bonus credit to balance.
				this.showPrimaryController();
				// Clear buy feature free spins flag when bonus ends and release buy-feature locks.
				// Do NOT gate on gameStateManager.isBonusFinished: Game clears this flag early in setBonusMode(false),
				// which can leave controller buttons permanently disabled after the final free spin.
				const hadBuyFeatureLock =
					(this.buyFeatureController?.isSpinLocked?.() ?? false) || this.isBuyFeatureFreeSpinsActive;
				this.isBuyFeatureFreeSpinsActive = false;
				if (hadBuyFeatureLock) {
					this.buyFeatureController.setSpinLock(false);
					// Re-enable all auxiliary buttons now that buy feature sequence is complete
					this.updateAllAuxiliaryButtonStates();
				}
				// Clear any pending free spins data when bonus mode ends
				if (this.pendingFreeSpinsData) {
					this.pendingFreeSpinsData = null;
				}
				// Allow feature button to be enabled again (now that bonus is off)
				this.canEnableFeatureButton = true;
				// Re-enable buy feature only after bonus is fully deactivated
				this.enableFeatureButton();
				this.updateSpinButtonState();
				// Defer UI refresh so Game's setBonusMode handler can clear bonus flags first
				if (this.scene?.time) {
					this.scene.time.delayedCall(0, () => {
						this.updateSpinButtonState();
						this.updateAllAuxiliaryButtonStates();
						this.updateFeatureButtonState();
					});
				} else {
					this.updateAllAuxiliaryButtonStates();
					this.updateFeatureButtonState();
				}
			}
		});

		// Ensure free spin UI is hidden on generic bonus-reset events as well
		this.scene.events.on('resetFreeSpinState', () => {
			this.hideFreeSpinDisplay();
			this.freeSpinDisplayOverride = null;
			this.pendingFreeSpinsData = null;
			// Only release buy feature spin lock if bonus has actually finished
			if (gameStateManager.isBonusFinished) {
				this.buyFeatureController.setSpinLock(false);
				// Re-enable all auxiliary buttons now that buy feature sequence is complete
				this.updateAllAuxiliaryButtonStates();
			} else {
			}
			this.updateSpinButtonState();
		});

		// Also hide free spin UI when bonus header is hidden (defensive in case setBonusMode is not emitted)
		this.scene.events.on('hideBonusHeader', () => {
			this.hideFreeSpinDisplay();
			// Only release buy feature spin lock if bonus has actually finished
			if (gameStateManager.isBonusFinished) {
				this.buyFeatureController.setSpinLock(false);
				// Re-enable all auxiliary buttons now that buy feature sequence is complete
				this.updateAllAuxiliaryButtonStates();
			} else {
			}
			this.updateSpinButtonState();
		});

		// Listen for scatter bonus events with scatter index and actual free spins
		this.scene.events.on('scatterBonusActivated', (data: { scatterIndex: number; actualFreeSpins: number; isRetrigger?: boolean; fromUnresolvedSpin?: boolean }) => {
			
			// Pause normal base-game autoplay when scatter is hit so it can be resumed
			// after the free spin bonus completes (mirrors shuten_doji behavior).
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			if (spinsRemaining > 0) {
				this.pauseAutoplay('scatterBonusActivated');
			}
			
		// Keep controls disabled/greyed out while scatter/bonus sequence proceeds
		this.lockControlsForScatterOrBonus();
			
			this.hidePrimaryControllerWithScatter(data.scatterIndex);
			// Store the free spins data for later display after dialog closes
			this.pendingFreeSpinsData = data;
			
			// Retrigger UI updates are handled by the standard FREE_SPIN_AUTOPLAY spinData-driven updates.
		});

		// Deterministic fake-data retrigger values computed at the retrigger source (Symbols).
		// This avoids relying on GameAPI.getCurrentSpinData() during dialog close, which can be stale.
		this.scene.events.on('fakeDataRetriggerComputed', (payload: { nextSpinsLeft?: number; added?: number } | null) => {
			try {
				const isFake = !!this.gameAPI?.isFakeDataEnabled?.();
				if (!isFake) return;
				const next = Math.max(0, Number(payload?.nextSpinsLeft ?? 0) || 0);
				const added = Math.max(0, Number(payload?.added ?? 0) || 0);
				if (next > 0) {
					this.pendingFakeDataRetriggerNextSpinsLeft = next;
					this.pendingFakeDataRetriggerAdded = added;
				}
			} catch {}
		});

		// Listen for dialog animations completion to show free spin display
		this.scene.events.on('dialogAnimationsComplete', () => {
			const isFake = !!this.gameAPI?.isFakeDataEnabled?.();

			// Finalize bonus balance only after TotalWin has been closed by the player.
			if (this.pendingTotalWinBalanceFinalize) {
				this.pendingTotalWinBalanceFinalize = false;
				this.finalizeBonusBalanceAfterTotalWinDialog();
			}

			// Fake-data mode: free spin remaining display must come only from the current SpinData item's spinsLeft.
			// Do not use overrides, pending scatter counts, Symbols counters, or UI-side decrements.
			if (isFake) {
				try {
					const apiSpinData = this.gameAPI?.getCurrentSpinData();
					let left = apiSpinData ? this.computeDisplaySpinsLeft(apiSpinData as any) : 0;
					// Fake-data initial dialog close: if area-match isn't possible yet, initialize from items[0].spinsLeft.
					if (left <= 0 && apiSpinData) {
						try {
							const fs = (apiSpinData as any)?.slot?.freespin || (apiSpinData as any)?.slot?.freeSpin;
							const items = Array.isArray(fs?.items) ? fs.items : [];
							const firstVal = items.length > 0 ? Number(items[0]?.spinsLeft ?? 0) : 0;
							if (firstVal > 0) {
								left = firstVal;
							}
						} catch { }
					}
					// Strict retrigger behavior in fake-data mode:
					// - Initial trigger dialog close shows raw spinsLeft.
					// - Retrigger dialog close shows spinsLeft - 1.
					const isRetriggerDialog = !!(this.pendingFreeSpinsData && (this.pendingFreeSpinsData as any).isRetrigger);
					let baseLeft = left;
					if (isRetriggerDialog && this.pendingFakeDataRetriggerNextSpinsLeft !== null) {
						baseLeft = this.pendingFakeDataRetriggerNextSpinsLeft;
					}
					if (isRetriggerDialog && apiSpinData) {
						try {
							const fs = (apiSpinData as any)?.slot?.freespin || (apiSpinData as any)?.slot?.freeSpin;
							const items = Array.isArray(fs?.items) ? fs.items : [];
							const slotArea = (apiSpinData as any)?.slot?.area;
							if (Array.isArray(items) && items.length > 0 && Array.isArray(slotArea)) {
								const areaJson = JSON.stringify(slotArea);
								const idx = items.findIndex((it: any) => Array.isArray(it?.area) && JSON.stringify(it.area) === areaJson);
								const nextVal = idx >= 0 ? Number(items[idx + 1]?.spinsLeft ?? 0) : 0;
								if (nextVal > 0) {
									baseLeft = nextVal;
								}
							}
						} catch {}
					}
					const displayLeft = isRetriggerDialog ? Math.max(0, baseLeft - 1) : baseLeft;
					this.showFreeSpinDisplayWithActualValue(displayLeft);
				} catch (e) {
					console.warn('[SlotController] Fake-data mode: failed to initialize free spin display from spinsLeft:', e);
				}
				this.pendingFreeSpinsData = null;
				this.pendingFakeDataRetriggerNextSpinsLeft = null;
				this.pendingFakeDataRetriggerAdded = null;
				this.freeSpinDisplayOverride = null;
				this.shouldSubtractOneFromServerFsDisplay = false;
				this.uiFsDecrementApplied = false;
				return;
			}
			
			// If free spin autoplay is active, do NOT reinitialize the counter from API; keep Symbols' tracked value
			let skipInitialization = false;
			try {
				const symbolsComponent = (this.scene as any)?.symbols;
				if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function') {
					if (symbolsComponent.isFreeSpinAutoplayActive()) {
						skipInitialization = true;
					}
				}
			} catch {}

			if (skipInitialization) {
				// If autoplay already started, ensure the display is visible using the latest known values.
				try {
					const isVisible = !!this.freeSpinNumber?.visible;
					if (!isVisible) {
						if (this.freeSpinDisplayOverride !== null) {
							this.showFreeSpinDisplayWithActualValue(this.freeSpinDisplayOverride as number);
						} else if (this.pendingFreeSpinsData) {
							this.showFreeSpinDisplayWithActualValue(this.pendingFreeSpinsData.actualFreeSpins);
							this.pendingFreeSpinsData = null;
						} else {
							const symbolsComponent = (this.scene as any)?.symbols;
							const remaining = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
							if (typeof remaining === 'number') {
								this.showFreeSpinDisplayWithActualValue(remaining);
							}
						}
					}
				} catch (e) {
					console.warn('[SlotController] Failed to show free spin display during autoplay:', e);
				}
			}

			if (!skipInitialization) {
				// Prefer to initialize from the first freeSpin item's spinsLeft (supports freespin and freeSpin)
				let initializedFromFreeSpinData = false;
				try {
					// If we have an override (e.g., from retrigger), prefer to show that and skip server initialization
					if (this.freeSpinDisplayOverride !== null) {
						try {
							this.showFreeSpinDisplayWithActualValue(this.freeSpinDisplayOverride as number);
							initializedFromFreeSpinData = true;
						} catch {}
					}
					
					if (!initializedFromFreeSpinData) {
						const apiSpinData = this.gameAPI?.getCurrentSpinData();
						const fs = apiSpinData?.slot?.freespin || (apiSpinData as any)?.slot?.freeSpin;
						if (fs?.items && fs.items.length > 0) {
							const firstItem = fs.items[0];
							const initialSpinsLeft = typeof firstItem?.spinsLeft === 'number' ? firstItem.spinsLeft : 0;
							if (initialSpinsLeft > 0) {
								this.showFreeSpinDisplayWithActualValue(initialSpinsLeft);
								initializedFromFreeSpinData = true;
							}
						}
					}
				} catch (e) {
					console.warn('[SlotController] Failed to initialize from freeSpin data:', e);
				}
				
				// Fallback to any pending data if we couldn't initialize from freeSpin items
				if (!initializedFromFreeSpinData) {
					if (this.pendingFreeSpinsData) {
						this.showFreeSpinDisplayWithActualValue(this.pendingFreeSpinsData.actualFreeSpins);
						this.pendingFreeSpinsData = null;
					} else {
					}
				}
			}

			// If an autoplay spin was already triggered before the display appeared, apply the -1 now (deferred UI decrement)
			try {
				if (gameStateManager.isBonus && this.freeSpinNumber) {
					const isFake = !!this.gameAPI?.isFakeDataEnabled?.();
					if (isFake) {
						return;
					}
					if (this.shouldSubtractOneFromServerFsDisplay && !this.uiFsDecrementApplied) {
						const currentText = (this.freeSpinNumber.text || '').toString().trim();
						const currentVal = parseInt(currentText, 10);
						if (!isNaN(currentVal) && currentVal > 0) {
							const decremented = Math.max(0, currentVal - 1);
							this.freeSpinNumber.setText(decremented.toString());
							this.uiFsDecrementApplied = true;
						}
					}
				}
			} catch (e) {
				console.warn('[SlotController] Failed to apply deferred -1 after dialog:', e);
			}
		});

		// Listen for free spin autoplay events
		gameEventManager.on(GameEventType.FREE_SPIN_AUTOPLAY, async () => {
			try { this.symbols?.clearPreSpinDropState?.(); } catch {}
			const isFake = !!this.gameAPI?.isFakeDataEnabled?.();
			if (isFake && this.freeSpinAutoplaySimInFlight) {
				console.warn('[SlotController] FREE_SPIN_AUTOPLAY ignored (fake-data simulateFreeSpin already in-flight)');
				return;
			}
			
			// Keep free-spin autoplay behavior unchanged: no pre-spin drop kickoff here.
			
			// Apply turbo mode to scene game data (same as normal autoplay)
			this.forceApplyTurboToSceneGameData();

			// Fake-data mode: do not use UI-side decrements; display comes from spinsLeft only.
			if (!isFake) {
				// Decrement UI at REELS_START
				this.shouldSubtractOneFromServerFsDisplay = true;
				this.uiFsDecrementApplied = false;
			}
			
			if (gameStateManager.isBonus && this.gameAPI && this.symbols) {
				try {
					if (isFake) {
						this.freeSpinAutoplaySimInFlight = true;
					}
					// Get free spin data from GameAPI directly (this should have the original scatter data)
					const gameAPISpinData = this.gameAPI.getCurrentSpinData();
					if (gameAPISpinData && (gameAPISpinData.slot?.freespin?.items || gameAPISpinData.slot?.freeSpin?.items)) {
						const freespinData = gameAPISpinData.slot?.freespin || gameAPISpinData.slot?.freeSpin;
					} else {
						console.error('[SlotController] No free spin data available in GameAPI');
						console.error('[SlotController] GameAPI currentSpinData:', gameAPISpinData);
						console.error('[SlotController] GameAPI currentSpinData.slot:', gameAPISpinData?.slot);
						console.error('[SlotController] GameAPI currentSpinData.slot.freespin:', gameAPISpinData?.slot?.freespin);
						console.error('[SlotController] GameAPI currentSpinData.slot.freeSpin:', gameAPISpinData?.slot?.freeSpin);
						console.error('[SlotController] GameAPI currentSpinData.slot.freespin.items:', gameAPISpinData?.slot?.freespin?.items);
						console.error('[SlotController] GameAPI currentSpinData.slot.freeSpin.items:', gameAPISpinData?.slot?.freeSpin?.items);
						return;
					}
					
					// Use our free spin simulation
					const spinData = await this.gameAPI.simulateFreeSpin();
					// DEBUG: Log the full spinData for troubleshooting
					
					// Compute spinsLeft from spin data - ALWAYS use spin data as source of truth
					const serverSpinsLeft = this.computeDisplaySpinsLeft(spinData);
					const displaySpins = isFake ? Math.max(0, serverSpinsLeft - 1) : serverSpinsLeft;
					try {
						const symbolsComponent = (this.scene as any)?.symbols;
						if (!isFake && symbolsComponent && typeof symbolsComponent.setFreeSpinAutoplaySpinsRemaining === 'function') {
							symbolsComponent.setFreeSpinAutoplaySpinsRemaining(serverSpinsLeft);
						}
					} catch (e) {
						console.warn('[SlotController] Failed to sync Symbols free spin counter during autoplay:', e);
					}
					this.updateFreeSpinNumber(displaySpins);

					// Check if there are any more free spins - spinsLeft from spin data
					const remainingAfterSpin = serverSpinsLeft;
					if (remainingAfterSpin <= 0) {
						// No more free spins - mark bonus finished and show total win dialog
						gameStateManager.isBonusFinished = true;
						this.shouldSubtractOneFromServerFsDisplay = false;
						this.uiFsDecrementApplied = false;
					}

					// Process the spin data directly for free spin autoplay
					if (this.scene && (this.scene as any).symbols) {
						const symbolsComponent = (this.scene as any).symbols;
						if (symbolsComponent && typeof symbolsComponent.processSpinData === 'function') {
							symbolsComponent.processSpinData(spinData);
						} else {
							gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, {
								spinData: spinData
							});
						}
					} else {
						gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, {
							spinData: spinData
						});
					}

				} catch (error) {
					console.error('[SlotController] Free spin simulation failed:', error);
				} finally {
					if (isFake) {
						this.freeSpinAutoplaySimInFlight = false;
					}
				}
			} else {
				console.warn('[SlotController] Not in bonus mode or GameAPI not available for free spin autoplay');
			}
		});

		// Listen for scatter bonus activation to reset free spin index (but NOT on retriggers)
		this.scene.events.on('scatterBonusActivated', (data: { scatterIndex: number; actualFreeSpins: number; isRetrigger?: boolean; fromUnresolvedSpin?: boolean }) => {
			const isRetrigger = !!(data && (data as any).isRetrigger);
			const fromUnresolvedSpin = !!(data && (data as any).fromUnresolvedSpin);
			if (fromUnresolvedSpin) {
				return;
			}
			if (isRetrigger) {
				return;
			}
			if (this.gameAPI) {
				this.gameAPI.resetFreeSpinIndex();
			}
		});

	}

	/**
	 * Setup spin state change listener
	 */
	private setupSpinStateListener(): void {
		if (!this.gameData) {
			console.warn('[SlotController] GameData not available for spin state listener');
			return;
		}

		// No more polling - we'll manage button state purely through events
	}

	/**
	 * Setup listener for dialog shown events to detect when TotalWin dialog appears
	 */
	private setupDialogShownListener(): void {
		if (!this.scene) {
			console.warn('[SlotController] Scene not available for dialog listener');
			return;
		}

		this.scene.events.on('dialogShown', (dialogType: string) => {
			if (dialogType === 'TotalWin') {
				this.pendingTotalWinBalanceFinalize = true;
			}
			
			// If the TotalWin dialog is shown at the end of bonus, release buy-feature locks
			// and re-evaluate control states so buttons are not left disabled.
			if (dialogType === 'TotalWin' && (this.isBuyFeatureFreeSpinsActive || this.buyFeatureController?.isSpinLocked?.())) {
				this.buyFeatureController?.setSpinLock(false);
				this.isBuyFeatureFreeSpinsActive = false;
				this.updateBetButtonsStateWithLock();
				this.updateAutoplayButtonStateWithLock();
				this.updateTurboButtonStateWithLock();
				this.updateAmplifyButtonStateWithLock();
				this.enableBetBackgroundInteraction('TotalWin dialog shown');
			}
		});
	}

	private async finalizeBonusBalanceAfterTotalWinDialog(): Promise<void> {
		if (this.hasFinalizedBonusBalanceForCurrentRound) {
			return;
		}

		try {
			const bonusTotal = this.getFinalBonusTotalForBalance();
			if (!(bonusTotal > 0)) {
				return;
			}
			this.hasFinalizedBonusBalanceForCurrentRound = true;

			if (this.gameAPI?.getDemoState?.()) {
				const oldBalance = this.getBalanceAmount();
				const newBalance = oldBalance + bonusTotal;
				this.updateBalanceAmount(newBalance);
				this.gameAPI?.updateDemoBalance(newBalance);
				return;
			}

			// Free spins are simulated client-side; server balance may not include this total yet.
			// Sync from server first, then top up locally if the expected bonus credit is still missing.
			const beforeSyncBalance = this.getBalanceAmount();
			const expectedAfterBonus = beforeSyncBalance + bonusTotal;
			await this.updateBalanceFromServer();
			const afterSyncBalance = this.getBalanceAmount();

			if (afterSyncBalance + 0.01 < expectedAfterBonus) {
				const missing = expectedAfterBonus - afterSyncBalance;
				this.updateBalanceAmount(expectedAfterBonus);
			} else {
			}
		} catch (e) {
			this.hasFinalizedBonusBalanceForCurrentRound = false;
			console.error('[SlotController] Failed to finalize balance on TotalWin:', e);
		}
	}

	private getFinalBonusTotalForBalance(): number {
		try {
			const dialogsAny: any = (this.scene as any)?.dialogs;
			const dialogValue = Number(dialogsAny?.numberTargetValue ?? 0);
			if (Number.isFinite(dialogValue) && dialogValue > 0) {
				return dialogValue;
			}
		} catch { }

		try {
			const bonusHeader = (this.scene as any)?.bonusHeader;
			const cumulative = Number(bonusHeader?.getCumulativeBonusWin?.() ?? 0);
			if (Number.isFinite(cumulative) && cumulative > 0) {
				return cumulative;
			}
			const currentDisplayed = Number(bonusHeader?.getCurrentWinnings?.() ?? 0);
			if (Number.isFinite(currentDisplayed) && currentDisplayed > 0) {
				return currentDisplayed;
			}
		} catch { }

		try {
			const spinData: any = this.gameAPI?.getCurrentSpinData() || (this.scene as any)?.symbols?.currentSpinData;
			const slot = spinData?.slot;
			if (!slot) return 0;

			const fs = slot.freespin || slot.freeSpin;
			const fsTotal = Number(fs?.totalWin ?? 0);
			if (Number.isFinite(fsTotal) && fsTotal > 0) {
				return fsTotal;
			}

			const slotTotal = Number(slot.totalWin ?? 0);
			if (Number.isFinite(slotTotal) && slotTotal > 0) {
				return slotTotal;
			}

			if (Array.isArray(fs?.items) && fs.items.length > 0) {
				return fs.items.reduce((sum: number, item: any) => {
					const itemTotal = Number(item?.totalWin ?? item?.subTotalWin ?? 0);
					return sum + (Number.isFinite(itemTotal) ? itemTotal : 0);
				}, 0);
			}
		} catch { }

		return 0;
	}

	/**
	 * Refresh the GameData reference from the scene
	 */
	private refreshGameDataReference(): void {
		if (this.scene && this.scene.scene.key === 'Game') {
			const newGameData = (this.scene as any).gameData;
			if (newGameData && newGameData !== this.gameData) {
				this.gameData = newGameData;
			}
		}
	}

	/**
	 * Get the current GameData instance, refreshing if needed
	 */
	private getGameData(): GameData | null {
		if (!this.gameData) {
			this.refreshGameDataReference();
		}
		return this.gameData;
	}

	/**
	 * Disable the spin button
	 */
	public disableSpinButton(): void {
		if (this.spinButtonController) {
			this.spinButtonController.disable();
		}
		const spinButton = this.buttons.get('spin');
		if (spinButton) {
			spinButton.disableInteractive();
			spinButton.setTint(0x666666);
		}
		if (this.spinIcon) {
			this.spinIcon.setAlpha(0.5);
			this.spinIcon.setTint(0x666666);
		}
		if (this.spinIconTween) {
			this.spinIconTween.pause();
		}
	}

	/**
	 * Enable the spin button
	 */
	public enableSpinButton(): void {
		if (this.isSpinLocked || gameStateManager.isReelSpinning || this.isBuyFeatureControlsLocked()) {
			this.disableSpinButton();
			return;
		}
		if (this.spinButtonController) {
			this.spinButtonController.enable();
		}
		const spinButton = this.buttons.get('spin');
		if (spinButton) {
			spinButton.setAlpha(1.0);
			spinButton.clearTint();
			spinButton.setInteractive();
		}
		if (this.spinIcon) {
			this.spinIcon.setAlpha(1.0);
			this.spinIcon.clearTint();
		}
		if (this.spinIconTween) {
			this.spinIconTween.resume();
		}
	}

	/**
	 * Public method to manually update spin button state
	 */
	public updateSpinButtonState(): void {
		const gameData = this.getGameData();
		if (!gameData || !this.buttons.has('spin')) {
			// Keep feature button synced even if spin is not ready yet.
			this.updateFeatureButtonState();
			return;
		}

		const spinButton = this.buttons.get('spin');
		if (!spinButton) return;

		if (this.isSpinLocked) {
			this.disableSpinButton();
			this.updateFeatureButtonState();
			return;
		}

		if (this.isBuyFeatureControlsLocked()) {
			this.disableSpinButton();
			this.updateFeatureButtonState();
			return;
		}

		if (gameStateManager.isScatter || gameStateManager.isBonus) {
			this.disableSpinButton();
			this.updateFeatureButtonState();
			return;
		}

		if (this.balanceController?.hasPendingBalanceUpdate()) {
			this.disableSpinButton();
			this.updateFeatureButtonState();
			return;
		}

		// Disable spin when balance is insufficient for the selected bet.
		try {
			const baseBet = this.getBaseBetAmount() || 0;
			const requiredBet = gameData.isEnhancedBet ? baseBet * 1.25 : baseBet;
			const balance = this.getBalanceAmount() || 0;
			if (requiredBet > 0 && balance + 1e-9 < requiredBet) {
				this.disableSpinButton();
				this.updateFeatureButtonState();
				this.updateAmplifyButtonStateWithLock();
				return;
			}
		} catch {}

		try {
			const symbolsComponent: any = (this.scene as any)?.symbols;
			const scatterManager = symbolsComponent?.scatterAnimationManager;
			if (scatterManager && typeof scatterManager.isAnimationInProgress === 'function' && scatterManager.isAnimationInProgress()) {
				this.disableSpinButton();
				this.updateFeatureButtonState();
				return;
			}
		} catch {}

		// Autoplay ended when GSM says so and counter is 0; don't let stale gameData block
		const autoplayEnded = !gameStateManager.isAutoPlaying && this.getAutoplaySpinsRemaining() <= 0;
		if (gameData.isAutoPlaying && !autoplayEnded) {
			this.disableSpinButton();
			this.updateFeatureButtonState();
			return;
		}

		// Simple logic: disable if spinning or autoplay active, enable otherwise
		if ((gameData.isAutoPlaying && !autoplayEnded) || gameStateManager.isReelSpinning) {
			this.disableSpinButton();
		} else {
			this.enableSpinButton();
		}
		// Also update feature button state whenever spin button state changes
		this.updateFeatureButtonState();
		// Keep amplify affordablity synced too.
		this.updateAmplifyButtonStateWithLock();
	}

	/**
	 * Public method to update feature button state based on game conditions
	 */
	public updateFeatureButtonState(): void {
		if (!this.isBuyFeatureControlsLocked() && !gameStateManager.isBonus && this.canEnableFeatureButton) {
			const gameData = this.getGameData();
			if (!gameData || gameData.isEnhancedBet) {
				this.disableFeatureButton();
				return;
			}

			// Disable buy-feature if balance is insufficient for its price.
			try {
				const price = this.getBuyFeaturePrice();
				const balance = this.getBalanceAmount() || 0;
				if (price > 0 && balance + 1e-9 < price) {
					this.disableFeatureButton();
					return;
				}
			} catch {}

			this.enableFeatureButton();
		} else {
			this.disableFeatureButton();
		}
	}

	/**
	 * Update autoplay button state - disable during buy feature spin sequence
	 */
	public updateAutoplayButtonStateWithLock(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableAutoplayButton();
			return;
		}
		// Otherwise use normal state logic
		this.updateAutoplayButtonState();
	}

	/**
	 * Update turbo button state - disable during buy feature spin sequence
	 */
	public updateTurboButtonStateWithLock(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableTurboButton();
			return;
		}
		// Otherwise use normal state logic
		this.updateTurboButtonState();
	}

	/**
	 * Update bet buttons state - disable during buy feature spin sequence and free spins
	 */
	public updateBetButtonsStateWithLock(): void {
		// Keep disabled if buy feature flow/free spins are active
		if (this.isBuyFeatureControlsLocked()) {
			this.disableBetButtons();
			this.disableBetBackgroundInteraction('buy feature spin lock or free spins active');
			return;
		}
		// Otherwise enable bet buttons
		this.enableBetButtons();
		this.enableBetBackgroundInteraction('buy feature spin lock released');
	}

	/**
	 * Update amplify button state - disable during buy feature spin sequence
	 */
	public updateAmplifyButtonStateWithLock(): void {
		if (this.isBuyFeatureControlsLocked()) {
			this.disableAmplifyButton();
			return;
		}
		// Disable amplify when balance is insufficient for the current bet (or for enabling amplify).
		try {
			const isBalanceReady = this.balanceController?.hasInitializedBalance() ?? false;
			if (isBalanceReady) {
				const gameData = this.getGameData();
				const baseBet = this.getBaseBetAmount() || 0;
				const requiredBet = gameData?.isEnhancedBet ? baseBet * 1.25 : baseBet;
				const requiredBetIfAmplified = baseBet * 1.25;
				const balance = this.getBalanceAmount() || 0;
				if (
					(requiredBet > 0 && balance + 1e-9 < requiredBet) ||
					(!gameData?.isEnhancedBet && requiredBetIfAmplified > 0 && balance + 1e-9 < requiredBetIfAmplified)
				) {
					this.disableAmplifyButton();
					return;
				}
			}
		} catch {}
		// Otherwise enable amplify button
		this.enableAmplifyButton();
	}

	/**
	 * Update all auxiliary button states (autoplay, turbo, bet, amplify) during buy feature sequence
	 */
	private updateAllAuxiliaryButtonStates(): void {
		this.updateAutoplayButtonStateWithLock();
		this.updateTurboButtonStateWithLock();
		this.updateBetButtonsStateWithLock();
		this.updateAmplifyButtonStateWithLock();
	}

	/**
	 * Get the current state of the spin button
	 */
	public isSpinButtonEnabled(): boolean {
		const spinButton = this.buttons.get('spin');
		return spinButton ? spinButton.input?.enabled || false : false;
	}

	/**
	 * Force refresh the spin button state
	 */
	public refreshSpinButtonState(): void {
		this.updateSpinButtonState();
	}

	/**
	 * Re-enable the spin button (force enable regardless of state)
	 */
	public reEnableSpinButton(): void {
		
		// Log current state for debugging
		const gameData = this.getGameData();
		if (gameData) {
		}
		
		// Simply enable the button
		this.enableSpinButton();
	}

	/**
	 * Manually trigger spin button state update (useful for external components)
	 */
	public forceUpdateSpinButtonState(): void {
		this.updateSpinButtonState();
	}

	/**
	 * Get current state information for debugging
	 */
	public getSpinButtonStateInfo(): string {
		const gameData = this.getGameData();
		if (!gameData) {
			return 'GameData not available';
		}
		
		const isEnabled = this.isSpinButtonEnabled();
		return `Spin Button: ${isEnabled ? 'ENABLED' : 'DISABLED'} | isReelSpinning: ${gameStateManager.isReelSpinning} | isAutoPlaying: ${gameData.isAutoPlaying}`;
	}

	/**
	 * Get current GameData animation timing values for debugging
	 */
	public getGameDataAnimationInfo(): string {
		const gameData = this.getGameData();
		if (!gameData) {
			return 'GameData not available';
		}
		
		return `GameData Animation Values: winUpDuration=${gameData.winUpDuration}, dropDuration=${gameData.dropDuration}, dropReelsDelay=${gameData.dropReelsDelay}, dropReelsDuration=${gameData.dropReelsDuration}, isTurbo=${gameData.isTurbo}`;
	}

	/**
	 * Force apply turbo speed to scene GameData (used by Symbols component)
	 */
	public forceApplyTurboToSceneGameData(): void {
		if (!this.scene || !(this.scene as any).gameData) {
			console.warn('[SlotController] Scene or scene GameData not available');
			return;
		}
		const sceneGameData = (this.scene as any).gameData;
		const gameData = this.getGameData();
		
		if (gameData) {
			if (gameData.isTurbo) {
				
				// Sync scene GameData from UI GameData, then apply turbo multipliers once
				sceneGameData.winUpDuration = gameData.winUpDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
				sceneGameData.dropDuration = gameData.dropDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
				sceneGameData.dropReelsDelay = gameData.dropReelsDelay * TurboConfig.TURBO_DELAY_MULTIPLIER;
				sceneGameData.dropReelsDuration = gameData.dropReelsDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
				(sceneGameData as any).compressionDelayMultiplier = TurboConfig.TURBO_DELAY_MULTIPLIER;
				
			} else {
				setSpeed(sceneGameData, DELAY_BETWEEN_SPINS);
				(sceneGameData as any).compressionDelayMultiplier = 1;
				
			}
		}
	}

	/**
	 * Clear any pending balance updates
	 */
	public clearPendingBalanceUpdate(): void {
		this.balanceController?.clearPendingBalanceUpdate();
	}

	/**
	 * Get current pending balance update for debugging
	 */
	public getPendingBalanceUpdate(): { balance: number; bet: number; winnings?: number } | null {
		return this.balanceController?.getPendingBalanceUpdate() ?? null;
	}

	/**
	 * Check if there are pending balance updates
	 */
	public hasPendingBalanceUpdate(): boolean {
		return this.balanceController?.hasPendingBalanceUpdate() ?? false;
	}

	/**
	 * Check if there are pending winnings to be added
	 */
	public hasPendingWinnings(): boolean {
		return this.balanceController?.hasPendingWinnings() ?? false;
	}

	/**
	 * Get the amount of pending winnings
	 */
	public getPendingWinnings(): number {
		return this.balanceController?.getPendingWinnings() ?? 0;
	}

	/**
	 * Force apply pending balance update (useful for debugging or special cases)
	 */
	public forceApplyPendingBalanceUpdate(): void {
		this.balanceController?.forceApplyPendingBalanceUpdate();
	}

	/**
	 * Log current state for debugging
	 */
	public logCurrentState(): void {
		const gameData = this.getGameData();
		if (!gameData) {
			return;
		}
		
	}

	/**
	 * Create a dummy SpinData with initial symbols (same as game start)
	 * Used when 422 error occurs to allow reels to drop naturally
	 */
	private createDummySpinDataWithInitialSymbols(bet: number): any {
		
		// Initial symbols from Symbols.ts createInitialSymbols() - row-major format
		const initialRowMajor = [
			[0, 1, 3, 1, 0, 2],
			[1, 5, 2, 5, 2, 4],
			[2, 5, 5, 1, 5, 3],
			[3, 4, 1, 2, 4, 1],
			[4, 2, 0, 3, 1, 5],
		];
		
		// Convert to column-major format [col][row] for SpinData
		const rowCount = initialRowMajor.length;      // 5
		const colCount = initialRowMajor[0].length;   // 6
		const columnMajor: number[][] = [];
		
		for (let col = 0; col < colCount; col++) {
			const column: number[] = [];
			for (let row = 0; row < rowCount; row++) {
				column.push(initialRowMajor[row][col]);
			}
			columnMajor.push(column);
		}
		
		// Create dummy SpinData with no wins
		const dummySpinData = {
			playerId: 'dummy',
			bet: bet.toString(),
			slot: {
				area: columnMajor,
				paylines: [],
				tumbles: [],
				freespin: {
					count: 0,
					totalWin: 0,
					items: []
				}
			}
		};
		
		return dummySpinData;
	}
}





