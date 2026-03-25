import { Scene } from 'phaser';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';
import { SoundEffectType } from '../../managers/AudioManager';
import { NumberDisplay, NumberDisplayConfig } from './NumberDisplay';
import { RadialLightTransition } from './RadialLightTransition';
import { gameStateManager } from '../../managers/GameStateManager';
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { EventBus } from '../EventBus';
import { UI_CONFIG, WIN_THRESHOLDS, TIMING_CONFIG } from '../../config/GameConfig';
import { Logger } from '../../utils/Logger';
import { queueAnimation, startAnimation } from '../../utils/SpineAnimationHelper';
import { CurrencyManager } from './CurrencyManager';

export interface DialogConfig {
	type: 'Congrats' | 'FreeSpin' | 'FreeSpinRetrigger' | 'BigWin' | 'MegaWin' | 'EpicWin' | 'SuperWin' | 'MaxWin' | 'TotalWin';
	position?: { x: number; y: number };
	scale?: number;
	// Non-uniform scale/offsets are intended for TotalWin only.
	scaleX?: number;
	scaleY?: number;
	positionOffset?: { x?: number; y?: number };
	duration?: number;
	onComplete?: () => void;
	winAmount?: number; // Amount to display in the dialog
	freeSpins?: number; // Number of free spins won
	isRetrigger?: boolean; // For FreeSpin: whether this is a retrigger case
	betAmount?: number; // Base bet amount for staged win animations
	suppressBlackOverlay?: boolean;
	autoClose?: boolean;
	autoCloseMs?: number;
}

/** Context passed from Game so Dialogs can decide show vs defer and access queue/symbols */
export interface CheckAndShowWinDialogContext {
	pushToQueue: (payout: number, bet: number) => void;
	scheduleProcessQueue: () => void;
	isSuppressed: () => boolean;
	symbols: any;
	gameData: any;
}

export class Dialogs {
	// Main dialog container that covers the entire screen
	private dialogOverlay!: Phaser.GameObjects.Container;

	// Black background overlay
	private blackOverlay!: Phaser.GameObjects.Graphics;

	// Dialog content container (the actual dialog animations)
	private dialogContentContainer!: Phaser.GameObjects.Container;

	// Continue text
	private continueText: Phaser.GameObjects.Text | null = null;

	// Number display container
	private numberDisplayContainer: Phaser.GameObjects.Container | null = null;
	private numberDisplay: NumberDisplay | null = null;
	private numberTargetValue: number = 0;

	// Secondary number display for congrats dialog (e.g., free spins used)
	private congratsFreeSpinsContainer: Phaser.GameObjects.Container | null = null;
	private congratsFreeSpinsDisplay: NumberDisplay | null = null;

	// Click handler area
	private clickArea: Phaser.GameObjects.Rectangle | null = null;

	// Current dialog state
	private currentDialog: any = null; // Spine object type
	private currentDialogOverlay: any = null; // Optional overlay spine (e.g., TotalWin notes)
	private isDialogActive: boolean = false;
	private currentDialogType: string | null = null;
	private currentDialogAssetType: DialogConfig['type'] | null = null;
	private isRetriggerFreeSpin: boolean = false; // Tracks if current FreeSpinDialog is a retrigger

	// Auto-close timer for win dialogs during autoplay
	private autoCloseTimer: Phaser.Time.TimerEvent | null = null;
	private configAutoCloseMs: number | null = null;
	private configAutoCloseEnabled: boolean = false;
	private defaultWinDialogAutoCloseMs: number | null = 2500;
	private defaultWinDialogAutoCloseEnabled: boolean = true;

	// Number display Y positions per dialog group (overrides). If null, default will be used.
	private numberYWin: number | null = 450;
	private numberYFreeSpin: number | null = null;
	private numberYCongrats: number | null = null;
	private readonly defaultNumberDisplayScale: number = 0.3;
	private readonly minNumberDisplayScale: number = 0.18;
	private readonly numberDisplayPaddingXRatio: number = 0.05;
	private readonly numberDisplayMinPaddingX: number = 30;
	private readonly dialogFitPaddingXRatio: number = 0.05;
	private readonly dialogFitMinPaddingX: number = 30;

	// Managers
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private currentScene: Scene | null = null;

	// Staged win animation state (Big -> Mega -> Epic -> Super with incremental number steps)
	private isStagedWinNumberAnimation: boolean = false;
	private stagedWinStages: Array<{ type: 'BigWin' | 'MegaWin' | 'EpicWin' | 'SuperWin'; target: number }> = [];
	private stagedWinCurrentStageIndex: number = 0;
	private stagedWinStageTimer: Phaser.Time.TimerEvent | null = null;

	private radialLightTransition: RadialLightTransition | null = null;

	// Dialog configuration
	private dialogScales: Record<string, number> = {
		'Congrats': 1,
		'FreeSpin': 1,
		'BigWin': 1,
		'MegaWin': 1,
		'EpicWin': 1,
		'SuperWin': 1,
		'MaxWin': 1,
		'TotalWin': 1
	};

	// Dialog positions (relative: 0.0 = left/top, 0.5 = center, 1.0 = right/bottom)
	private dialogPositions: Record<string, { x: number; y: number }> = {
		'Congrats': { x: 0.5, y: 0.3 },
		'FreeSpin': { x: 0.5, y: 0.4 },
		'BigWin': { x: 0.5, y: 0.3 },
		'MegaWin': { x: 0.5, y: 0.3 },
		'EpicWin': { x: 0.5, y: 0.3 },
		'SuperWin': { x: 0.5, y: 0.3 },
		'MaxWin': { x: 0.5, y: 0.4 },
		'TotalWin': { x: 0.5, y: 0.3 }
	};

	// Offset for number display (e.g. TotalWin amount)
	private numberDisplayOffsetY: Record<string, number> = {
		'Congrats': 90,
		'FreeSpin': -20,
		'BigWin': 90,
		'MegaWin': 90,
		'EpicWin': 90,
		'SuperWin': 90,
		'MaxWin': 120,
		'TotalWin': 90
	};

	private dialogLoops: Record<string, boolean> = {
		'Congrats': true,
		'FreeSpin': true,
		'BigWin': true,
		'MegaWin': true,
		'EpicWin': true,
		'SuperWin': true,
		'MaxWin': true,
		'TotalWin': true
	};

	// Global toggle to disable intro animations for dialogs (win, free spin, congrats)
	// When true, dialogs will start directly in their idle loop.
	private disableIntroAnimations: boolean = true;

	// Remember the intended scale for the current dialog so we can tween from 0 -> target
	private lastDialogScaleX: number = 1;
	private lastDialogScaleY: number = 1;

	// Tracks whether we've already shown at least one win dialog. Used to fix an edge
	// case where the *first* win dialog could occasionally miss the scale "pop" tween.
	private hasShownAnyWinDialog: boolean = false;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	create(scene: Scene): void {
		// Store scene reference for later use
		this.currentScene = scene;

		this.radialLightTransition = new RadialLightTransition(scene);

		// Create main dialog overlay container (above win bar text, below menu popups)
		this.dialogOverlay = scene.add.container(0, 0);
		this.dialogOverlay.setDepth(9501);
		this.dialogOverlay.setVisible(false); // Hidden by default

		// Create black overlay background just behind dialog overlay
		this.blackOverlay = scene.add.graphics();
		this.blackOverlay.fillStyle(0x000000, 0.7); // Black with 70% alpha
		this.blackOverlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
		this.blackOverlay.setDepth(this.dialogOverlay.depth - 1);
		this.blackOverlay.setVisible(false);
		this.blackOverlay.setAlpha(0);

		// Create dialog content container (base layer for dialog visuals; below menu)
		this.dialogContentContainer = scene.add.container(0, 0);
		this.dialogContentContainer.setDepth(103);
		this.dialogOverlay.add(this.dialogContentContainer);

	}



	/**
	 * Show a dialog with the specified configuration
	 */
	public showDialog(scene: Scene, config: DialogConfig): void {
		// Reset staged win state for each new dialog
		this.isStagedWinNumberAnimation = false;
		this.stagedWinStages = [];
		this.stagedWinCurrentStageIndex = 0;

		const dialogType = this.normalizeDialogType(config.type);
		const normalizedConfig: DialogConfig = { ...config, type: dialogType };
		if (normalizedConfig.type === 'FreeSpin' && normalizedConfig.isRetrigger) {
			normalizedConfig.type = 'FreeSpinRetrigger';
		}
		if (dialogType !== config.type) {
		}

		if (this.isDialogActive) {
			// Avoid delayed hide transitions from nuking the next dialog.
			this.hideDialog(true);
		}


		// Track current dialog type for bonus mode detection
		this.currentDialogType = normalizedConfig.type;
		// Configure per-dialog auto-close (overrides default autoplay auto-close)
		this.configAutoCloseEnabled = !!(normalizedConfig.autoClose || normalizedConfig.autoCloseMs !== undefined);
		if (normalizedConfig.autoCloseMs !== undefined) {
			this.configAutoCloseMs = Math.max(0, Number(normalizedConfig.autoCloseMs) || 0);
		} else if (normalizedConfig.autoClose) {
			this.configAutoCloseMs = 2000;
		} else {
			this.configAutoCloseMs = null;
		}
		// Track retrigger state only for Free Spin dialog
		this.isRetriggerFreeSpin = (normalizedConfig.type === 'FreeSpin' || normalizedConfig.type === 'FreeSpinRetrigger')
			? !!normalizedConfig.isRetrigger || normalizedConfig.type === 'FreeSpinRetrigger'
			: false;

		// If this is a win dialog, mark global state so autoplay systems can wait
		try {
			if (this.isWinDialog()) {
				gameStateManager.isShowingWinDialog = true;
			}
		} catch { }

		// Debug dialog type detection
		if (this.currentDialogType === 'FreeSpin' || this.currentDialogType === 'FreeSpinRetrigger') {
		}

		// If congrats / total-win / max-win dialog is appearing, suppress the SlotController's spins-left display
		if (normalizedConfig.type === 'Congrats' || normalizedConfig.type === 'TotalWin' || normalizedConfig.type === 'MaxWin') {
			try {
				const gameSceneAny = scene as any;
				const slotController = gameSceneAny?.slotController;
				if (slotController && typeof slotController.suppressFreeSpinDisplay === 'function') {
					slotController.suppressFreeSpinDisplay();
				}
			} catch { }
		}

		// If free spin dialog is appearing, clear any prior suppression to allow showing again
		if (normalizedConfig.type === 'FreeSpin' || normalizedConfig.type === 'FreeSpinRetrigger') {
			try {
				const gameSceneAny = scene as any;
				const slotController = gameSceneAny?.slotController;
				if (slotController && typeof slotController.clearFreeSpinDisplaySuppression === 'function') {
					slotController.clearFreeSpinDisplaySuppression();
				}
			} catch { }
		}

		// Ensure dialog overlay is visible and reset alpha for new dialog
		this.dialogOverlay.setVisible(true);
		this.dialogOverlay.setAlpha(1);
		this.isDialogActive = true;


		// Always ensure black overlay is properly set up for new dialog

		// Handle black overlay based on dialog type
		if (!this.isWinDialog()) {

			if (normalizedConfig.suppressBlackOverlay) {
				this.blackOverlay.setVisible(false);
				this.blackOverlay.setAlpha(0);
			} else {
				this.fadeInDialogDimmer(scene);
			}
		} else {
			// For win dialogs, ensure black overlay is visible and set to semi-transparent background
			this.blackOverlay.setVisible(true);
			this.blackOverlay.setAlpha(0.7); // Semi-transparent background
		}

		// Log final black overlay state for debugging

		// Create the dialog content
		this.createDialogContent(scene, normalizedConfig);

		// Ensure the very first win dialog always gets the scale pop animation.
		// On some devices the initial tween applied during createDialogContent can
		// be skipped when the Win spine is created for the first time, so we force
		// a second pop once the dialog is fully initialized.
		if (!this.hasShownAnyWinDialog && this.isWinDialogType(normalizedConfig.type)) {
			this.hasShownAnyWinDialog = true;
			try {
				const sceneRef = scene;
				sceneRef.time.delayedCall(0, () => {
					if (!this.currentDialog || !this.isDialogActive) {
						return;
					}
					this.applyDialogScalePop(sceneRef);
				});
			} catch { }
		}

		// Notify the scene that a dialog has been shown (type included)
		try {
			scene.events.emit('dialogShown', this.currentDialogType);
		} catch { }

		// Play dialog-specific SFX (FreeSpin / Congrats / MaxWin) when shown
		try {
			const audioManager = (window as any).audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				const type = (this.currentDialogType || '').toLowerCase();
				if (type === 'freespin_bz') {
					// Use Congrats for the FreeSpin dialog per request
					audioManager.playSoundEffect(SoundEffectType.DIALOG_CONGRATS);
					// Duck background music similar to win dialogs
					if (typeof audioManager.duckBackground === 'function') {
						audioManager.duckBackground(0.3);
					}
				} else if (type === 'congrats') {
					audioManager.playSoundEffect(SoundEffectType.DIALOG_CONGRATS);
					if (typeof audioManager.duckBackground === 'function') {
						audioManager.duckBackground(0.3);
					}
				} else if (type === 'maxwin') {
					audioManager.playSoundEffect(SoundEffectType.MAX_WIN);
					if (typeof audioManager.duckBackground === 'function') {
						audioManager.duckBackground(0.3);
					}
				}
			}
		} catch { }

		// Fade dialog content in (scale pop is applied whenever idle starts)
		if (this.currentDialog) {
			this.currentDialog.setAlpha(0);

			// Adjust timing based on dialog type
			const contentDelay = this.isWinDialog() ? 0 : 200; // No delay for win dialogs

			scene.tweens.add({
				targets: this.currentDialog,
				alpha: 1,
				duration: 800,
				ease: 'Power2',
				delay: contentDelay,
				onComplete: () => {
					try {
						EventBus.emit('dialogFullyDisplayed', this.currentDialogType);
					} catch (e) {
						console.warn('[Dialogs] EventBus.emit dialogFullyDisplayed failed', e);
					}
					try {
						scene.events.emit('dialogFullyDisplayed', this.currentDialogType);
					} catch { }
				}
			});
		} else {
			console.warn('[Dialogs] No currentDialog for fade-in — dialogFullyDisplayed will not be emitted');
		}

		// Create number display(s) if win amount or free spins are provided
		if (normalizedConfig.winAmount !== undefined || normalizedConfig.freeSpins !== undefined) {
			if (normalizedConfig.type === 'Congrats') {
				// Congrats dialog: primary total win + secondary free spins used (if provided)
				if (normalizedConfig.winAmount !== undefined) {
					this.createNumberDisplay(scene, normalizedConfig.winAmount || 0, undefined);
				}
				if (normalizedConfig.freeSpins !== undefined) {
					this.createCongratsFreeSpinsDisplay(scene, normalizedConfig.freeSpins);
				}
			} else {
				// Other dialogs: existing single number behavior
				this.createNumberDisplay(scene, normalizedConfig.winAmount || 0, normalizedConfig.freeSpins);

				// Configure staged win number animation (Big -> Mega -> Epic -> Super)
				if (normalizedConfig.winAmount !== undefined && normalizedConfig.betAmount !== undefined && this.isWinDialogType(normalizedConfig.type)) {
					this.setupStagedWinNumberAnimation(normalizedConfig);
				}
			}

			// Fade in number display(s) after a short delay (replacing paint effect trigger)
			scene.time.delayedCall(500, () => {
				this.fadeInNumberDisplay(scene);
			});
		}

		// Play win dialog SFX at the correct time (after staged setup decides the first tier)
		try {
			if (this.isWinDialog() || this.currentDialogType === 'TotalWin') {
				const audioManager = (window as any).audioManager;
				// Always duck background while a win dialog is visible
				if (audioManager && typeof audioManager.duckBackground === 'function') {
					audioManager.duckBackground(0.3);
				}
				// If we're doing staged tiers, let the staged runner trigger SFX per tier.
				// Otherwise, play the SFX for the current (single) dialog type now.
				if (!this.isStagedWinNumberAnimation && audioManager && typeof audioManager.playWinDialogSfx === 'function') {
					audioManager.playWinDialogSfx(this.currentDialogType);
				}
			}
		} catch (e) {
			console.warn('[Dialogs] Failed to play win dialog SFX (post-setup):', e);
		}

		// Create continue text (delayed)
		this.createContinueText(scene);

		// Create click handler
		this.createClickHandler(scene);

		// Set up auto-close timer for win dialogs during autoplay
		this.setupAutoCloseTimer(scene);
	}

	/**
	 * Normalize legacy dialog type names to current dialog types.
	 */
	private normalizeDialogType(type: string): DialogConfig['type'] {
		const normalizedMap: Record<string, DialogConfig['type']> = {
			MaxW_GT: 'MaxWin',
			maxw_gt: 'MaxWin'
		};

		return normalizedMap[type] || (type as DialogConfig['type']);
	}

	/**
	 * Build candidate animation names for a dialog type. We try generic names first,
	 * then legacy/asset-specific names to support renamed keys.
	 */
	private getDialogAnimationCandidates(dialogType: string): string[] {
		const legacyMap: Record<string, string[]> = {
			BigWin: ['BigW_GT'],
			MegaWin: ['MEgaW_GT'],
			EpicWin: ['EpicW_GT'],
			SuperWin: ['Super_GT', 'SuperW_GT'],
			MaxWin: ['MaxW_GT'],
			FreeSpin: ['FreeSpin_GT'],
			FreeSpinRetrigger: ['FreeSpin_GT'],
			TotalWin: [],
			Congrats: ['Congrats_GT']
		};

		const bases = [dialogType, ...(legacyMap[dialogType] || [])];
		const names: string[] = [];
		for (const base of bases) {
			names.push(`${base}_idle`);
			names.push(base);
		}
		return names;
	}

	private getDialogRenderType(dialogType: string): string {
		// Retrigger currently reuses the FreeSpin visual asset/animation.
		return dialogType === 'FreeSpinRetrigger' ? 'FreeSpin' : dialogType;
	}

	private getSkeletonAnimationNames(dialog: any): string[] {
		try {
			const data = dialog?.skeleton?.data || dialog?.skeletonData;
			const animations = data?.animations;
			if (Array.isArray(animations)) {
				return animations
					.map((a: any) => String(a?.name || ''))
					.filter((n: string) => !!n);
			}
			if (animations && typeof animations === 'object') {
				return Object.keys(animations);
			}
		} catch { }
		return [];
	}

	private resolveDialogAnimationName(dialog: any, dialogType: string): string {
		const renderType = this.getDialogRenderType(dialogType);
		const candidates = this.getDialogAnimationCandidates(renderType);
		const available = this.getSkeletonAnimationNames(dialog);
		if (available.length === 0) {
			// Fallback if animation list cannot be inspected.
			return candidates[0];
		}

		for (const c of candidates) {
			if (available.includes(c)) return c;
		}

		// Last resort: first animation in skeleton so dialog still animates.
		return available[0];
	}

	/**
	 * Compatibility helper used by staged flows and fade-out logic.
	 */
	private getAnimationNameForDialogType(dialogType: string): { intro: string; idle: string; outro?: string } | null {
		const resolved = this.resolveDialogAnimationName(this.currentDialog, dialogType);
		return { intro: resolved, idle: resolved };
	}

	/**
	 * Create the main dialog content (FreeSpin, EpicWin, etc.)
	 */
	private createDialogContent(scene: Scene, config: DialogConfig): void {
		// Clean up existing dialog
		if (this.currentDialog) {
			this.currentDialog.destroy();
			this.currentDialog = null;
		}
		if (this.currentDialogOverlay) {
			this.currentDialogOverlay.destroy();
			this.currentDialogOverlay = null;
		}

		const isTotalWinDialog = this.isTotalWinDialogType(config.type);
		const renderType = this.getDialogRenderType(config.type);
		let position = config.position || this.getDialogPosition(config.type, scene);
		if (isTotalWinDialog && config.positionOffset) {
			position = {
				x: position.x + (config.positionOffset.x ?? 0),
				y: position.y + (config.positionOffset.y ?? 0)
			};
		}
		let scale = config.scale || this.getDialogScale(config.type);
		let scaleX = isTotalWinDialog && config.scaleX !== undefined ? config.scaleX : scale;
		let scaleY = isTotalWinDialog && config.scaleY !== undefined ? config.scaleY : scale;
		const addAny = scene.add as any;

		// Create Spine animation for the dialog
		try {
			const assetKey = renderType;
			const atlasKey = `${renderType}-atlas`;


			this.currentDialog = addAny.spine(
				position.x,
				position.y,
				assetKey,
				atlasKey
			);
			this.currentDialogAssetType = renderType as DialogConfig['type'];
			this.currentDialog.setOrigin(0.5, 0.5);

			// MaxWin: scale to fill full screen (cover aspect ratio)
			if (renderType === 'MaxWin') {
				const rawWidth = this.currentDialog.width || 1;
				const rawHeight = this.currentDialog.height || 1;
				const fitScaleX = scene.scale.width / rawWidth;
				const fitScaleY = scene.scale.height / rawHeight;
				const fillScale = Math.max(
					isFinite(fitScaleX) && fitScaleX > 0 ? fitScaleX : 1,
					isFinite(fitScaleY) && fitScaleY > 0 ? fitScaleY : 1
				);
				scaleX = fillScale;
				scaleY = fillScale;
			} else {
				const rawWidth = this.currentDialog.width || 1;
				const rawHeight = this.currentDialog.height || 1;
				let fitScaleUsed: number | null = null;
				const shouldApplyUniformFit =
					config.scale === undefined &&
					!(isTotalWinDialog && (config.scaleX !== undefined || config.scaleY !== undefined));
				if (shouldApplyUniformFit) {
					const dialogPaddingX = this.getDialogFitPaddingX(scene);
					const fitScale = Math.min(
						Math.max(1, scene.scale.width - dialogPaddingX * 2) / rawWidth,
						(scene.scale.height * 0.9) / rawHeight
					);
					if (isFinite(fitScale) && fitScale > 0) {
						fitScaleUsed = fitScale;
						scale = Math.min(scale, fitScale);
					}
				}
				if (!(isTotalWinDialog && config.scaleX !== undefined)) {
					scaleX = scale;
				}
				if (!(isTotalWinDialog && config.scaleY !== undefined)) {
					scaleY = scale;
				}
			}

			this.lastDialogScaleX = scaleX;
			this.lastDialogScaleY = scaleY;
			// Set the base scale *before* we trigger any pop tweens.
			// If we do this after applyDialogScalePop, it overrides the tween's
			// starting scale of 0 and the pop animation can appear to be skipped.
			this.currentDialog.setScale(scaleX, scaleY);

			const shouldLoop = this.getDialogLoop(config.type);
			const animationName = this.resolveDialogAnimationName(this.currentDialog, config.type);

			try {
				startAnimation(this.currentDialog, { animationName, loop: shouldLoop });
				this.applyDialogScalePop(scene);
			} catch (error) {
				startAnimation(this.currentDialog, { animationName, loop: shouldLoop });
				this.applyDialogScalePop(scene);
			}
		} catch (error) {
			console.error(`[Dialogs] Error creating dialog content: ${config.type}`, error);
			console.error(`[Dialogs] This might be due to missing assets for ${config.type}`);
			return;
		}

		this.currentDialog.setDepth(103);

		// Add directly to dialog overlay so it shares the same layer as number display
		this.dialogOverlay.add(this.currentDialog);
		// Ensure number displays stay above dialog content even if we recreate the dialog (staged wins)
		if (this.numberDisplayContainer) {
			this.dialogOverlay.bringToTop(this.numberDisplayContainer);
		}
		if (this.congratsFreeSpinsContainer) {
			this.dialogOverlay.bringToTop(this.congratsFreeSpinsContainer);
		}

	}

	/**
	 * Set up auto-close timer for win dialogs during autoplay or when scatter is hit
	 */
	private setupAutoCloseTimer(scene: Scene): void {
		// Clear any existing timer
		if (this.autoCloseTimer) {
			this.autoCloseTimer.destroy();
			this.autoCloseTimer = null;
		}

		// MaxWin dialog never auto-closes (user must dismiss).
		if (this.currentDialogType === 'MaxWin') {
			return;
		}

		// If caller explicitly requested auto-close, apply it for any dialog type.
		if (this.configAutoCloseEnabled && this.configAutoCloseMs !== null) {
			const delayMs = Math.max(0, this.configAutoCloseMs);
			this.autoCloseTimer = scene.time.delayedCall(delayMs, () => {
				this.handleDialogClick(scene, true);
			});
			return;
		}

		// Set up auto-close for win dialogs during autoplay OR when scatter is hit

		// Detect free spin autoplay (bonus autoplay) via Symbols component on the scene
		let isFreeSpinAutoplay = false;
		try {
			const gameScene: any = scene as any;
			const symbolsComponent = gameScene?.symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function') {
				isFreeSpinAutoplay = !!symbolsComponent.isFreeSpinAutoplayActive();
			}
		} catch { }

		// Default: auto-close win dialogs outside autoplay/scatter and always close FreeSpinRetrigger.
		const isRetriggerDialog = this.currentDialogType === 'FreeSpinRetrigger';
		const isAutoFlow = gameStateManager.isAutoPlaying || isFreeSpinAutoplay || gameStateManager.isScatter;
		if (this.defaultWinDialogAutoCloseEnabled && this.defaultWinDialogAutoCloseMs !== null) {
			if (isRetriggerDialog || (this.isWinDialog() && !isAutoFlow)) {
				let delayMs = Math.max(0, this.defaultWinDialogAutoCloseMs);
				// Ensure staged sequences have time to play all tiers before auto-close.
				if (this.isStagedWinNumberAnimation && this.stagedWinStages.length > 1) {
					const perStageDwellMs = 2000; // Keep in sync with startStagedWinNumberSequence
					const stagedDelay = perStageDwellMs * this.stagedWinStages.length + 1500;
					delayMs = Math.max(delayMs, stagedDelay);
				}
				this.autoCloseTimer = scene.time.delayedCall(delayMs, () => {
					this.handleDialogClick(scene, true);
				});
				return;
			}
		}

		// If a win dialog appears exactly when bonus spins are exhausted, only skip auto-close
		// when auto-close is disabled. Otherwise honor the configured auto-close timing.
		if (this.isWinDialog() && gameStateManager.isBonusFinished) {
			const hasConfiguredAutoClose =
				(this.configAutoCloseEnabled && this.configAutoCloseMs !== null) ||
				(this.defaultWinDialogAutoCloseEnabled && this.defaultWinDialogAutoCloseMs !== null);
			if (!hasConfiguredAutoClose) {
				return;
			}
		}

		// Only auto-close win dialogs during autoplay/scatter. Free spin dialogs stay until user clicks.
		const shouldAutoClose = this.isWinDialog() && (gameStateManager.isAutoPlaying || isFreeSpinAutoplay || gameStateManager.isScatter);

		if (shouldAutoClose) {
			const reason = (gameStateManager.isAutoPlaying || isFreeSpinAutoplay) ? 'autoplay' : 'scatter hit';
			// Base auto-close delay (ms). Previously ~2.5s. Extend by +1s when autoplaying (normal or free spin).
			let baseDelayMs = 2500;

			// If we're running a staged win sequence (Big -> Mega -> Epic -> Super),
			// align the auto-close timing with the per-stage dwell timing used in
			// startStagedWinNumberSequence so that the FINAL tier gets a full dwell
			// window as well, instead of closing early.
			//
			// Each stage starts every ~3s (perStageDwellMs), so we want the overall
			// auto-close delay to be: stages * perStageDwellMs. That way, the time
			// between the last stage starting and the dialog auto-closing is also
			// ~perStageDwellMs, matching the earlier tiers.
			if (this.isStagedWinNumberAnimation && this.stagedWinStages.length > 1) {
				const perStageDwellMs = 2000; // Keep in sync with startStagedWinNumberSequence
				// Give the final staged win tier an extra 1s of dwell time before auto-close.
				baseDelayMs = perStageDwellMs * this.stagedWinStages.length + 1500;
			}

			const extraAutoplayDelayMs = 0;
			const delayMs = reason === 'autoplay' ? (baseDelayMs + extraAutoplayDelayMs) : baseDelayMs;

			this.autoCloseTimer = scene.time.delayedCall(delayMs, () => {
				// Auto-close should immediately close the dialog rather than advancing
				// staged tiers one by one, so pass fromAutoClose = true.
				this.handleDialogClick(scene, true);
			});
		} else {
		}
	}


	/**
	 * Create the "Press anywhere to continue" text
	 */
	private createContinueText(scene: Scene): void {

		// Clean up existing text
		if (this.continueText) {
			this.continueText.destroy();
			this.continueText = null;
		}

		// Create the text with your original styling
		this.continueText = scene.add.text(
			scene.scale.width / 2,
			scene.scale.height / 2 + 300,
			'Press anywhere to continue',
			{
				fontFamily: 'Poppins-Bold',
				fontSize: '20px',
				color: '#FFFFFF',
				stroke: '#379557',
				strokeThickness: 5,
				shadow: {
					offsetX: 2,
					offsetY: 2,
					color: '#000000',
					blur: 4,
					fill: true
				}
			}
		);

		this.continueText.setOrigin(0.5, 0.5);
		this.continueText.setDepth(104);
		this.continueText.setAlpha(0); // Start invisible

		// Add to dialog overlay
		this.dialogOverlay.add(this.continueText);

		// Fade in the text after 1.5 seconds (reduced from 4.5 seconds)
		scene.tweens.add({
			targets: this.continueText,
			alpha: 1,
			duration: 500,
			delay: 1500,
			ease: 'Power2',
			onComplete: () => {
			}
		});

	}

	/**
	 * Create number display for win amounts
	 */
	private createNumberDisplay(scene: Scene, winAmount: number, freeSpins?: number): void {
		// Clean up existing number display
		if (this.numberDisplayContainer) {
			this.numberDisplayContainer.destroy();
			this.numberDisplayContainer = null;
		}

		// Determine if this is the Congrats dialog showing a total win amount
		const isTotalWinDialog =
			(this.currentDialogType === 'Congrats' || this.currentDialogType === 'TotalWin') &&
			freeSpins === undefined;
		const isDemo = (scene as any).gameAPI?.getDemoState();

		// Create number display configuration
		const numberConfig = this.buildNumberDisplayConfig(scene, {
			x: scene.scale.width / 2,
			y: this.getNumberDisplayY(scene, this.currentDialogType),
			offsetY: this.getNumberDisplayOffsetY(this.currentDialogType),
			decimalPlaces: freeSpins !== undefined ? 0 : 2, // No decimals for free spins
			showCommas: freeSpins === undefined, // No commas for free spins
			// NumberDisplay only has sprite textures for 0-9, comma, dot. Do not use
			// a currency prefix (e.g. "USD ") here or you get "Missing texture for character" for U, S, D, space.
			// For Congrats/TotalWin, show currency elsewhere (e.g. art or a separate text) if needed.
			prefix: '',
			suffix: ''
		});

		// Create the number display (primary win amount / free spins, depending on dialog)
		const numberDisplay = new NumberDisplay(this.networkManager, this.screenModeManager, numberConfig);
		numberDisplay.create(scene);
		// Display free spins if provided, otherwise display win amount
		const displayValue = freeSpins !== undefined ? freeSpins : winAmount;
		// Pre-measure to ensure the value doesn't overflow the screen for all dialogs
		numberDisplay.displayValue(displayValue);
		this.fitNumberDisplayToWidth(numberDisplay, scene, 1, numberConfig.scale ?? this.defaultNumberDisplayScale);
		// Start from 0 (or current) and animate on fade-in
		numberDisplay.displayValue(0);
		this.numberDisplay = numberDisplay;
		this.numberTargetValue = displayValue;

		// Create container for number display (above dialog content but still below menu)
		this.numberDisplayContainer = scene.add.container(0, 0);
		this.numberDisplayContainer.setDepth((this.dialogOverlay?.depth ?? 9500) - 1);
		this.numberDisplayContainer.add(numberDisplay.getContainer());

		// Start with alpha 0 (invisible) - will be faded in after delay
		this.numberDisplayContainer.setAlpha(0);

		// Add to dialog overlay and ensure it's on top of dialog content
		this.dialogOverlay.add(this.numberDisplayContainer);
		this.dialogOverlay.bringToTop(this.numberDisplayContainer);
		this.numberDisplayContainer.bringToTop(numberDisplay.getContainer());

	}

	/**
	 * Create secondary number display for congrats dialog (free spins used)
	 */
	private createCongratsFreeSpinsDisplay(scene: Scene, freeSpins: number): void {
		// Clean up existing secondary display
		if (this.congratsFreeSpinsContainer) {
			this.congratsFreeSpinsContainer.destroy();
			this.congratsFreeSpinsContainer = null;
		}

		// Only applicable to Congrats dialog
		if (this.currentDialogType !== 'Congrats') {
			return;
		}

		const numberConfig: NumberDisplayConfig = {
			...this.buildNumberDisplayConfig(scene, {
				x: scene.scale.width / 2 - 50,
				// Place slightly below the main total win display
				y: this.getNumberDisplayY(scene, this.currentDialogType) + 70,
				decimalPlaces: 0,
				showCommas: false,
				prefix: '',
				suffix: ''
			})
		};

		const fsDisplay = new NumberDisplay(this.networkManager, this.screenModeManager, numberConfig);
		fsDisplay.create(scene);
		fsDisplay.displayValue(freeSpins);
		
		// Ensure secondary display doesn't overflow screen
		this.fitNumberDisplayToWidth(fsDisplay, scene, 0.82, numberConfig.scale ?? this.defaultNumberDisplayScale);

		this.congratsFreeSpinsDisplay = fsDisplay;

		this.congratsFreeSpinsContainer = scene.add.container(0, 0);
		this.congratsFreeSpinsContainer.setDepth(103);
		this.congratsFreeSpinsContainer.add(fsDisplay.getContainer());

		// Start hidden; will be revealed alongside primary number
		this.congratsFreeSpinsContainer.setAlpha(0);
		this.dialogOverlay.add(this.congratsFreeSpinsContainer);

	}

	private buildNumberDisplayConfig(
		scene: Scene,
		opts: {
			x: number;
			y: number;
			offsetY?: number;
			decimalPlaces: number;
			showCommas: boolean;
			prefix?: string;
			suffix?: string;
			scale?: number;
			commaScaleOffset?: number;
			dotScaleOffset?: number;
			formatValue?: (value: number) => string;
		}
	): NumberDisplayConfig {
		return {
			x: opts.x,
			y: opts.y,
			offsetY: opts.offsetY ?? 0,
			scale: opts.scale ?? this.defaultNumberDisplayScale,
			spacing: 0,
			alignment: 'center',
			decimalPlaces: opts.decimalPlaces,
			showCommas: opts.showCommas,
			prefix: opts.prefix ?? '',
			suffix: opts.suffix ?? '',
			commaYOffset: 5,
			dotYOffset: 5,
			commaScaleOffset: opts.commaScaleOffset ?? -0.08,
			dotScaleOffset: opts.dotScaleOffset ?? -0.08,
			formatValue: opts.formatValue
		};
	}

	private fitNumberDisplayToWidth(
		display: NumberDisplay,
		scene: Scene,
		maxWidthRatio: number,
		baseScale: number
	): void {
		try {
			const bounds = display.getContainer().getBounds();
			const paddingX = this.getNumberDisplayPaddingX(scene);
			const maxWidth = Math.max(1, scene.scale.width * maxWidthRatio - paddingX * 2);
			if (bounds.width <= maxWidth) {
				return;
			}
			const scaleFactor = maxWidth / bounds.width;
			display.setScale(Math.max(this.minNumberDisplayScale, baseScale * scaleFactor));
		} catch {
			// Ignore measurement failures; display will render with its configured base scale.
		}
	}

	private getNumberDisplayPaddingX(scene: Scene): number {
		const ratioPadding = Math.round(scene.scale.width * this.numberDisplayPaddingXRatio);
		return Math.max(this.numberDisplayMinPaddingX, ratioPadding);
	}

	private getDialogFitPaddingX(scene: Scene): number {
		const ratioPadding = Math.round(scene.scale.width * this.dialogFitPaddingXRatio);
		return Math.max(this.dialogFitMinPaddingX, ratioPadding);
	}

	/**
	 * Compute number display Y based on dialog type with per-group overrides.
	 */
	private getNumberDisplayY(scene: Scene, dialogType: string | null): number {
		const defaultY = scene.scale.height / 2 - 50;
		if (!dialogType) return defaultY;

		if (dialogType === 'FreeSpin' || dialogType === 'FreeSpinRetrigger') {
			return this.numberYFreeSpin ?? defaultY;
		}

		if (dialogType === 'Congrats' || dialogType === 'TotalWin') {
			return this.numberYCongrats ?? defaultY;
		}

		if (this.isWinDialogType(dialogType)) {
			return this.numberYWin ?? defaultY;
		}

		return defaultY;
	}

	/**
	 * Helper: determine if a type is one of the win dialogs.
	 */
	private isWinDialogType(type: string): boolean {
		return type === 'BigWin' || type === 'MegaWin' || type === 'EpicWin' || type === 'SuperWin' || type === 'MaxWin';
	}

	private isTotalWinDialogType(type: string): boolean {
		return type === 'TotalWin';
	}

	private getNumberDisplayOffsetY(dialogType: string | null): number {
		if (!dialogType) {
			return 0;
		}
		return this.numberDisplayOffsetY[dialogType] ?? 0;
	}

	/**
	 * Public setters to configure number display Y positions per group at runtime.
	 */
	setNumberDisplayYForWin(y: number): void { this.numberYWin = y; }
	setNumberDisplayYForFreeSpin(y: number): void { this.numberYFreeSpin = y; }
	setNumberDisplayYForCongrats(y: number): void { this.numberYCongrats = y; }
	setNumberDisplayOffsetY(dialogType: DialogConfig['type'], y: number): void {
		this.numberDisplayOffsetY[dialogType] = y;
	}
	setNumberDisplayOffsetYForTotalWin(y: number): void { this.numberDisplayOffsetY.TotalWin = y; }
	setNumberDisplayYPositions(opts: { win?: number; freeSpin?: number; congrats?: number }): void {
		if (opts.win !== undefined) this.numberYWin = opts.win;
		if (opts.freeSpin !== undefined) this.numberYFreeSpin = opts.freeSpin;
		if (opts.congrats !== undefined) this.numberYCongrats = opts.congrats;
	}

	/**
	 * Fade in the number display with animation
	 */
	private fadeInNumberDisplay(scene: Scene): void {

		if (this.numberDisplayContainer) {

			// Make container visible immediately (no fade)
			this.numberDisplayContainer.setAlpha(1);

			// Pop the inner number container so position remains anchored
			const inner = this.numberDisplay?.getContainer();
			if (inner) {
				inner.setScale(0);

				// Start counting up as the pop begins
				if (this.isStagedWinNumberAnimation && this.stagedWinStages.length > 0) {
					this.startStagedWinNumberSequence(scene);
				} else if (this.numberDisplay) {
					this.numberDisplay.animateToValue(this.numberTargetValue, {
						duration: 1500,
						ease: 'Power2',
						startFromCurrent: false
					});
				}

				scene.tweens.add({
					targets: inner,
					scale: 1.08,
					duration: 400,
					ease: 'Back.Out',
					onComplete: () => {
						scene.tweens.add({
							targets: inner,
							scale: 1.0,
							duration: 180,
							ease: 'Power2',
							onComplete: () => {
							}
						});
					}
				});
			} else {
				console.warn('[Dialogs] No inner primary number container found for pop animation');
			}
		} else {
			console.error('[Dialogs] numberDisplayContainer is null, cannot fade in');
		}

		// If a secondary congrats free spins display exists, pop it in too (no counting animation)
		if (this.congratsFreeSpinsContainer && this.congratsFreeSpinsDisplay) {
			this.congratsFreeSpinsContainer.setAlpha(1);
			const innerFs = this.congratsFreeSpinsDisplay.getContainer();
			if (innerFs) {
				innerFs.setScale(0);
				scene.tweens.add({
					targets: innerFs,
					scale: 1.0,
					duration: 350,
					ease: 'Back.Out'
				});
			}
		}
	}

	/**
	 * Handle dialog click event.
	 *
	 * fromAutoClose:
	 *  - false: user clicked "press anywhere to continue"
	 *  - true:  internal auto-close timer fired (autoplay / scatter / retrigger)
	 */
	private handleDialogClick(scene: Scene, fromAutoClose: boolean = false): void {

		// Clear auto-close timer if it exists (prevents double-triggering)
		if (this.autoCloseTimer) {
			this.autoCloseTimer.destroy();
			this.autoCloseTimer = null;
		}

		// When a staged win sequence is running (Big -> Mega -> Epic -> Super),
		// a MANUAL click should behave like "skip to next win animation":
		//  - Stop the current staged tier
		//  - Immediately jump to the next tier's animation (if any)
		//  - Start the number display from the previous tier's threshold (we use
		//    startFromCurrent in the NumberDisplay to preserve continuity)
		//
		// If there is NO next staged tier, we fall through to the normal
		// "close dialog" behavior so the win dialog ends.
		if (!fromAutoClose && this.isWinDialog() && this.stagedWinStages.length > 0) {
			const lastIndex = this.stagedWinStages.length - 1;
			const nextIndex = Math.min(this.stagedWinCurrentStageIndex + 1, lastIndex);
			const hasNextStage = nextIndex > this.stagedWinCurrentStageIndex;

			if (hasNextStage) {
				this.skipToStagedWinStage(scene, nextIndex);
				// Do NOT close the dialog here; the player now sees the next tier.
				return;
			}

		}

		// Start the fade-out sequence first (while isDialogActive is still true)
		this.startFadeOutSequence(scene);

		// Apply the same reset logic that happens when a new spin is triggered,
		// but ONLY for win dialogs. For non-win dialogs (e.g. FreeSpin / Congrats),
		// we must preserve the win queue so that any deferred win dialogs (such as
		// those queued during scatter + autoplay) can still be processed once the
		// non-win dialog finishes.
		if (this.isWinDialog()) {
			this.resetGameStateForNewSpin(scene);
		}

		// Note: WIN_DIALOG_CLOSED event will be emitted when fade-out completes
		// This prevents double emission of the event
	}

	/**
	 * Immediately disable all win dialog elements when clicked
	 */
	private disableAllWinDialogElements(): void {

		// Disable click area to prevent multiple clicks
		if (this.clickArea) {
			this.clickArea.disableInteractive();
		}

		// Hide black overlay immediately
		if (this.blackOverlay) {
			this.blackOverlay.setVisible(false);
			this.blackOverlay.setAlpha(0);
		}

		// Hide current dialog immediately
		if (this.currentDialog) {
			this.currentDialog.setVisible(false);
			this.currentDialog.setAlpha(0);

			// Stop Spine animation if it exists
			if (this.currentDialog.animationState) {
				this.currentDialog.animationState.clearTracks();
			}
		}
		if (this.currentDialogOverlay) {
			this.currentDialogOverlay.setVisible(false);
			this.currentDialogOverlay.setAlpha(0);
			if (this.currentDialogOverlay.animationState) {
				this.currentDialogOverlay.animationState.clearTracks();
			}
		}

		// Hide continue text immediately
		if (this.continueText) {
			this.continueText.setVisible(false);
		}

		// Hide number display immediately
		if (this.numberDisplayContainer) {
			this.numberDisplayContainer.setVisible(false);
		}

		// Hide secondary congrats free spins display immediately
		if (this.congratsFreeSpinsContainer) {
			this.congratsFreeSpinsContainer.setVisible(false);
		}

		// Hide the entire dialog overlay container
		if (this.dialogOverlay) {
			this.dialogOverlay.setVisible(false);
			this.dialogOverlay.setAlpha(0);
		}

		// Set dialog as inactive immediately
		this.isDialogActive = false;
	}

	private hideBlackOverlay(): void {
		if (!this.blackOverlay) return;
		this.blackOverlay.setVisible(false);
		this.blackOverlay.setAlpha(0);
	}

	/**
	 * Reset game state for new spin (same logic as when spin is triggered)
	 */
	private resetGameStateForNewSpin(scene: Scene): void {

		// Get the Game scene to access its methods
		const gameScene = scene as any; // Cast to access Game scene methods

		// Clear win queue if the method exists
		if (gameScene.clearWinQueue && typeof gameScene.clearWinQueue === 'function') {
			gameScene.clearWinQueue();
		}

		// Reset win dialog state
		gameStateManager.isShowingWinDialog = false;

		// NOTE: Do NOT call ensureCleanSymbolState() here as it immediately clears winning symbols
		// The winning symbols should remain visible until the next spin starts
		// The actual symbol reset will happen when the next spin is triggered

	}

	/**
	 * Create the click handler for the dialog
	 */
	private createClickHandler(scene: Scene): void {
		// Create a clickable area that covers the entire dialog
		this.clickArea = scene.add.rectangle(
			scene.cameras.main.centerX,
			scene.cameras.main.centerY,
			scene.cameras.main.width,
			scene.cameras.main.height,
			0x000000,
			0
		);

		this.clickArea.setOrigin(0.5);
		this.clickArea.setDepth(105);
		this.clickArea.setInteractive();

		// Add to dialog overlay
		this.dialogOverlay.add(this.clickArea);

		// For win dialogs, enable clicking after continue text appears (1.5s delay)
		// For free spin dialogs, delay clicking to allow animations to complete
		if (this.isWinDialog()) {
			// Delay to ensure continue text appears before allowing clicks
			scene.time.delayedCall(1500, () => {
				if (this.clickArea) {
					this.clickArea.on('pointerdown', () => {
						this.handleDialogClick(scene);
					});
				}
			});
		} else {
			// Delay for free spin dialogs to allow animations to complete
			scene.time.delayedCall(2200, () => {
				if (this.clickArea) {
					this.clickArea.on('pointerdown', () => {
						this.handleDialogClick(scene);
					});
				}
				try {
					EventBus.emit('freeSpinDialogReady', this.currentDialogType);
				} catch { }
			});
		}

	}


	/**
	 * Start the centralized transition when dialog is clicked
	 */
	private startFadeOutSequence(scene: Scene): void {

		if (!this.isDialogActive) {
			return;
		}

		// Route MaxWin through the same normal black-screen transition as TotalWin/Congrats.
		if (this.currentDialogType === 'MaxWin') {
			try {
				const audioManager = (window as any).audioManager;
				if (audioManager && typeof audioManager.playSoundEffect === 'function') {
					audioManager.playSoundEffect(SoundEffectType.MAX_WIN_END);
				}
			} catch { }
			this.disableAllWinDialogElements();
			this.startNormalTransition(scene);
			return;
		}

		// Check if this is a win dialog - handle differently than free spin dialog
		if (this.isWinDialog()) {
			// Disable dialog elements for win dialogs
			this.disableAllWinDialogElements();
			this.startWinDialogFadeOut(scene);
			return;
		}

		// Check if this is a free spin dialog - use candy transition
		if (this.currentDialogType === 'FreeSpin' || this.currentDialogType === 'FreeSpinRetrigger') {
			// On retrigger, skip candy transition, use normal transition to avoid extra animation
			if (this.isRetriggerFreeSpin) {
				// Immediately disable/hide everything similar to win dialog handling
				this.disableAllWinDialogElements();
				// Fully cleanup dialog elements
				this.cleanupDialog();
				// Clear scatter state BEFORE dialog completion so that any queued
				// win dialogs from the retrigger spin are not indefinitely deferred
				// by the "scatter + autoplay" check inside Game.checkAndShowWinDialog.
				try {
					gameStateManager.isScatter = false;
				} catch { }
				try {
					scene.events.emit('enableSymbols');
				} catch { }
				try {
					scene.events.emit('dialogAnimationsComplete');
				} catch { }
				// Restore background music volume if it was ducked
				try {
					const audioManager = (window as any).audioManager;
					if (audioManager && typeof audioManager.restoreBackground === 'function') {
						audioManager.restoreBackground();
					}
				} catch { }
				return;
			}
			// Don't disable dialog elements yet for free spin dialogs - let candy transition handle it
			this.startCandyTransition(scene);
			return;
		}

		// Use normal transition for other dialogs
		// Disable dialog elements for other dialogs
		this.disableAllWinDialogElements();
		this.startNormalTransition(scene);
	}

	/**
	 * Check if the current dialog is a win dialog
	 */
	private isWinDialog(): boolean {
		return this.currentDialogType === 'BigWin' ||
			this.currentDialogType === 'MegaWin' ||
			this.currentDialogType === 'EpicWin' ||
			this.currentDialogType === 'SuperWin' ||
			this.currentDialogType === 'MaxWin';
	}

	private fadeInDialogDimmer(scene: Scene): void {
		// Ensure black overlay is visible and reset to transparent for fade-in
		this.blackOverlay.setVisible(true);
		this.blackOverlay.setAlpha(0);

		scene.tweens.add({
			targets: this.blackOverlay,
			alpha: 1,
			duration: 500,
			ease: 'Power2',
			onComplete: () => {
			}
		});
	}

	public async playRadialLightTransition(options?: {
		durationMs?: number;
		centerX?: number;
		centerY?: number;
	}): Promise<void> {
		const scene = this.currentScene;
		if (!scene || !this.radialLightTransition) {
			return;
		}
		try {
			const am = (window as any)?.audioManager;
			if (am && typeof am.playSoundEffect === 'function') {
				am.playSoundEffect(SoundEffectType.WHISTLE_BB);
			}
		} catch { }
		const centerX = options?.centerX ?? scene.scale.width * 0.5;
		const centerY = options?.centerY ?? scene.scale.height * 0.5;
		await this.radialLightTransition.playRevealTransition({
			durationMs: options?.durationMs,
			centerX,
			centerY
		});
	}

	/**
	 * Start candy transition for free spin dialog
	 */
	private startCandyTransition(scene: Scene): void {
		// Hide dialog visuals immediately, but defer cleanup/bonus mode until autoplay is about to start.
		this.disableAllWinDialogElements();
		try { this.dialogOverlay?.setVisible(false); } catch { }
		try {
			const sceneAny: any = scene as any;
			sceneAny.__deferredBonusStart = () => {
				this.cleanupDialog();
				try {
					const audioManager = (window as any).audioManager;
					if (audioManager && typeof audioManager.restoreBackground === 'function') {
						audioManager.restoreBackground();
					}
				} catch { }
			};
		} catch { }

		// Switch to bonus visuals immediately as the radial light transition begins.
		this.triggerBonusMode(scene);

		// Play radial light transition before signaling dialog completion (starts free spins).
		let completionEmitted = false;
		const emitDialogCompleteOnce = () => {
			if (completionEmitted) return;
			completionEmitted = true;
			try {
				this.radialLightTransition?.forceFinish();
			} catch { }
			scene.events.emit('dialogAnimationsComplete');
		};
		// Fallback to avoid freezing if the transition tween doesn't complete.
		try {
			setTimeout(emitDialogCompleteOnce, 1600);
		} catch { }
		this.playRadialLightTransition().then(() => {
			emitDialogCompleteOnce();
		}).catch(() => {
			emitDialogCompleteOnce();
		});
	}

	/**
	 * Start normal black screen transition for non-free spin dialogs
	 */
	private startNormalTransition(scene: Scene): void {


		// Store the dialog type before cleanup for bonus mode check
		const dialogTypeBeforeCleanup = this.currentDialogType;
		// Keep MaxWin close behavior consistent with previous win-dialog path (fade out active win SFX).
		if (dialogTypeBeforeCleanup === 'MaxWin') {
			try {
				const audioManager = (window as any).audioManager;
				if (audioManager && typeof audioManager.fadeOutCurrentWinSfx === 'function') {
					audioManager.fadeOutCurrentWinSfx(450);
				}
			} catch (e) {
				console.warn('[Dialogs] Failed to fade out win dialog SFX:', e);
			}
		}

		// Create centralized black screen overlay
		const blackScreen = scene.add.graphics();
		blackScreen.setDepth(9490);
		blackScreen.fillStyle(0x000000, 1);
		blackScreen.fillRect(0, 0, scene.scale.width, scene.scale.height);
		blackScreen.setAlpha(0); // Start transparent

		// Fade in black screen
		scene.tweens.add({
			targets: blackScreen,
			alpha: 1,
			duration: 300,
			ease: 'Power2',
			onComplete: () => {

				// Hide dialog immediately while screen is black
				this.cleanupDialog();

				// Check if we need to trigger bonus mode while screen is black
				if (dialogTypeBeforeCleanup === 'FreeSpin' || dialogTypeBeforeCleanup === 'FreeSpinRetrigger') {
					this.triggerBonusMode(scene);

					// If this FreeSpinDialog was a retrigger, remove black screen immediately
					// so that the next win dialog can appear without delay
					if (this.isRetriggerFreeSpin) {
						try {
							const audioManager = (window as any).audioManager;
							if (audioManager && typeof audioManager.restoreBackground === 'function') {
								audioManager.restoreBackground();
							}
						} catch { }
						blackScreen.destroy();
						return;
					}
				} else {
					// If end-of-bonus dialog closed while in bonus mode, revert to base visuals and reset symbols
					if (dialogTypeBeforeCleanup === 'Congrats' || dialogTypeBeforeCleanup === 'TotalWin' || dialogTypeBeforeCleanup === 'MaxWin') {
						// Switch off bonus mode visuals and music
						scene.events.emit('setBonusMode', false);
						scene.events.emit('hideBonusBackground');
						scene.events.emit('hideBonusHeader');
						// Reset symbols/win state for base game
						scene.events.emit('resetSymbolsForBase');

						// Ensure win sequence finalization when starting normal transition
						try {
							gameEventManager.emit(GameEventType.WIN_STOP);
						} catch { }

					}
					// Re-enable symbols after transition completes (normal flow)
					scene.events.emit('enableSymbols');
				}

				// Emit dialog animations complete event for scatter bonus reset
				scene.events.emit('dialogAnimationsComplete');
				// Restore background music volume after dialog completes
				try {
					const audioManager = (window as any).audioManager;
					if (audioManager && typeof audioManager.restoreBackground === 'function') {
						audioManager.restoreBackground();
					}
				} catch { }

				// Wait 0.7 seconds, then fade out
				scene.time.delayedCall(700, () => {
					scene.tweens.add({
						targets: blackScreen,
						alpha: 0,
						duration: 300,
						ease: 'Power2',
						onComplete: () => {
							// Clean up black screen
							blackScreen.destroy();

							// Ensure UI is back to normal only when end-of-bonus dialog closes
							if (dialogTypeBeforeCleanup === 'Congrats' || dialogTypeBeforeCleanup === 'TotalWin' || dialogTypeBeforeCleanup === 'MaxWin') {
								scene.events.emit('hideBonusBackground');
								scene.events.emit('hideBonusHeader');
							}
							// End-of-bonus dialogs must emit the same close signal once the
							// transition fully finishes so paused base autoplay and button
							// state recovery happen after the screen is back to normal.
							if (dialogTypeBeforeCleanup === 'Congrats' || dialogTypeBeforeCleanup === 'TotalWin' || dialogTypeBeforeCleanup === 'MaxWin') {
								gameEventManager.emit(GameEventType.WIN_DIALOG_CLOSED);
							}

						}
					});
				});
			}
		});
	}

	/**
	 * Start direct fade-out sequence for win dialogs (no black overlay)
	 */
	private startWinDialogFadeOut(scene: Scene): void {

		// Check if we should play outro animation before fading out
		const animations = this.currentDialogType ? this.getAnimationNameForDialogType(this.currentDialogType) : null;
		const hasOutro = animations && animations.outro;

		if (hasOutro && this.currentDialog && this.currentDialog.animationState) {
			try {
				// Play outro animation, then fade out after it completes
				startAnimation(this.currentDialog, { animationName: animations.outro!, loop: false });

				// Get animation duration (estimate 1 second if we can't get it)
				const outroTrack = this.currentDialog.animationState.getCurrent(0);
				const outroDuration = outroTrack?.animation?.duration ? outroTrack.animation.duration * 1000 : 0;

				// Wait for outro to complete, then start fade-out
				scene.time.delayedCall(outroDuration, () => {
					this.performWinDialogFadeOut(scene);
				});
				return; // Exit early, fade-out will happen after outro
			} catch (error) {
				console.warn(`[Dialogs] Failed to play outro animation, proceeding with fade-out:`, error);
				// Fall through to normal fade-out
			}
		}

		// No outro or outro failed, proceed with normal fade-out
		this.performWinDialogFadeOut(scene);
	}

	/**
	 * Perform the actual fade-out sequence for win dialogs
	 */
	private performWinDialogFadeOut(scene: Scene): void {
		const dialogTypeBeforeCleanup = this.currentDialogType;
		// Fade out any currently playing win SFX
		try {
			const audioManager = (window as any).audioManager;
			if (audioManager && typeof audioManager.fadeOutCurrentWinSfx === 'function') {
				audioManager.fadeOutCurrentWinSfx(450);
			}
		} catch (e) {
			console.warn('[Dialogs] Failed to fade out win dialog SFX:', e);
		}

		// Keep the black overlay visible as background - don't hide it
		// The black overlay provides the dialog background for readability

		// Re-enable symbols immediately for win dialays
		scene.events.emit('enableSymbols');

		// Collect all elements that need to fade out
		const fadeOutTargets: any[] = [];

		// Don't fade out the dialog overlay container - only fade out its contents
		// This prevents conflicts between container and child element fade-outs

		// Add black overlay if visible
		if (this.blackOverlay && this.blackOverlay.visible) {
			fadeOutTargets.push(this.blackOverlay);
		}

		// Add current dialog if it exists
		if (this.currentDialog) {
			// Don't add Spine animation to main fade-out targets - we'll control it manually
			// fadeOutTargets.push(this.currentDialog);

			// Debug Spine animation properties
			if (this.currentDialog.animationState) {
			}
		}
		if (this.currentDialogOverlay) {
		}

		// Add number display if it exists
		if (this.numberDisplayContainer) {
			fadeOutTargets.push(this.numberDisplayContainer);
		}

		// Add continue text if it exists
		if (this.continueText) {
			fadeOutTargets.push(this.continueText);
		}


		// Fade out all elements together
		scene.tweens.add({
			targets: fadeOutTargets,
			alpha: 0,
			duration: 500,
			ease: 'Power2',
			onStart: () => {

				// Log the current alpha values of all targets
				fadeOutTargets.forEach((target, index) => {
					if (target && typeof target.alpha === 'number') {
					}
				});

				// Specifically check the Spine animation
				if (this.currentDialog && this.currentDialog.animationState) {
				}
			},
			onUpdate: (tween) => {
				// Log progress every 100ms
				const progress = Math.floor(tween.progress * 100);
				if (progress % 20 === 0) { // Log every 20%

					// Check Spine animation during fade-out
					if (this.currentDialog && this.currentDialog.animationState) {
					}
				}

				// Manually control Spine animation alpha during fade-out
				if (this.currentDialog && this.currentDialog.animationState) {
					const targetAlpha = 1 - tween.progress; // Calculate target alpha based on progress
					this.currentDialog.setAlpha(targetAlpha);
				}
				if (this.currentDialogOverlay && this.currentDialogOverlay.animationState) {
					const targetAlpha = 1 - tween.progress;
					this.currentDialogOverlay.setAlpha(targetAlpha);
				}
			},
			onComplete: () => {

				// Log final alpha values
				fadeOutTargets.forEach((target, index) => {
					if (target && typeof target.alpha === 'number') {
					}
				});

				// Check Spine animation after fade-out
				if (this.currentDialog && this.currentDialog.animationState) {
				}


				// Clean up dialog content after fade-out
				this.cleanupDialogContent();

				// Now perform the actual cleanup of destroyed elements
				this.performDialogCleanup();

				// If MaxWin was closed at end of bonus, revert to base visuals like TotalWin.
				if (dialogTypeBeforeCleanup === 'MaxWin') {
					scene.events.emit('setBonusMode', false);
					scene.events.emit('hideBonusBackground');
					scene.events.emit('hideBonusHeader');
					scene.events.emit('resetSymbolsForBase');
					try {
						gameEventManager.emit(GameEventType.WIN_STOP);
					} catch { }
				}

				// Reset alpha to 1 for next dialog
				this.dialogOverlay.setAlpha(1);

				// Ensure black overlay is completely hidden after win dialog closes
				if (this.blackOverlay) {
					this.blackOverlay.setVisible(false);
					this.blackOverlay.setAlpha(0);
				}

				// Emit dialog animations complete event
				scene.events.emit('dialogAnimationsComplete');

				// Emit win dialog closed event for autoplay
				gameEventManager.emit(GameEventType.WIN_DIALOG_CLOSED);
				// Restore background music volume
				try {
					const audioManager = (window as any).audioManager;
					if (audioManager && typeof audioManager.restoreBackground === 'function') {
						audioManager.restoreBackground();
					}
				} catch { }
			}
		});

		// Remove the separate Spine tween to avoid timing conflicts
		// The main tween should handle all elements including the Spine animation
	}

	/**
	 * Clean up dialog content without hiding the overlay (for win dialogs)
	 */
	private cleanupDialogContent(): void {

		// Don't hide the dialog overlay - keep it visible for next dialog
		// this.dialogOverlay.setVisible(false);
		// Don't set isDialogActive to false yet - keep it true until cleanup is complete
		// this.isDialogActive = false;

		// Reset current dialog type
		this.currentDialogType = null;

		// Reset staged win state
		this.isStagedWinNumberAnimation = false;
		if (this.stagedWinStageTimer) {
			(this.stagedWinStageTimer as Phaser.Time.TimerEvent).destroy();
			this.stagedWinStageTimer = null;
		}
		this.stagedWinStages = [];
		this.stagedWinCurrentStageIndex = 0;

		// Don't call performDialogCleanup here - it destroys elements that are still fading out
		// Instead, just reset the state and let the fade-out animation complete naturally
		// The actual cleanup will happen after the fade-out completes

		// Don't hide the black overlay when win dialog closes - let the next dialog handle it
		// This ensures that if a free spin dialog appears next, it will have the black overlay available

	}

	/**
	 * Check if we should trigger bonus mode based on current dialog type
	 */
	private shouldTriggerBonusMode(): boolean {
		return this.currentDialogType === 'FreeSpin' || this.currentDialogType === 'FreeSpinRetrigger';
	}

	/**
	 * Trigger bonus mode by enabling bonus background and header
	 */
	private triggerBonusMode(scene: Scene): void {

		// Set bonus mode in backend data
		scene.events.emit('setBonusMode', true);

		// Clear scatter state so win dialogs are not deferred or auto-closed after retrigger
		try {
			gameStateManager.isScatter = false;
		} catch { }

		// Switch to bonus background
		scene.events.emit('showBonusBackground');

		// Switch to bonus header
		scene.events.emit('showBonusHeader');

		// Re-enable symbols after bonus mode setup
		scene.events.emit('enableSymbols');

	}

	/**
	 * Clean up dialog without any transition effects
	 */
	private cleanupDialog(): void {
		if (!this.isDialogActive) return;


		// Hide the dialog overlay
		this.dialogOverlay.setVisible(false);
		this.isDialogActive = false;
		this.hideBlackOverlay();

		// Reset current dialog type
		this.currentDialogType = null;

		// Reset staged win state
		this.isStagedWinNumberAnimation = false;
		if (this.stagedWinStageTimer) {
			(this.stagedWinStageTimer as Phaser.Time.TimerEvent).destroy();
			this.stagedWinStageTimer = null;
		}
		this.stagedWinStages = [];
		this.stagedWinCurrentStageIndex = 0;

		// Clean up all dialog elements
		this.performDialogCleanup();

	}

	/**
	 * Perform the actual cleanup of dialog elements
	 */
	private performDialogCleanup(): void {

		// Clean up current dialog
		if (this.currentDialog) {
			this.currentDialog.destroy();
			this.currentDialog = null;
		}
		if (this.currentDialogOverlay) {
			this.currentDialogOverlay.destroy();
			this.currentDialogOverlay = null;
		}

		// Clean up continue text
		if (this.continueText) {
			this.continueText.destroy();
			this.continueText = null;
		}

		// Clean up number display
		if (this.numberDisplayContainer) {
			this.numberDisplayContainer.destroy();
			this.numberDisplayContainer = null;
		}

		// Clean up click area
		if (this.clickArea) {
			// Properly disable interactivity before destroying
			if (this.clickArea.input && this.clickArea.input.enabled) {
				this.clickArea.disableInteractive();
			}
			this.clickArea.destroy();
			this.clickArea = null;
		}

		// Clean up congrats secondary free spins display if present
		if (this.congratsFreeSpinsContainer) {
			this.congratsFreeSpinsContainer.destroy();
			this.congratsFreeSpinsContainer = null;
			this.congratsFreeSpinsDisplay = null;
		}

		// Clear auto-close timer if it exists
		if (this.autoCloseTimer) {
			this.autoCloseTimer.destroy();
			this.autoCloseTimer = null;
		}

		// Now that all elements are destroyed, set dialog as inactive
		this.isDialogActive = false;
	}

	/**
	 * Hide the dialog with a simple black overlay transition
	 */
	hideDialog(immediate: boolean = false): void {
		if (!this.isDialogActive) return;


		if (immediate || !this.currentScene) {
			// Immediate hide (used when swapping dialogs).
			this.dialogOverlay.setVisible(false);
			this.isDialogActive = false;
			this.hideBlackOverlay();
			this.performDialogCleanup();
			return;
		}

		if (this.currentScene) {
			// Create a black overlay for transition (below menu popup depth 9501)
			const transitionOverlay = this.currentScene.add.graphics();
			transitionOverlay.setDepth(9490);
			transitionOverlay.fillStyle(0x000000, 1);
			transitionOverlay.fillRect(0, 0, this.currentScene.scale.width, this.currentScene.scale.height);
			transitionOverlay.setAlpha(0); // Start transparent

			// Fade in black overlay over 0.75 seconds
			this.currentScene.tweens.add({
				targets: transitionOverlay,
				alpha: 1,
				duration: 750,
				ease: 'Power2',
				onComplete: () => {

					// Hide dialog immediately while screen is black
					this.dialogOverlay.setVisible(false);
					this.isDialogActive = false;
					this.hideBlackOverlay();

					// Fade out black overlay over 0.75 seconds
					this.currentScene!.tweens.add({
						targets: transitionOverlay,
						alpha: 0,
						duration: 750,
						ease: 'Power2',
						onComplete: () => {
							// Clean up transition overlay
							transitionOverlay.destroy();
						}
					});
				}
			});
		} else {
			// Fallback if no scene reference
			this.dialogOverlay.setVisible(false);
			this.isDialogActive = false;
			this.hideBlackOverlay();
		}

		// Perform cleanup after transition
		this.hideBlackOverlay();
		this.performDialogCleanup();

	}

	/**
	 * Check if dialog is currently showing
	 */
	isDialogShowing(): boolean {
		return this.isDialogActive;
	}

	/**
	 * Check if radial light transition is currently animating.
	 */
	public isRadialLightTransitionInProgress(): boolean {
		try {
			return !!(this.radialLightTransition && this.radialLightTransition.isRunning());
		} catch {
			return false;
		}
	}

	/**
	 * Get the current dialog type
	 */
	getCurrentDialogType(): string | null {
		return this.currentDialog ? this.currentDialog.texture.key : null;
	}

	/**
	 * Resize the dialog overlay when screen size changes
	 */
	resize(scene: Scene): void {
		// Update stored scene reference
		this.currentScene = scene;

		if (this.blackOverlay) {
			this.blackOverlay.clear();
			this.blackOverlay.fillStyle(0x000000, 0.7);
			this.blackOverlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
		}
	}

	/**
	 * Get the dialog overlay container
	 */
	getContainer(): Phaser.GameObjects.Container {
		return this.dialogOverlay;
	}

	/**
	 * Destroy the dialog system
	 */
	destroy(): void {
		this.hideDialog();
		if (this.dialogOverlay) {
			this.dialogOverlay.destroy();
		}
	}

	/**
	 * Configure staged win number and animation thresholds based on bet and total win.
	 * Example (bet=0.20, win=0.60, final type=SuperWin):
	 *  - BigWin (BigWin)   -> 0.16 (0.8x)
	 *  - MegaWin (MegaWin) -> 0.20 (1x)
	 *  - EpicWin (EpicWin) -> 0.40 (2x)
	 *  - SuperWin (SuperWin) -> 0.60 (final win)
	 */
	private setupStagedWinNumberAnimation(config: DialogConfig): void {
		const winAmount = config.winAmount ?? 0;
		const betAmount = config.betAmount ?? 0;

		if (winAmount <= 0 || betAmount <= 0) {
			this.isStagedWinNumberAnimation = false;
			this.stagedWinStages = [];
			this.stagedWinCurrentStageIndex = 0;
			this.numberTargetValue = winAmount;
			return;
		}

		// Order of tiers and their multiplier thresholds
		const orderedTypes: Array<'BigWin' | 'MegaWin' | 'EpicWin' | 'SuperWin'> = [
			'BigWin',
			'MegaWin',
			'EpicWin',
			'SuperWin'
		];
		const thresholds = [
			WIN_THRESHOLDS.BIG_WIN,
			WIN_THRESHOLDS.MEGA_WIN,
			WIN_THRESHOLDS.EPIC_WIN,
			WIN_THRESHOLDS.SUPER_WIN
		]; // multipliers relative to bet

		const finalIndex = orderedTypes.indexOf(config.type as any);
		if (finalIndex <= 0) {
			// Only apply staged behavior when final tier is at least Medium (MegaWin) or higher
			this.isStagedWinNumberAnimation = false;
			this.stagedWinStages = [];
			this.stagedWinCurrentStageIndex = 0;
			this.numberTargetValue = winAmount;
			return;
		}

		let stages: Array<{ type: 'BigWin' | 'MegaWin' | 'EpicWin' | 'SuperWin'; target: number }> = [];
		let lastTarget = 0;

		// Add intermediate tiers (below the final tier) only at their threshold values,
		// but only if the win actually reaches those thresholds.
		for (let i = 0; i < finalIndex && i < thresholds.length; i++) {
			const type = orderedTypes[i];
			const multiplier = thresholds[i];
			const thresholdValue = betAmount * multiplier;

			if (winAmount >= thresholdValue && thresholdValue > lastTarget) {
				stages.push({ type, target: thresholdValue });
				lastTarget = thresholdValue;
			}
		}

		// Always add exactly one stage for the final tier, targeting the actual win amount.
		// This prevents showing the same tier twice (once at its threshold and once at the final win).
		stages.push({ type: config.type as any, target: winAmount });
		lastTarget = winAmount;

		// If we ended up with only a single stage (no intermediate thresholds crossed),
		// just use the normal single-number animation on the final tier.
		if (stages.length <= 1) {
			this.isStagedWinNumberAnimation = false;
			this.stagedWinStages = [];
			this.stagedWinCurrentStageIndex = 0;
			this.numberTargetValue = winAmount;
			return;
		}

		this.isStagedWinNumberAnimation = true;
		this.stagedWinStages = stages;
		this.stagedWinCurrentStageIndex = 0;
		// For staged animation, the numberTargetValue is only used as a fallback.
		this.numberTargetValue = winAmount;


		// Ensure the visual sequence starts from the first tier (e.g. BigWin),
		// not from the final tier that was passed into showDialog.
		try {
			const firstStage = this.stagedWinStages[0];
			this.currentDialogType = firstStage.type;

			// If we loaded the final tier asset, recreate the dialog for the first staged tier
			if (this.currentDialogAssetType !== firstStage.type) {
				const sceneRef = this.currentScene;
				if (sceneRef) {
					this.createDialogContent(sceneRef, { type: firstStage.type });
				}
			}

			if (this.currentDialog && this.currentDialog.animationState) {
				const animations = this.getAnimationNameForDialogType(firstStage.type);
				if (animations) {
					const shouldLoop = this.getDialogLoop(firstStage.type);
					try {
						if (this.disableIntroAnimations) {
							startAnimation(this.currentDialog, { animationName: animations.idle, loop: shouldLoop });
						} else {
							startAnimation(this.currentDialog, { animationName: animations.intro, loop: false });
							queueAnimation(this.currentDialog, { animationName: animations.idle, loop: shouldLoop, delay: 0 });
						}
						// Apply scale pop whenever we transition into idle
						const sceneRef = this.currentScene;
						if (sceneRef) {
							this.applyDialogScalePop(sceneRef);
						}
					} catch (err) {
						console.warn('[Dialogs] Staged win: failed to play intro/idle for first stage, using idle only', err);
						startAnimation(this.currentDialog, { animationName: animations.idle, loop: shouldLoop });
						const sceneRef = this.currentScene;
						if (sceneRef) {
							this.applyDialogScalePop(sceneRef);
						}
					}
				}
			}
		} catch (e) {
			console.warn('[Dialogs] Staged win: failed to initialize first stage animation sequence', e);
		}
	}

	/**
	 * Run staged win number sequence and switch spine animations per stage.
	 */
	private startStagedWinNumberSequence(scene: Scene): void {
		if (!this.numberDisplay || !this.currentDialog) {
			console.warn('[Dialogs] Cannot start staged win sequence - missing numberDisplay or currentDialog');
			this.isStagedWinNumberAnimation = false;
			return;
		}

		// Clear any previous staged win timer before starting
		if (this.stagedWinStageTimer) {
			(this.stagedWinStageTimer as Phaser.Time.TimerEvent).destroy();
			this.stagedWinStageTimer = null;
		}

		this.runStagedWinStage(scene, 0, false);
	}

	/**
	 * Execute a single staged win tier and schedule the next one if applicable.
	 * When fastFromSkip is true, we use a shorter number animation for manual skips.
	 */
	private runStagedWinStage(scene: Scene, index: number, fastFromSkip: boolean): void {
		// Abort if staged sequencing has been disabled (e.g., user manually
		// closed the dialog).
		if (!this.isStagedWinNumberAnimation) {
			return;
		}

		// Abort if dialog has been deactivated (e.g., user clicked to close)
		if (!this.isDialogActive) {
			this.isStagedWinNumberAnimation = false;
			return;
		}

		if (!this.numberDisplay || !this.currentDialog) {
			console.warn('[Dialogs] Staged win: display or dialog missing during stage run');
			this.isStagedWinNumberAnimation = false;
			return;
		}

		if (index >= this.stagedWinStages.length) {
			this.isStagedWinNumberAnimation = false;
			return;
		}

		this.stagedWinCurrentStageIndex = index;
		const stage = this.stagedWinStages[index];

		// Ensure the staged tier uses the correct dialog asset (BZ uses separate Spine assets per tier)
		if (!this.currentDialog || this.currentDialogAssetType !== stage.type) {
			try {
				this.currentDialogType = stage.type;
				this.createDialogContent(scene, { type: stage.type });
			} catch (e) {
				console.warn('[Dialogs] Staged win: failed to recreate dialog content for stage', stage.type, e);
			}
		} else {
			this.currentDialogType = stage.type;
		}


		// Play correct audio for the current tier and fade out any previous tier SFX
		try {
			if (!this.isDialogActive) {
				this.isStagedWinNumberAnimation = false;
				return;
			}
			const audioManager = (window as any).audioManager;
			if (audioManager) {
				if (typeof audioManager.fadeOutCurrentWinSfx === 'function') {
					audioManager.fadeOutCurrentWinSfx(200);
				}
				if (typeof audioManager.playWinDialogSfx === 'function') {
					audioManager.playWinDialogSfx(stage.type);
				}
				if (typeof audioManager.duckBackground === 'function') {
					audioManager.duckBackground(0.3);
				}
			}
		} catch (e) {
			console.warn('[Dialogs] Failed to trigger staged tier SFX:', e);
		}

		// Switch the spine animation to match the current tier.
		// For the first stage, the animation was already initialized in setupStagedWinNumberAnimation,
		// so avoid resetting it here to prevent the "first tier plays twice" effect.
		if (index > 0 || fastFromSkip) {
			try {
				const animations = this.getAnimationNameForDialogType(stage.type);
				if (animations && this.currentDialog.animationState) {
					const shouldLoop = this.getDialogLoop(stage.type);
					try {
						if (this.disableIntroAnimations) {
							startAnimation(this.currentDialog, { animationName: animations.idle, loop: shouldLoop });
						} else {
							startAnimation(this.currentDialog, { animationName: animations.intro, loop: false });
							queueAnimation(this.currentDialog, { animationName: animations.idle, loop: shouldLoop, delay: 0 });
						}
						// Apply scale pop whenever we transition into idle
						const sceneRef = this.currentScene || scene;
						if (sceneRef) {
							this.applyDialogScalePop(sceneRef);
						}
					} catch (err) {
						console.warn('[Dialogs] Staged win: intro/idle animation failed, using idle only', err);
						startAnimation(this.currentDialog, { animationName: animations.idle, loop: shouldLoop });
						const sceneRef = this.currentScene || scene;
						if (sceneRef) {
							this.applyDialogScalePop(sceneRef);
						}
					}
				}
			} catch (e) {
				console.warn('[Dialogs] Staged win: failed to switch spine animation for stage', stage.type, e);
			}
		}

		// Animate the number to this stage target
		const isFirstStage = index === 0;
		const defaultDurationMs = 2500; // time for the counter animation
		const fastDurationMs = 2500; // shorter animation when skipping
		const numberAnimDurationMs = fastFromSkip ? fastDurationMs : defaultDurationMs;
		const perStageDwellMs = 2000; // approximate dwell time per tier (matches original auto-close)

		this.numberDisplay!.animateToValue(stage.target, {
			duration: numberAnimDurationMs,
			ease: 'Power2',
			startFromCurrent: !isFirstStage || fastFromSkip
		});

		const lastIndex = this.stagedWinStages.length - 1;

		// Schedule next stage after the per-stage dwell time so that, visually,
		// each tier behaves like its own win dialog before the next one appears.
		if (index + 1 < this.stagedWinStages.length) {
			// Cancel any previous stage timer before scheduling the next one
			const timer = this.stagedWinStageTimer;
			if (timer) {
				timer.destroy();
				this.stagedWinStageTimer = null;
			}

			this.stagedWinStageTimer = scene.time.delayedCall(perStageDwellMs, () => {
				// Guard again in case dialog was closed during the dwell
				if (!this.isDialogActive || !this.isStagedWinNumberAnimation) {
					this.isStagedWinNumberAnimation = false;
					this.stagedWinStageTimer = null;
					return;
				}
				this.stagedWinStageTimer = null;
				this.runStagedWinStage(scene, index + 1, false);
			});
		} else {

			// If we're in autoplay and the original auto-close timer was cleared due to a manual
			// skip, ensure the final staged tier still auto-closes after a sensible dwell.
			try {
				if (!this.autoCloseTimer && this.isWinDialog() && this.currentDialogType !== 'MaxWin') {
					// Detect free spin autoplay (bonus autoplay) via Symbols component on the scene
					let isFreeSpinAutoplay = false;
					try {
						const gameScene: any = scene as any;
						const symbolsComponent = gameScene?.symbols;
						if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function') {
							isFreeSpinAutoplay = !!symbolsComponent.isFreeSpinAutoplayActive();
						}
					} catch { }

					const isAutoplaying = gameStateManager.isAutoPlaying || isFreeSpinAutoplay;
					if (isAutoplaying) {
						const perStageDwellFinalMs = 2000; // Keep in sync with setupAutoCloseTimer
						const finalStageDwellMs = perStageDwellFinalMs + 1500;


						this.autoCloseTimer = scene.time.delayedCall(finalStageDwellMs, () => {
							this.handleDialogClick(scene, true);
						});
					}
				}
			} catch (e) {
				console.warn('[Dialogs] Failed to create auto-close timer for final staged tier:', e);
			}
		}
	}

	/**
	 * Skip directly to a specific staged win tier (used for manual "press anywhere"
	 * skips while a staged win dialog is playing).
	 */
	private skipToStagedWinStage(scene: Scene, nextIndex: number): void {
		if (!this.numberDisplay || !this.currentDialog) {
			console.warn('[Dialogs] skipToStagedWinStage: missing numberDisplay or currentDialog - closing dialog instead');
			// Fallback: behave like a normal close
			this.startFadeOutSequence(scene);
			this.resetGameStateForNewSpin(scene);
			return;
		}

		if (nextIndex < 0 || nextIndex >= this.stagedWinStages.length) {
			console.warn('[Dialogs] skipToStagedWinStage: invalid staged index', nextIndex);
			this.isStagedWinNumberAnimation = false;
			// Fallback: close dialog normally
			this.startFadeOutSequence(scene);
			this.resetGameStateForNewSpin(scene);
			return;
		}

		// Cancel any pending staged win timer from the previous stage so we can
		// take over progression from this skipped-to tier.
		if (this.stagedWinStageTimer) {
			this.stagedWinStageTimer.destroy();
			this.stagedWinStageTimer = null;
		}


		// Ensure staged sequencing remains active for this dialog and run the
		// requested tier with a faster number animation.
		this.isStagedWinNumberAnimation = true;
		this.runStagedWinStage(scene, nextIndex, true);
	}

	/**
	 * Apply a scale "pop-in" from 0 -> lastDialogScaleX/Y on the current dialog.
	 * Called whenever we transition into an idle animation so it also applies
	 * to subsequent dialogs / staged win tiers.
	 */
	private applyDialogScalePop(scene: Scene): void {
		if (!this.currentDialog) {
			return;
		}

		const targetScaleX = this.lastDialogScaleX || 1;
		const targetScaleY = this.lastDialogScaleY || 1;
		try {
			(this.currentDialog as any).setScale?.(0, 0);
		} catch { }

		scene.tweens.add({
			targets: this.currentDialog,
			scaleX: targetScaleX,
			scaleY: targetScaleY,
			duration: 800,
			ease: 'Back.Out'
		});
	}

	// Helper methods for dialog configuration
	private getDialogScale(dialogType: string): number {
		const renderType = this.getDialogRenderType(dialogType);
		return this.dialogScales[renderType] || 1.0;
	}

	private getDialogScaleXY(dialogType: string): { x: number; y: number } | null {
		if (!this.isTotalWinDialogType(dialogType)) {
			return null;
		}
		const scaleMap = (this as any).dialogScaleXY as Record<string, { x: number; y: number }> | undefined;
		return scaleMap?.[dialogType] ?? null;
	}

	private getDialogPosition(dialogType: string, scene: Scene): { x: number; y: number } {
		const renderType = this.getDialogRenderType(dialogType);
		const position = this.dialogPositions[renderType];
		if (position) {
			// Convert relative positions (0.0 to 1.0) to absolute screen coordinates
			return {
				x: (position.x * scene.scale.width),
				y: (position.y * scene.scale.height)
			};
		}
		// Default to center of screen
		return {
			x: (scene.scale.width / 2),
			y: (scene.scale.height / 2)
		};
	}

	private getDialogLoop(dialogType: string): boolean {
		const renderType = this.getDialogRenderType(dialogType);
		return this.dialogLoops[renderType] || false;
	}

	// Convenience methods for specific dialog types
	showCongrats(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'Congrats', ...config });
	}

	showTotalWin(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'TotalWin', ...config });
	}

	showFreeSpinDialog(scene: Scene, config?: Partial<DialogConfig>): void {
		const delayMs = 1000;
		scene.time.delayedCall(delayMs, () => {
			this.showDialog(scene, { type: 'FreeSpin', ...config });
		});
	}

	showFreeSpinRetriggerDialog(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'FreeSpinRetrigger', isRetrigger: true, ...config });
	}

	/**
	 * Check conditions and either show the appropriate win dialog or defer (push to queue).
	 * Caller (Game) owns the queue and processWinQueue; this method uses context to push/schedule.
	 */
	public checkAndShowWinDialog(scene: Scene, payout: number, bet: number, context: CheckAndShowWinDialogContext): void {
		if (context.isSuppressed()) {
			return;
		}

		try {
			const symbolsAny = context.symbols as any;
			const isMultiplierAnimationsInProgress =
				symbolsAny && typeof symbolsAny.isMultiplierAnimationsInProgress === 'function'
					? !!symbolsAny.isMultiplierAnimationsInProgress()
					: false;

			if (isMultiplierAnimationsInProgress) {
				context.pushToQueue(payout, bet);
				context.scheduleProcessQueue();
				return;
			}
		} catch (e) {
			console.warn('[Dialogs] Failed to check multiplier animation status:', e);
		}

		try {
			const symbolsAny = context.symbols as any;
			const isRetriggerAnimationInProgress =
				symbolsAny && typeof symbolsAny.isScatterRetriggerAnimationInProgress === 'function'
					? !!symbolsAny.isScatterRetriggerAnimationInProgress()
					: false;

			if (isRetriggerAnimationInProgress) {
				context.pushToQueue(payout, bet);
				return;
			}
		} catch (e) {
			console.warn('[Dialogs] Failed to check retrigger animation status:', e);
		}

		try {
			const symbolsAny = context.symbols as any;
			const hasPendingRetrigger =
				(symbolsAny && typeof symbolsAny.hasPendingScatterRetrigger === 'function' && symbolsAny.hasPendingScatterRetrigger()) ||
				(symbolsAny && typeof symbolsAny.hasPendingSymbol0Retrigger === 'function' && symbolsAny.hasPendingSymbol0Retrigger());

			if (!hasPendingRetrigger) {
				const isFreeSpinAutoplayActive =
					symbolsAny && typeof symbolsAny.isFreeSpinAutoplayActive === 'function'
						? !!symbolsAny.isFreeSpinAutoplayActive()
						: false;
				const isNormalAutoplayActive = !!(gameStateManager.isAutoPlaying || context.gameData?.isAutoPlaying);

				if (gameStateManager.isScatter && (isNormalAutoplayActive || isFreeSpinAutoplayActive)) {
					context.pushToQueue(payout, bet);
					return;
				}
			}
		} catch (e) {
			console.warn('[Dialogs] Failed to evaluate scatter/autoplay deferral:', e);
		}

		if (this.isDialogShowing()) {
			context.pushToQueue(payout, bet);
			return;
		}

		const multiplier = payout / bet;
		if (multiplier < WIN_THRESHOLDS.BIG_WIN) {
			gameStateManager.isShowingWinDialog = false;
			return;
		}

		if (multiplier >= WIN_THRESHOLDS.SUPER_WIN) {
			this.showSuperWin(scene, { winAmount: payout, betAmount: bet });
		} else if (multiplier >= WIN_THRESHOLDS.EPIC_WIN) {
			this.showLargeWin(scene, { winAmount: payout, betAmount: bet });
		} else if (multiplier >= WIN_THRESHOLDS.MEGA_WIN) {
			this.showMediumWin(scene, { winAmount: payout, betAmount: bet });
		} else {
			this.showSmallWin(scene, { winAmount: payout, betAmount: bet });
		}
	}

	showLargeWin(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'EpicWin', ...config });
	}

	showMediumWin(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'MegaWin', ...config });
	}

	showSmallWin(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'BigWin', ...config });
	}

	showSuperWin(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'SuperWin', ...config });
	}

	showMaxWin(scene: Scene, config?: Partial<DialogConfig>): void {
		this.showDialog(scene, { type: 'MaxWin', ...config });
	}

	/**
	 * Configure the default auto-close behavior for win dialogs.
	 * Pass null to disable the default auto-close.
	 */
	public setDefaultWinDialogAutoClose(ms: number | null, enabled: boolean = true): void {
		if (ms === null) {
			this.defaultWinDialogAutoCloseMs = null;
			this.defaultWinDialogAutoCloseEnabled = false;
			return;
		}
		const normalized = Math.max(0, Number(ms) || 0);
		this.defaultWinDialogAutoCloseMs = normalized;
		this.defaultWinDialogAutoCloseEnabled = enabled;
	}

	public setDefaultWinDialogAutoCloseEnabled(enabled: boolean): void {
		this.defaultWinDialogAutoCloseEnabled = enabled;
	}
}



