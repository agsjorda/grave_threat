import { Scene } from 'phaser';
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameStateManager } from "../../managers/GameStateManager";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import { CurrencyManager } from "./CurrencyManager";
import { startAnimation } from "../../utils/SpineAnimationHelper";
import { formatCurrencyNumber } from "../../utils/NumberPrecisionFormatter";
import { SoundEffectType } from "../../managers/AudioManager";

export interface AutoplayOptionsConfig {
	position?: { x: number; y: number };
	scale?: number;
	onClose?: () => void;
	onConfirm?: (autoplayCount: number) => void;
	currentAutoplayCount?: number;
	/**
	 * Current base bet (without enhanced multiplier).
	 */
	currentBet?: number;
	/**
	 * Current displayed bet (optional). If provided and `currentBet` is not,
	 * we will treat it as the bet to display while keeping base bet best-effort.
	 */
	currentBetDisplay?: number;
	currentBalance?: number;
	/**
	 * Display multiplier for bet (e.g. 1.25 when Enhance/Amplify is active)
	 */
	betDisplayMultiplier?: number;
	/**
	 * Optional legacy flag; if provided and multiplier isn't, we infer 1.25
	 */
	isEnhancedBet?: boolean;
}

export class AutoplayOptions {
	private container: Phaser.GameObjects.Container;
	private background: Phaser.GameObjects.Graphics;
	private fullScreenBlocker: Phaser.GameObjects.Graphics;
	private confirmButtonMask: Phaser.GameObjects.Graphics;
	private confirmButtonImage: Phaser.GameObjects.Image;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private currentAutoplayCount: number = 10;
	private currentBet: number = 0.20; // Default bet amount (base bet)
	private currentBalance: number = 0; // Current game balance
	private betDisplayMultiplier: number = 1;
	private isEnhancedBet: boolean = false;
	private readonly DISABLED_ALPHA: number = 0.5;
	private autoplayOptions: number[] = [
		10, 30, 50, 75, 100, 150, 500, 1000
	];
	private betOptions: number[] = [
		0.2, 0.4, 0.6, 0.8, 1,
		1.2, 1.6, 2, 2.4, 2.8,
		3.2, 3.6, 4, 5, 6,
		8, 10, 14, 18, 24,
		32, 40, 60, 80, 100,
		110, 120, 130, 140, 150
	];
	private autoplayButtons: Phaser.GameObjects.Container[] = [];
	private selectedButtonIndex: number = -1;
	private selectedBetIndex: number = -1;
	private closeButton: Phaser.GameObjects.Text;
	private confirmButton: Phaser.GameObjects.Text;
	private autoplayDisplay: Phaser.GameObjects.Text;
	private minusButton: Phaser.GameObjects.Text;
	private plusButton: Phaser.GameObjects.Text;
	private balanceAmountText: Phaser.GameObjects.Text;
	private enhanceBetIdleAnimation: any = null;
	private onCloseCallback?: () => void;
	private onConfirmCallback?: (autoplayCount: number) => void;

	private getAutoplaySpinCost(): number {
		const baseBet = this.currentBet || 0;
		const multiplier = this.isEnhancedBet ? 1.25 : 1;
		return baseBet * multiplier;
	}

	private canStartAutoplay(): boolean {
		try {
			const cost = this.getAutoplaySpinCost();
			if (!isFinite(cost) || cost <= 0) return true;
			return this.currentBalance >= cost;
		} catch {
			return true;
		}
	}

	private updateStartAutoplayButtonState(): void {
		if (!this.confirmButtonImage) return;

		const canStart = this.canStartAutoplay();
		if (!canStart) {
			this.confirmButtonImage.setAlpha(this.DISABLED_ALPHA);
			this.confirmButtonImage.disableInteractive();
		} else {
			this.confirmButtonImage.setAlpha(1);
			this.confirmButtonImage.setInteractive();
		}
	}

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	create(scene: Scene): void {
		console.log("[AutoplayOptions] Creating autoplay options component");
		
		// Create main container
		this.container = scene.add.container(0, 0);
		this.container.setDepth(12001); // Above header (9500), backgrounds (850/9000), and dialogs (12000)
		
		// Create full-screen interaction blocker
		this.createFullScreenBlocker(scene);
		
		// Create background
		this.createBackground(scene);
		
		// Create header
		this.createHeader(scene);
		
		// Create autoplay options grid
		this.createAutoplayOptionsGrid(scene);
		
		// Create autoplay input section
		this.createAutoplayInput(scene);
		
		// Create enhanced bet animation
		this.createEnhanceBetAnimation(scene);
		
		// Create confirm button
		this.createConfirmButton(scene);
		
		// Initially hide the component
		this.container.setVisible(false);
		if (this.fullScreenBlocker) {
			this.fullScreenBlocker.setVisible(false);
		}
	}

	private createFullScreenBlocker(scene: Scene): void {
		const screenWidth = scene.scale.width;
		const screenHeight = scene.scale.height;
		
		// Create full-screen blocker behind the menu
		this.fullScreenBlocker = scene.add.graphics();
		this.fullScreenBlocker.fillStyle(0x000000, 0.01); // Nearly transparent, just to block interactions
		this.fullScreenBlocker.fillRect(0, 0, screenWidth, screenHeight);
		this.fullScreenBlocker.setInteractive(new Phaser.Geom.Rectangle(0, 0, screenWidth, screenHeight), Phaser.Geom.Rectangle.Contains);
		this.fullScreenBlocker.setDepth(9500); // Just below the popup container (9501)
		this.fullScreenBlocker.setVisible(false);
	}

	private createBackground(scene: Scene): void {
		const screenWidth = scene.scale.width;
		const screenHeight = scene.scale.height;
		const backgroundHeight = 772;
		const backgroundTop = screenHeight - backgroundHeight;
		
		// Background overlay with rounded corners
		this.background = scene.add.graphics();
		this.background.fillStyle(0x000000, 0.80); // Semi-transparent black overlay
		this.background.fillRoundedRect(0, backgroundTop, screenWidth, backgroundHeight, 20);
		this.background.setInteractive(new Phaser.Geom.Rectangle(0, backgroundTop, screenWidth, backgroundHeight), Phaser.Geom.Rectangle.Contains);
		this.container.add(this.background);
	}

	private createHeader(scene: Scene): void {
		const screenWidth = scene.scale.width;
		const screenHeight = scene.scale.height;
		const backgroundHeight = 772;
		const backgroundTop = screenHeight - backgroundHeight;
		
		const x = screenWidth * 0.5;
		const headerY = backgroundTop + 40; // Position relative to background top
		
		// AUTOPLAY SETTINGS title
		const autoplayTitle = scene.add.text(x - 180, headerY, 'AUTOPLAY SETTINGS', {
			fontSize: '24px',
			color: '#00ff00',
			fontFamily: 'Poppins-Bold'
		});
		autoplayTitle.setOrigin(0, 0.5);
		this.container.add(autoplayTitle);
		
		// Close button (X)
		this.closeButton = scene.add.text(x + 180, headerY, '×', {
			fontSize: '30px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		this.closeButton.setOrigin(0.5, 0.5);
		this.closeButton.setInteractive();
		this.closeButton.on('pointerdown', () => {
			const audioManager =
				(this.container?.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			// Create slide-down animation
			if (this.container.scene) {
				this.container.scene.tweens.add({
					targets: this.container,
					y: this.container.scene.scale.height,
					duration: 400,
					ease: 'Power2.in',
					onComplete: () => {
						this.hide();
						if (this.onCloseCallback) this.onCloseCallback();
					}
				});
			} else {
				this.hide();
				if (this.onCloseCallback) this.onCloseCallback();
			}
		});
		this.container.add(this.closeButton);
		
		// Balance display below header
		this.createBalanceDisplay(scene, x, headerY + 60);
	}

	private createBalanceDisplay(scene: Scene, centerX: number, y: number): void {
		// Create balance display container
		const balanceContainer = scene.add.container(centerX, y + 20);
		
		// Balance container background
		const balanceWidth = 364;
		const balanceHeight = 68;
		const balanceBg = scene.add.graphics();
		balanceBg.fillStyle(0x1f1f1f, 1);
		balanceBg.fillRoundedRect(-balanceWidth/2, -balanceHeight/2, balanceWidth, balanceHeight, 10);
		balanceBg.lineStyle(1, 0x333333, 1);
		balanceBg.strokeRoundedRect(-balanceWidth/2, -balanceHeight/2, balanceWidth, balanceHeight, 10);
		balanceContainer.add(balanceBg);
		
		// "Balance" label
		const balanceLabel = scene.add.text(-150, 1, 'Balance', {
			fontSize: '20px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		balanceLabel.setOrigin(0, 0.5);
		balanceContainer.add(balanceLabel);
		
		// Balance amount - using the current balance from game data
		// Check if demo mode is active - if so, use blank currency prefix
		const isDemo = (scene as any).gameAPI?.getDemoState();
		const prefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
		const balanceAmount = scene.add.text(150, 1, `${prefix}${this.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, {
			fontSize: '20px',
			color: '#00ff00',
			fontFamily: 'Poppins-Bold'
		});
		balanceAmount.setOrigin(1, 0.5);
		this.balanceAmountText = balanceAmount; // Store reference
		balanceContainer.add(balanceAmount);
		
		// Add the balance container to the main container
		this.container.add(balanceContainer);
	}

	private createAutoplayOptionsGrid(scene: Scene): void {
		const screenWidth = scene.scale.width;
		const screenHeight = scene.scale.height;
		const backgroundHeight = 772;
		const backgroundTop = screenHeight - backgroundHeight;
		
		const startX = screenWidth * 0.5 - 180;
		const startY = backgroundTop + 240; // Position relative to background top
		const buttonWidth = 79;
		const buttonHeight = 60;
		const spacing = 15;
		
		// "Number of autospins" label
		const selectSizeLabel = scene.add.text(startX, startY - 30, 'Number of autospins', {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		selectSizeLabel.setOrigin(0, 0.5);
		this.container.add(selectSizeLabel);
		
		// Create grid of autoplay option buttons (2 rows of 4)
		for (let i = 0; i < this.autoplayOptions.length; i++) {
			const row = Math.floor(i / 4);
			const col = i % 4;
			const x = startX + col * (buttonWidth + spacing);
			const y = startY + row * (buttonHeight + spacing);
			
			const buttonContainer = this.createAutoplayOptionButton(scene, x, y, buttonWidth, buttonHeight, this.autoplayOptions[i], i);
			this.autoplayButtons.push(buttonContainer);
			this.container.add(buttonContainer);
		}
	}

	private createAutoplayOptionButton(scene: Scene, x: number, y: number, width: number, height: number, value: number, index: number): Phaser.GameObjects.Container {
		const container = scene.add.container(x, y);
		
		// Button background
		const buttonBg = scene.add.graphics();
		buttonBg.fillStyle(0x000000, 1);
		buttonBg.fillRoundedRect(0, 0, width, height, 5);
		buttonBg.lineStyle(0.5, 0xffffff, 1);
		buttonBg.strokeRoundedRect(0, 0, width, height, 5);
		container.add(buttonBg);
		
		// Store reference to background for selection state
		(container as any).buttonBg = buttonBg;
		(container as any).buttonValue = value;
		(container as any).buttonIndex = index;
		
		// Button text
		const buttonText = scene.add.text(width/2, height/2, value.toString(), {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold'
		});
		buttonText.setOrigin(0.5, 0.5);
		container.add(buttonText);
		
		// Make interactive
		container.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
		container.on('pointerdown', () => {
			const audioManager =
				(this.container?.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			this.selectButton(index, value);
		});
		
		return container;
	}

	private createAutoplayInput(scene: Scene): void {
		const screenWidth = scene.scale.width;
		const screenHeight = scene.scale.height;
		const backgroundHeight = 772;
		const backgroundTop = screenHeight - backgroundHeight;
		
		const x = screenWidth * 0.5;
		const y = backgroundTop + 490; // Position relative to background top
		
		// "Autospins" label
		const autoplayLabel = scene.add.text(x - 180, y - 70, 'Bet', {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		autoplayLabel.setOrigin(0, 0.5);
		this.container.add(autoplayLabel);
		
		// Autoplay input background
		const inputBg = scene.add.graphics();
		inputBg.fillStyle(0x000000, 1);
		inputBg.fillRoundedRect(-182, -37, 364, 74, 10);
		inputBg.lineStyle(0.5, 0xffffff, 1);
		inputBg.strokeRoundedRect(-182, -37, 364, 74, 10);
		inputBg.setPosition(x, y);
		this.container.add(inputBg);
		
		// Minus button
		this.minusButton = scene.add.text(x - 150, y, '-', {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		this.minusButton.setOrigin(0.5, 0.5);
		this.minusButton.setInteractive();
		this.minusButton.on('pointerdown', () => {
			const audioManager =
				(this.container?.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			this.selectPreviousBet();
		});
		this.container.add(this.minusButton);
		
		// Bet display
		const displayPrefix = ((scene as any).gameAPI?.getDemoState?.() ? '' : CurrencyManager.getInlinePrefix());
		this.autoplayDisplay = scene.add.text(x, y, `${displayPrefix}${formatCurrencyNumber(this.currentBet)}` , {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold'
		});
		this.autoplayDisplay.setOrigin(0.5, 0.5);
		this.container.add(this.autoplayDisplay);
		
		// Plus button
		this.plusButton = scene.add.text(x + 150, y, '+', {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		this.plusButton.setOrigin(0.5, 0.5);
		this.plusButton.setInteractive();
		this.plusButton.on('pointerdown', () => {
			const audioManager =
				(this.container?.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}
			this.selectNextBet();
		});
		this.container.add(this.plusButton);
	}

	private createEnhanceBetAnimation(scene: Scene): void {
		try {
			if (!ensureSpineFactory(scene, '[AutoplayOptions] createEnhanceBetAnimation')) {
				return;
			}

			if (!scene.cache.json.has('enhance_bet_idle_on')) {
				console.warn('[AutoplayOptions] enhance_bet_idle_on spine assets not loaded');
				return;
			}

			const screenWidth = scene.scale.width;
			const screenHeight = scene.scale.height;
			const backgroundHeight = 772;
			const backgroundTop = screenHeight - backgroundHeight;

			const betX = screenWidth * 0.5;
			const betY = backgroundTop + 490;
			const animationOffsetX = -10;
			const animationOffsetY = 0;

			this.enhanceBetIdleAnimation = scene.add.spine(
				betX + animationOffsetX,
				betY + animationOffsetY,
				'enhance_bet_idle_on',
				'enhance_bet_idle_on-atlas'
			);
			this.enhanceBetIdleAnimation.setOrigin(0.5, 0.5);
			this.enhanceBetIdleAnimation.setScale(2.94, 1.35);
			this.enhanceBetIdleAnimation.setDepth(2001);
			this.enhanceBetIdleAnimation.setVisible(false);

			this.container.add(this.enhanceBetIdleAnimation);
		} catch (error) {
			console.error('[AutoplayOptions] Failed to create enhance bet idle animation:', error);
		}
	}

	private showEnhanceBetIdleLoop(): void {
		if (!this.enhanceBetIdleAnimation) {
			return;
		}
		this.enhanceBetIdleAnimation.setVisible(true);
		const idleName = 'animation';
		const animations = this.enhanceBetIdleAnimation.skeleton?.data.animations || [];
		startAnimation(this.enhanceBetIdleAnimation, {
			animationName: idleName,
			fallbackAnimationName: animations[0]?.name,
			fallbackToFirstAvailable: true,
			loop: true,
			logWhenMissing: false
		});
	}

	private hideEnhanceBetIdleLoop(): void {
		if (!this.enhanceBetIdleAnimation) {
			return;
		}
		this.enhanceBetIdleAnimation.animationState.clearTracks();
		this.enhanceBetIdleAnimation.setVisible(false);
	}

	private createConfirmButton(scene: Scene): void {
		const screenWidth = scene.scale.width;
		const screenHeight = scene.scale.height;
		const backgroundHeight = 772;
		const backgroundTop = screenHeight - backgroundHeight;
		
		const x = screenWidth * 0.5;
		const y = backgroundTop + 580;
		
		// Use long_button image instead of gradient/mask
		const buttonImage = scene.add.image(x, y, 'long_button');
		buttonImage.setOrigin(0.5, 0.5);
		buttonImage.setDisplaySize(364, 62);
		this.container.add(buttonImage);
		this.confirmButtonImage = buttonImage;
		
		// Button label
		this.confirmButton = scene.add.text(x, y, 'START AUTOPLAY', {
			fontSize: '24px',
			color: '#000000',
			fontFamily: 'Poppins-Bold'
		});
		this.confirmButton.setOrigin(0.5, 0.5);
		this.container.add(this.confirmButton);
		
		buttonImage.setInteractive();
		buttonImage.on('pointerdown', () => {
			console.log('[AutoplayOptions] START AUTOPLAY clicked');
			const audioManager =
				(this.container?.scene as any)?.audioManager || (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
			}

			// Click safety guard
			if (!this.canStartAutoplay()) {
				this.updateStartAutoplayButtonState();
				return;
			}

			// Immediately flag that an autoplay spin has been requested so that
			// the main spin button treats the game as "autoplaying" right away.
			// This closes the window where a very fast click on SPIN could still
			// trigger a manual spin before autoplay actually starts.
			try {
				gameStateManager.isAutoPlaySpinRequested = true;
			} catch (e) {
				console.warn('[AutoplayOptions] Failed to set isAutoPlaySpinRequested:', e);
			}

			if (this.container.scene) {
				this.container.scene.tweens.add({
					targets: this.container,
					y: this.container.scene.scale.height,
					duration: 400,
					ease: 'Power2.in',
					onComplete: () => {
						if (this.onConfirmCallback) this.onConfirmCallback(this.currentAutoplayCount);
						this.hide();
					}
				});
			} else {
				if (this.onConfirmCallback) this.onConfirmCallback(this.currentAutoplayCount);
				this.hide();
			}
		});

		this.updateStartAutoplayButtonState();
	}

	private selectButton(index: number, value: number): void {
		// Use the same dimensions as defined in createAutoplayOptionsGrid
		const buttonWidth = 79;
		const buttonHeight = 60;
		
		// Deselect previous button
		if (this.selectedButtonIndex >= 0 && this.selectedButtonIndex < this.autoplayButtons.length) {
			const prevButton = this.autoplayButtons[this.selectedButtonIndex];
			const prevBg = (prevButton as any).buttonBg;
			prevBg.clear();
			prevBg.fillStyle(0x000000, 1);
			prevBg.fillRoundedRect(0, 0, buttonWidth, buttonHeight, 5);
			prevBg.lineStyle(0.5, 0xffffff, 1);
			prevBg.strokeRoundedRect(0, 0, buttonWidth, buttonHeight, 5);
		}
		
		// Select new button
		this.selectedButtonIndex = index;
		this.currentAutoplayCount = value;
		
		// Update selected button background to solid neon green
		const selectedButton = this.autoplayButtons[index];
		const selectedBg = (selectedButton as any).buttonBg;
		selectedBg.clear();
		selectedBg.fillStyle(0x66D449, 1);
		selectedBg.fillRoundedRect(0, 0, buttonWidth, buttonHeight, 5);
		selectedBg.lineStyle(0.5, 0xffffff, 1);
		selectedBg.strokeRoundedRect(0, 0, buttonWidth, buttonHeight, 5);
		
		this.updateAutoplayDisplay();
	}

	private updateAutoplayDisplay(): void {
		if (this.autoplayDisplay) {
			const displayBet = this.isEnhancedBet ? this.currentBet * 1.25 : this.currentBet;
			const isDemo = (this.container?.scene as any)?.gameAPI?.getDemoState?.();
			const prefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
			this.autoplayDisplay.setText(`${prefix}${formatCurrencyNumber(displayBet)}`);
		}
	}

	private updateBalanceDisplay(): void {
		if (this.balanceAmountText) {
			const isDemo = (this.container?.scene as any)?.gameAPI?.getDemoState?.();
			const prefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
			this.balanceAmountText.setText(`${prefix}${formatCurrencyNumber(this.currentBalance)}`);
		}
	}

	private selectPreviousAutoplay(): void {
		if (this.selectedButtonIndex > 0) {
			this.selectButton(this.selectedButtonIndex - 1, this.autoplayOptions[this.selectedButtonIndex - 1]);
		}
	}

	private selectNextAutoplay(): void {
		if (this.selectedButtonIndex < this.autoplayOptions.length - 1) {
			this.selectButton(this.selectedButtonIndex + 1, this.autoplayOptions[this.selectedButtonIndex + 1]);
		}
	}

	/**
	 * Update - / + button states: disable - at minimum bet, disable + at maximum bet
	 * (same behavior as BetController and BetOptions).
	 */
	private updateBetLimitButtons(): void {
		const isAtMin = this.selectedBetIndex <= 0;
		const isAtMax = this.selectedBetIndex >= this.betOptions.length - 1;

		if (this.minusButton) {
			if (isAtMin) {
				this.minusButton.setAlpha(0.5);
				this.minusButton.setTint(0x555555);
				this.minusButton.disableInteractive();
			} else {
				this.minusButton.setAlpha(1.0);
				this.minusButton.clearTint();
				this.minusButton.setInteractive();
			}
		}

		if (this.plusButton) {
			if (isAtMax) {
				this.plusButton.setAlpha(0.5);
				this.plusButton.setTint(0x555555);
				this.plusButton.disableInteractive();
			} else {
				this.plusButton.setAlpha(1.0);
				this.plusButton.clearTint();
				this.plusButton.setInteractive();
			}
		}
	}

	private selectBet(index: number, value: number): void {
		this.selectedBetIndex = index;
		this.currentBet = value;
		this.updateAutoplayDisplay();
		this.updateStartAutoplayButtonState();
		this.updateBetLimitButtons();
	}

	private selectPreviousBet(): void {
		if (this.selectedBetIndex > 0) {
			this.selectBet(this.selectedBetIndex - 1, this.betOptions[this.selectedBetIndex - 1]);
		}
	}

	private selectNextBet(): void {
		if (this.selectedBetIndex < this.betOptions.length - 1) {
			this.selectBet(this.selectedBetIndex + 1, this.betOptions[this.selectedBetIndex + 1]);
		}
	}

	show(config?: AutoplayOptionsConfig): void {
		if (config) {
			if (config.currentAutoplayCount !== undefined) {
				this.currentAutoplayCount = config.currentAutoplayCount;
			}
			if (config.betDisplayMultiplier !== undefined) {
				this.betDisplayMultiplier = config.betDisplayMultiplier;
				// Sync isEnhancedBet based on betDisplayMultiplier
				this.isEnhancedBet = Math.abs(this.betDisplayMultiplier - 1.25) < 0.01;
			} else if (config.isEnhancedBet !== undefined) {
				this.isEnhancedBet = config.isEnhancedBet;
				this.betDisplayMultiplier = config.isEnhancedBet ? 1.25 : 1;
			}

			if (config.currentBet !== undefined) {
				// Base bet
				this.currentBet = config.currentBet;
			} else if (config.currentBetDisplay !== undefined) {
				// Best-effort fallback: treat display bet as the base bet when not provided.
				this.currentBet = config.currentBetDisplay / (this.betDisplayMultiplier || 1);
			}
			if (config.currentBalance !== undefined) {
				this.currentBalance = config.currentBalance;
			}
			this.onCloseCallback = config.onClose;
			this.onConfirmCallback = config.onConfirm;
		}
		
		// Update the balance display with current balance
		this.updateBalanceDisplay();
		
		// Find and select the button that matches the current autoplay count
		const matchingIndex = this.autoplayOptions.findIndex(option => option === this.currentAutoplayCount);
		if (matchingIndex !== -1) {
			this.selectButton(matchingIndex, this.autoplayOptions[matchingIndex]);
		} else {
			// If no exact match, select the closest option
			let closestIndex = 0;
			let closestDifference = Math.abs(this.autoplayOptions[0] - this.currentAutoplayCount);
			
			for (let i = 1; i < this.autoplayOptions.length; i++) {
				const difference = Math.abs(this.autoplayOptions[i] - this.currentAutoplayCount);
				if (difference < closestDifference) {
					closestDifference = difference;
					closestIndex = i;
				}
			}
			this.selectButton(closestIndex, this.autoplayOptions[closestIndex]);
		}
		
		// Initialize bet selector to match current bet (closest option)
		const betMatchingIndex = this.betOptions.findIndex(option => Math.abs(option - this.currentBet) < 0.01);
		if (betMatchingIndex !== -1) {
			this.selectBet(betMatchingIndex, this.betOptions[betMatchingIndex]);
		} else {
			let closestBetIndex = 0;
			let closestBetDifference = Math.abs(this.betOptions[0] - this.currentBet);
			for (let i = 1; i < this.betOptions.length; i++) {
				const difference = Math.abs(this.betOptions[i] - this.currentBet);
				if (difference < closestBetDifference) {
					closestBetDifference = difference;
					closestBetIndex = i;
				}
			}
			this.selectBet(closestBetIndex, this.betOptions[closestBetIndex]);
		}

		this.updateAutoplayDisplay();
		this.updateStartAutoplayButtonState();
		if (this.isEnhancedBet) {
			this.showEnhanceBetIdleLoop();
		} else {
			this.hideEnhanceBetIdleLoop();
		}

		// Show full-screen blocker
		if (this.fullScreenBlocker) {
			this.fullScreenBlocker.setVisible(true);
		}
		
		// Start positioned below the screen for slide-up effect
		this.container.setY(this.container.scene.scale.height);
		this.container.setVisible(true);
		
		// Show the mask when the panel is shown
		if (this.confirmButtonMask) {
			this.confirmButtonMask.setVisible(true);
			this.confirmButtonMask.setAlpha(1);
		}
		
		// Create slide-up animation
		if (this.container.scene) {
			this.container.scene.tweens.add({
				targets: this.container,
				y: 0,
				duration: 400,
				ease: 'Power2.out'
			});
		}
	}

	hide(): void {
		this.container.setVisible(false);
		
		// Hide full-screen blocker
		if (this.fullScreenBlocker) {
			this.fullScreenBlocker.setVisible(false);
		}
		this.hideEnhanceBetIdleLoop();
		
		// Hide the mask when the panel is hidden
		if (this.confirmButtonMask) {
			this.confirmButtonMask.setVisible(false);
			this.confirmButtonMask.setAlpha(0);
		}
	}

	isVisible(): boolean {
		return this.container.visible;
	}

	setCurrentAutoplayCount(count: number): void {
		this.currentAutoplayCount = count;
		this.updateAutoplayDisplay();
	}

	getCurrentAutoplayCount(): number {
		return this.currentAutoplayCount;
	}

	setCurrentBet(bet: number): void {
		this.currentBet = bet;
		this.updateAutoplayDisplay();
		this.updateStartAutoplayButtonState();
	}

	setCurrentBalance(balance: number): void {
		this.currentBalance = balance;
		this.updateBalanceDisplay();
		this.updateStartAutoplayButtonState();
	}

	getCurrentBet(): number {
		return this.currentBet;
	}

	destroy(): void {
		if (this.fullScreenBlocker) {
			this.fullScreenBlocker.destroy();
		}
		if (this.container) {
			this.container.destroy();
		}
	}
} 
