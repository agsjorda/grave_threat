import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { gameStateManager } from '../../managers/GameStateManager';
import { CurrencyManager } from './CurrencyManager';
import { BONUS_TUMBLE_TOTAL_WIN_DELAY_MS, HEADER_CONFIG, SHOW_HEADER_BORDER, BONUS_HEADER_WIN_BAR_TEXT_OFFSET_Y } from '../../config/GameConfig';
import { getTotalWinFromPaylines, getTumbleTotal } from './Spin';
import {
	createScaledHeaderImage,
	getHeaderLayoutHeight,
	getHeaderLayoutWidth,
} from "./HeaderLayout";

export class BonusHeader {
	private bonusHeaderContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private amountText!: Phaser.GameObjects.Text;
	private youWonText!: Phaser.GameObjects.Text;
	private currentWinnings: number = 0;
	// Tracks cumulative total during bonus mode by incrementing each spin's subtotal
	private cumulativeBonusWin: number = 0;
	private hasStartedBonusTracking: boolean = false;
		// Seed value from scatter trigger to start cumulative tracking in bonus
	private scatterBaseWin: number = 0;
	// If true, the next bonus spin's total should NOT be added (already seeded).
	private skipNextSpinAccumulation: boolean = false;
	// Track if we've already accumulated this spin's total (prevents double add with WIN_STOP)
	private accumulatedThisSpin: boolean = false;
	private showingTotalWin: boolean = false;
	private lastProcessedBonusWinStopSignature: string | null = null;
	private tumbleTotalDisplayTimer: Phaser.Time.TimerEvent | null = null;
	private lastTumbleCumulative: number = 0;
	private scene: Scene | null = null;
	private headerLogoImage?: Phaser.GameObjects.Image;
	private headerBorderImage?: Phaser.GameObjects.Image;
	private headerWinBarImage?: Phaser.GameObjects.Image;
	// Track if we just seeded the win to prevent immediate text overrides
	private justSeededWin: boolean = false;
	// Suppress win bar text while TotalWin dialog is showing
	private suppressWinbarDisplay: boolean = false;
	private debugHeaderFrameBorder?: Phaser.GameObjects.Graphics;
	private debugHeaderBorder?: Phaser.GameObjects.Graphics;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
		console.log(`[BonusHeader] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[BonusHeader] Creating bonus header elements");
		
		// Store scene reference for animations
		this.scene = scene;
		
		// Create main container for all bonus header elements
		this.bonusHeaderContainer = scene.add.container(0, 0).setDepth(9500); // Above controller (900) and background (850)
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[BonusHeader] Creating bonus header with scale: ${assetScale}x`);

		// Add bonus header elements
		this.createBonusHeaderElements(scene, assetScale);
		scene.events.on('update', (_time: number, _delta: number) => {
			this.updateHeaderDebugBorder();
		});
		this.updateHeaderDebugBorder();
		
		// Set up event listeners for winnings updates (like regular header)
		this.setupWinningsEventListener();

		// Hide win bar text while TotalWin dialog is visible
		this.setupWinbarSuppressionListeners(scene);
		
		// Initialize winnings display - start hidden
		this.initializeWinnings();
	}

	private setupWinbarSuppressionListeners(scene: Scene): void {
		// Do not hide win bar text when TotalWin dialog shows; keep it visible until bonus header is hidden.
		scene.events.on('dialogShown', (_dialogType: string) => {
			// Reserved for future dialog-specific behavior if needed.
		});
		scene.events.on('hideBonusHeader', () => {
			this.suppressWinbarDisplay = false;
		});
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			if (!isBonus) {
				this.suppressWinbarDisplay = false;
			}
		});
	}

	private createBonusHeaderElements(scene: Scene, assetScale: number): void {
		// Create header images (Scene, WinBar, SceneFrame) - same for portrait and landscape
		this.createHeaderImages(scene);

		// Portrait and landscape currently share the same layout for win bar text.
		this.createCommonBonusHeaderLayout(scene, assetScale);
	}

	private createHeaderImages(scene: Scene): void {
		const centerX = scene.scale.width * 0.5;
		const centerXView = scene.cameras?.main ? scene.cameras.main.centerX : centerX;
		const frameScaleX = Math.max(0.01, HEADER_CONFIG.HEADER_CONTAINER_SCALE_X);
		const frameScaleY = Math.max(0.01, HEADER_CONFIG.HEADER_CONTAINER_SCALE_Y);
		const baseWidth = Math.max(1, getHeaderLayoutWidth(scene));
		const baseHeight = Math.max(1, getHeaderLayoutHeight(scene));
		const containerWidth = baseWidth * frameScaleX;
		const containerHeight = baseHeight * frameScaleY;
		const anchorX = centerXView + HEADER_CONFIG.HEADER_OFFSET_X;
		const anchorY = HEADER_CONFIG.HEADER_OFFSET_Y + HEADER_CONFIG.HEADER_CONTAINER_OFFSET_Y;

		if (scene.textures.exists('header_logo')) {
			const logoY = anchorY + HEADER_CONFIG.HEADER_LOGO_OFFSET_Y;
			this.headerLogoImage = scene.add.image(anchorX, logoY, 'header_logo').setOrigin(0.5, 0);
			const widthFitScale = scene.scale.width / this.headerLogoImage.width;
			this.headerLogoImage.setScale(widthFitScale * HEADER_CONFIG.HEADER_LOGO_SCALE);
			this.headerLogoImage.setDepth(0);
			this.bonusHeaderContainer.add(this.headerLogoImage);
		}
		if (scene.textures.exists('header_border')) {
			const borderY = anchorY + HEADER_CONFIG.HEADER_BORDER_OFFSET_Y;
			this.headerBorderImage = scene.add.image(anchorX, borderY, 'header_border').setOrigin(0.5, 0);
			const widthFitScale = scene.scale.width / this.headerBorderImage.width;
			this.headerBorderImage.setScale(widthFitScale * HEADER_CONFIG.HEADER_BORDER_SCALE);
			this.headerBorderImage.setDepth(1);
			this.bonusHeaderContainer.add(this.headerBorderImage);
		}
		if (scene.textures.exists('header_winbar')) {
			const winBarY = anchorY + containerHeight + HEADER_CONFIG.WIN_BAR_OFFSET_Y;
			this.headerWinBarImage = createScaledHeaderImage(scene, 'header_winbar', centerX, winBarY);
			this.headerWinBarImage.setScale((scene.scale.width / this.headerWinBarImage.width) * HEADER_CONFIG.WIN_BAR_SCALE);
			// Keep win bar image exactly one depth below win bar text.
			this.headerWinBarImage.setDepth(BonusHeader.WIN_BAR_DEPTH - 1);
			this.bonusHeaderContainer.add(this.headerWinBarImage);
		}
	}

	private createCommonBonusHeaderLayout(scene: Scene, assetScale: number): void {
		console.log("[BonusHeader] Creating bonus header layout");

		// Create winnings text at a stable position (was inside win bar)
		const winBarTextY = scene.scale.height * 0.15
			+ HEADER_CONFIG.WIN_BAR_TEXT_OFFSET_Y
			+ BONUS_HEADER_WIN_BAR_TEXT_OFFSET_Y;
		this.createWinBarText(scene, scene.scale.width * 0.5, winBarTextY);
	}

	// Depth above RadialLightTransition overlay (20000) so Total win stays visible during candy/radial light
	// Keep win bar text below dialog overlay layers (Dialogs uses ~13000+).
	private static readonly WIN_BAR_DEPTH = 9502;
	private static readonly WIN_BAR_SCALE_EPSILON = 0.01;

	private createWinBarText(scene: Scene, x: number, y: number): void {
		// Line 1: "YOU WON"
		this.youWonText = scene.add.text(x, y - 7, 'YOU WON', {
			fontSize: '18px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(BonusHeader.WIN_BAR_DEPTH).setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE); // Above header frame/win bar, below dialogs
		// Don't add to container - add directly to scene so depth works correctly

		// Line 2: amount value
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemoInitial = (this.scene as any)?.gameAPI?.getDemoState();
		const prefixInitial = isDemoInitial ? '' : CurrencyManager.getInlinePrefix();
		this.amountText = scene.add.text(x, y + 18, `${prefixInitial}0.00`, {
			fontSize: '24px',
			color: '#00ff00',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(BonusHeader.WIN_BAR_DEPTH).setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE); // Above header frame/win bar, below dialogs
		// Don't add to container - add directly to scene so depth works correctly
		
		// Hide by default - only show when bonus is triggered
		this.youWonText.setVisible(false);
		this.amountText.setVisible(false);
	}

	private isScaleAtTarget(current: number, target: number): boolean {
		return Math.abs(current - target) <= BonusHeader.WIN_BAR_SCALE_EPSILON;
	}

	private isWinbarAtBaseScale(): boolean {
		return this.isScaleAtTarget(this.youWonText.scaleX, HEADER_CONFIG.WIN_BAR_TEXT_SCALE)
			&& this.isScaleAtTarget(this.youWonText.scaleY, HEADER_CONFIG.WIN_BAR_TEXT_SCALE)
			&& this.isScaleAtTarget(this.amountText.scaleX, HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE)
			&& this.isScaleAtTarget(this.amountText.scaleY, HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE);
	}

	private updateHeaderDebugBorder(): void {
		if (!SHOW_HEADER_BORDER) {
			if (this.debugHeaderBorder) {
				this.debugHeaderBorder.clear();
				this.debugHeaderBorder.setVisible(false);
			}
			return;
		}

		const bounds = this.getHeaderDebugBounds();
		if (!bounds || !this.scene) {
			if (this.debugHeaderBorder) {
				this.debugHeaderBorder.clear();
				this.debugHeaderBorder.setVisible(false);
			}
			return;
		}

		if (!this.debugHeaderBorder) {
			this.debugHeaderBorder = this.scene.add.graphics().setDepth(20002);
		}

		this.debugHeaderBorder.clear();
		this.debugHeaderBorder.lineStyle(2, 0xff0000, 1);
		this.debugHeaderBorder.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
		const isHeaderVisible = Boolean(this.bonusHeaderContainer?.visible);
		this.debugHeaderBorder.setVisible(isHeaderVisible);
	}

	private getHeaderDebugBounds(): Phaser.Geom.Rectangle | null {
		const candidates: any[] = [
			this.headerLogoImage,
			this.headerBorderImage,
			this.headerWinBarImage,
			this.youWonText,
			this.amountText
		];

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (const item of candidates) {
			if (!item || typeof item.getBounds !== 'function') continue;
			try {
				const bounds = item.getBounds();
				if (!bounds) continue;
				const x = Number(bounds.x ?? 0);
				const y = Number(bounds.y ?? 0);
				const width = Number(bounds.width ?? 0);
				const height = Number(bounds.height ?? 0);
				if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) continue;
				if (width <= 0 || height <= 0) continue;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x + width);
				maxY = Math.max(maxY, y + height);
			} catch {}
		}

		if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
			return null;
		}
		return new Phaser.Geom.Rectangle(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
	}

	/**
	 * Update the winnings display in the bonus header with scale in animation
	 */
	public updateWinningsDisplay(winnings: number): void {
		if (this.suppressWinbarDisplay) {
			return;
		}
		if (this.amountText && this.youWonText) {
			const formattedWinnings = this.formatCurrency(winnings);
			const valueChanged = Math.abs(this.currentWinnings - winnings) > 0.01;
			this.amountText.setText(formattedWinnings);
			
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}

			// Check if already visible and scaled
			const isAlreadyVisible = this.youWonText.visible && this.amountText.visible;
			const isAlreadyScaled = this.isWinbarAtBaseScale();

			// Show both texts first
			this.youWonText.setVisible(true);
			this.amountText.setVisible(true);
			this.currentWinnings = winnings;

			if (isAlreadyVisible && isAlreadyScaled) {
				if (valueChanged) {
					// Already visible/scaled and value changed: pulse animation.
					if (this.scene) {
						this.scene.tweens.add({
							targets: this.youWonText,
							scaleX: HEADER_CONFIG.WIN_BAR_TEXT_SCALE * 1.2,
							scaleY: HEADER_CONFIG.WIN_BAR_TEXT_SCALE * 1.2,
							duration: 150,
							ease: 'Power2',
							yoyo: true,
							repeat: 0,
							onComplete: () => { this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE); }
						});
						this.scene.tweens.add({
							targets: this.amountText,
							scaleX: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE * 1.2,
							scaleY: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE * 1.2,
							duration: 150,
							ease: 'Power2',
							yoyo: true,
							repeat: 0,
							onComplete: () => { this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE); }
						});
					}
					console.log(`[BonusHeader] Winnings updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
				} else {
					// Value unchanged: keep persistent without animation.
					this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE);
					this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE);
					console.log(`[BonusHeader] Winnings value unchanged, skipping animation: ${formattedWinnings} (raw: ${winnings})`);
				}
			} else {
				// Not visible or not scaled - do full scale-in animation
				// Set initial scale to 0 for scale-in effect
				this.youWonText.setScale(0);
				this.amountText.setScale(0);
				
				// Animate scale in with bounce effect (label and value scale independently)
				if (this.scene) {
					this.scene.tweens.add({
						targets: this.youWonText,
						scaleX: HEADER_CONFIG.WIN_BAR_TEXT_SCALE,
						scaleY: HEADER_CONFIG.WIN_BAR_TEXT_SCALE,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => { this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE); }
					});
					this.scene.tweens.add({
						targets: this.amountText,
						scaleX: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE,
						scaleY: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => { this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE); }
					});
				}
				
				console.log(`[BonusHeader] Winnings updated with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		}
	}

	/**
	 * Seed the cumulative bonus total with a base amount (e.g., scatter payout)
	 * Only shows the display if bonus mode is already active to avoid race conditions
	 */
	public seedCumulativeWin(baseAmount: number): void {
		this.scatterBaseWin = Math.max(0, Number(baseAmount) || 0);
		this.cumulativeBonusWin = this.scatterBaseWin;
		this.hasStartedBonusTracking = true;
		this.justSeededWin = true; // Flag that we just seeded to prevent immediate text overrides
		this.skipNextSpinAccumulation = false;
		
		// For bonus mode, we only show per-tumble "YOU WON" values.
		// Seed the cumulative tracker silently; UI will be driven by tumble events.
		console.log(`[BonusHeader] Seeded cumulative bonus win with scatter base (tracking only): $${this.scatterBaseWin}`);
	}

	/**
	 * Seed cumulative total from the first free spin item total (buy feature flow).
	 * This shows the first spin's total at the start of free spins and avoids double-adding it later.
	 */
	public seedFromFirstFreeSpinItem(spinData: any): void {
		try {
			const triggerWin = this.calculateTriggerSpinWin(spinData);
			if (triggerWin > 0) {
				this.scatterBaseWin = triggerWin;
				this.cumulativeBonusWin = triggerWin;
				this.hasStartedBonusTracking = true;
				this.justSeededWin = true;
				this.skipNextSpinAccumulation = false;
				console.log(`[BonusHeader] Seeded cumulative from trigger spin win: $${triggerWin}`);
				return;
			}
		} catch { }
	}

	private calculateTriggerSpinWin(spinData: any): number {
		try {
			const slot: any = spinData?.slot;
			if (!slot) return 0;
			let total = 0;
			if (Array.isArray(slot.paylines)) {
				for (const payline of slot.paylines) {
					const win = Number(payline?.win ?? 0);
					total += isNaN(win) ? 0 : win;
				}
			}
			if (Array.isArray(slot.tumbles)) {
				for (const tumble of slot.tumbles) {
					const win = Number(tumble?.win ?? 0);
					total += isNaN(win) ? 0 : win;
				}
			}
			return total;
		} catch {
			return 0;
		}
	}

	private getCurrentFreeSpinItem(spinData: any): any | null {
		try {
			const fs = spinData?.slot?.freespin || spinData?.slot?.freeSpin;
			const items = Array.isArray(fs?.items) ? fs.items : [];
			if (!items.length) return null;

			// Prefer matching area when available (most reliable)
			const slotArea = spinData?.slot?.area;
			if (Array.isArray(slotArea)) {
				const areaJson = JSON.stringify(slotArea);
				const match = items.find((item: any) =>
					Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
				);
				if (match) return match;
			}

			if (items.length === 1) return items[0];

			// Try to align with Symbols' remaining counter when available
			try {
				const symbolsComponent = (this.bonusHeaderContainer.scene as any)?.symbols;
				const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
				if (typeof rem === 'number') {
					const targetB = items.find((item: any) => Number(item?.spinsLeft) === rem + 1);
					if (targetB) return targetB;
					const targetA = items.find((item: any) => Number(item?.spinsLeft) === rem);
					if (targetA) return targetA;
				}
			} catch { }

			// Fallbacks: highest spinsLeft (earliest spin) or first item
			const withSpinsLeft = items
				.filter((item: any) => typeof item?.spinsLeft === 'number' && item.spinsLeft > 0)
				.sort((a: any, b: any) => b.spinsLeft - a.spinsLeft);
			if (withSpinsLeft.length) return withSpinsLeft[0];

			return items[0];
		} catch {
			return null;
		}
	}

	private calculateBackendTotalWin(spinData: any): number {
		try {
			const slot: any = spinData?.slot;
			if (!slot) return 0;

			// Prefer backend totalWin if provided
			if (typeof slot.totalWin === 'number' && slot.totalWin > 0) {
				return Number(slot.totalWin);
			}

			let totalWin = 0;
			const freespinData = slot.freespin || slot.freeSpin;
			let itemsSum = 0;
			let hasItems = false;

			// Sum wins from freespin items
			if (freespinData?.items && Array.isArray(freespinData.items)) {
				hasItems = true;
				itemsSum = freespinData.items.reduce((sum: number, item: any) => {
					const perSpinTotal =
						(typeof item?.totalWin === 'number' && item.totalWin > 0)
							? item.totalWin
							: (item?.subTotalWin || 0);
					return sum + perSpinTotal;
				}, 0);
				totalWin += itemsSum;
			}

			// As a last resort, include paylines/tumbles if we have no item totals.
			// Avoid double-counting per-spin tumbles that are already included in item totals.
			if (!hasItems || itemsSum <= 0) {
				if (Array.isArray(slot.paylines) && slot.paylines.length > 0) {
					totalWin += this.calculateTotalWinFromPaylines(slot.paylines);
				}
				if (Array.isArray(slot.tumbles) && slot.tumbles.length > 0) {
					totalWin += this.calculateTotalWinFromTumbles(slot.tumbles);
				}
			}

			return totalWin;
		} catch {
			return 0;
		}
	}

	/**
	 * Add to the cumulative bonus total (e.g., for scatter retriggers)
	 * This preserves the existing cumulative total and adds the new amount
	 */
	public addToCumulativeWin(amount: number): void {
		const amountToAdd = Math.max(0, Number(amount) || 0);
		if (amountToAdd > 0) {
			this.cumulativeBonusWin += amountToAdd;
			this.hasStartedBonusTracking = true;
			console.log(`[BonusHeader] Added to cumulative bonus win: +$${amountToAdd}, new total: $${this.cumulativeBonusWin}`);
		}
	}

	/**
	 * Get the accumulated bonus win total.
	 */
	public getCumulativeBonusWin(): number {
		return this.cumulativeBonusWin;
	}

	/**
	 * Show the cumulative total immediately (e.g. when bonus header becomes visible).
	 * Used so the first spin's win (buy feature scatter) is not hidden - seamless transition from main header.
	 */
	public showCumulativeTotalIfReady(): void {
		if (this.cumulativeBonusWin > 0 && this.youWonText && this.amountText) {
			this.youWonText.setText('TOTAL WIN');
			this.showWinningsDisplay(this.cumulativeBonusWin);
			this.showingTotalWin = true;
			console.log(`[BonusHeader] Showing cumulative total immediately: $${this.cumulativeBonusWin}`);
		}
	}

	/**
	 * Hide the winnings display (both "YOU WON" text and amount) with shrink animation
	 */
	public hideWinningsDisplay(): void {
		if (this.amountText && this.youWonText) {
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Animate scale down to 0 before hiding
			if (this.scene) {
				this.scene.tweens.add({
					targets: [this.youWonText, this.amountText],
					scaleX: 0,
					scaleY: 0,
					duration: 200,
					ease: 'Back.easeIn',
					onComplete: () => {
						// Hide both texts after animation
						this.youWonText.setVisible(false);
						this.amountText.setVisible(false);
						// Reset scale for next show
						this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE);
						this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE);
					}
				});
			} else {
				// Fallback if scene not available
				this.youWonText.setVisible(false);
				this.amountText.setVisible(false);
			}
			
			console.log('[BonusHeader] Winnings display hidden with shrink animation');
		} else {
			console.warn('[BonusHeader] Cannot hide winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Force-hide the win bar text (used when TotalWin dialog is shown).
	 */
	public forceHideWinningsDisplay(): void {
		if (this.amountText && this.youWonText) {
			try {
				if (this.scene) {
					this.scene.tweens.killTweensOf(this.youWonText);
					this.scene.tweens.killTweensOf(this.amountText);
				}
			} catch { }
			this.youWonText.setVisible(false);
			this.amountText.setVisible(false);
			this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE);
			this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE);
			console.log('[BonusHeader] Winbar display force-hidden');
		}
	}

	/**
	 * Show the winnings display with both "YOU WON" text and amount with scale in animation
	 */
	public showWinningsDisplay(winnings: number): void {
		if (this.suppressWinbarDisplay) {
			return;
		}
		if (this.amountText && this.youWonText) {
			const formattedWinnings = this.formatCurrency(winnings);
			
			// Check if the value has actually changed before animating
			const valueChanged = Math.abs(this.currentWinnings - winnings) > 0.01; // Use small epsilon for float comparison
			
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Update amount text with winnings before showing
			this.amountText.setText(formattedWinnings);
			
			// Check if already visible and scaled
			const isAlreadyVisible = this.youWonText.visible && this.amountText.visible;
			const isAlreadyScaled = this.isWinbarAtBaseScale();
			
			// Show both texts first
			this.youWonText.setVisible(true);
			this.amountText.setVisible(true);
			
			// Update current winnings after checks
			this.currentWinnings = winnings;
			
			// Only animate if value changed or not already visible/scaled
			if (isAlreadyVisible && isAlreadyScaled) {
				if (valueChanged) {
					// Value changed - do a pulse animation (enlarge then revert); label and value scale independently
					if (this.scene) {
						this.scene.tweens.add({
							targets: this.youWonText,
							scaleX: HEADER_CONFIG.WIN_BAR_TEXT_SCALE * 1.2,
							scaleY: HEADER_CONFIG.WIN_BAR_TEXT_SCALE * 1.2,
							duration: 150,
							ease: 'Power2',
							yoyo: true,
							repeat: 0,
							onComplete: () => { this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE); }
						});
						this.scene.tweens.add({
							targets: this.amountText,
							scaleX: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE * 1.2,
							scaleY: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE * 1.2,
							duration: 150,
							ease: 'Power2',
							yoyo: true,
							repeat: 0,
							onComplete: () => { this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE); }
						});
					}
					console.log(`[BonusHeader] Winnings display updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
				} else {
					// Value hasn't changed - just ensure scale is correct without animation
					this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE);
					this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE);
					console.log(`[BonusHeader] Winnings display value unchanged, skipping animation: ${formattedWinnings} (raw: ${winnings})`);
				}
			} else {
				// Not visible or not scaled - do full scale-in animation
				// Set initial scale to 0 for scale-in effect
				this.youWonText.setScale(0);
				this.amountText.setScale(0);
				
				// Animate scale in with bounce effect (label and value scale independently)
				if (this.scene) {
					this.scene.tweens.add({
						targets: this.youWonText,
						scaleX: HEADER_CONFIG.WIN_BAR_TEXT_SCALE,
						scaleY: HEADER_CONFIG.WIN_BAR_TEXT_SCALE,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => { this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE); }
					});
					this.scene.tweens.add({
						targets: this.amountText,
						scaleX: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE,
						scaleY: HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => { this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE); }
					});
				}
				console.log(`[BonusHeader] Winnings display shown with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		} else {
			console.warn('[BonusHeader] Cannot show winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Format currency value for display
	 */
	private formatCurrency(amount: number): string {
		const isDemo = (this.scene as any)?.gameAPI?.getDemoState();
		
		// Format with commas for thousands and 2 decimal places
		const formatted = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
		
		if (isDemo) {
			return formatted;
		}
		
		// Get currency prefix with proper spacing
		const prefix = CurrencyManager.getCurrencyCode();
		const space = prefix && !prefix.endsWith(' ') ? ' ' : '';
		return `${prefix}${space}${formatted}`;
	}

	/**
	 * Get current winnings amount
	 */
	public getCurrentWinnings(): number {
		return this.currentWinnings;
	}

	/**
	 * Explicitly set the winnings label text (e.g. "TOTAL WIN" on unresolved resume).
	 */
	public setWinningsLabel(label: string): void {
		if (!this.youWonText) return;
		this.youWonText.setText(label);
	}

	/**
	 * Reset winnings display to zero
	 */
	public resetWinnings(): void {
		this.updateWinningsDisplay(0);
	}

	/**
	 * Initialize winnings display when bonus header starts
	 */
	public initializeWinnings(): void {
		console.log('[BonusHeader] Initializing winnings display - starting hidden');
		this.currentWinnings = 0;
		this.hideWinningsDisplay();
	}

	/**
	 * Hide winnings display at the start of a new spin (like regular header)
	 */
	public hideWinningsForNewSpin(): void {
		console.log('[BonusHeader] Hiding winnings display for new spin');
		this.hideWinningsDisplay();
	}

	/**
	 * Set up event listener for winnings updates from backend (like regular header)
	 */
	private setupWinningsEventListener(): void {
		const buildBonusWinStopSignature = (spinData: any): string => {
			try {
				const slot: any = spinData?.slot ?? {};
				const currentItem = this.getCurrentFreeSpinItem(spinData);
				const spinsLeft = Number((currentItem as any)?.spinsLeft ?? -1);
				const area = Array.isArray(slot?.area) ? JSON.stringify(slot.area) : '[]';
				const itemWin = Number((currentItem as any)?.totalWin ?? (currentItem as any)?.subTotalWin ?? 0);
				const slotTotal = Number(slot?.totalWin ?? 0);
				const tumblesLen = Array.isArray(slot?.tumbles) ? slot.tumbles.length : 0;
				const paylinesLen = Array.isArray(slot?.paylines) ? slot.paylines.length : 0;
				return `${spinsLeft}|${itemWin}|${slotTotal}|${tumblesLen}|${paylinesLen}|${area}`;
			} catch {
				return '';
			}
		};

		// Listen for tumble win progress (during bonus mode: per-spin cumulative)
		gameEventManager.on(GameEventType.TUMBLE_WIN_PROGRESS, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
				const spinData = symbolsComponent?.currentSpinData;
				const currentItem = this.getCurrentFreeSpinItem(spinData);
				const slotTotalWinRaw = Number(spinData?.slot?.totalWin ?? 0);
				const hasMaxWinCap =
					!!(currentItem as any)?.isMaxWin &&
					Number.isFinite(slotTotalWinRaw) &&
					slotTotalWinRaw > 0;
				const maxWinCapTotal = hasMaxWinCap ? slotTotalWinRaw : 0;

				// Initialize bonus tracking if needed
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}

				const tumbleWinRaw = Number((data as any)?.tumbleWin ?? 0);
				const cumulativeFromEvent = Number((data as any)?.cumulativeWin ?? 0);
				let effectiveTumbleWin = (Number.isFinite(tumbleWinRaw) && tumbleWinRaw > 0) ? tumbleWinRaw : 0;

				if (hasMaxWinCap) {
					const remainingToCap = Math.max(0, maxWinCapTotal - this.cumulativeBonusWin);
					if (remainingToCap <= 0) {
						if (this.youWonText) {
							this.youWonText.setText('TOTAL WIN');
						}
						this.showWinningsDisplay(maxWinCapTotal);
						try { symbolsComponent?.requestSkipTumbles?.(); } catch {}
						console.log('[BonusHeader] MaxWin cap already reached - skipping further tumble win updates', {
							cumulativeBonusWin: this.cumulativeBonusWin,
							maxWinCapTotal
						});
						return;
					}
					if (effectiveTumbleWin > remainingToCap) {
						console.log('[BonusHeader] Clamping tumble win to MaxWin cap remainder', {
							rawTumbleWin: effectiveTumbleWin,
							clampedTumbleWin: remainingToCap,
							cumulativeBonusWin: this.cumulativeBonusWin,
							maxWinCapTotal
						});
						effectiveTumbleWin = remainingToCap;
					}
				}

				const displayWin = (effectiveTumbleWin > 0)
					? effectiveTumbleWin
					: (Number.isFinite(cumulativeFromEvent) ? cumulativeFromEvent : 0);
				if (displayWin > 0 || (hasMaxWinCap && this.cumulativeBonusWin >= maxWinCapTotal)) {
					// As soon as tumble wins start, we are in the "YOU WON" phase for this spin.
					// Never show "TOTAL WIN" on tumble updates; that label is reserved for the
					// end-of-spin cumulative summary (handled on WIN_STOP).
					if (this.youWonText && displayWin > 0) {
						this.youWonText.setText('YOU WON');
					}
					// Clear any scatter seeding guard once real tumble wins begin
					if (this.justSeededWin) {
						this.justSeededWin = false;
					}
					if (displayWin > 0) {
						this.showWinningsDisplay(displayWin);
					}

					// Accumulate per-tumble win into cumulative total
					if (effectiveTumbleWin > 0) {
						if (this.skipNextSpinAccumulation) {
							this.accumulatedThisSpin = true;
							this.skipNextSpinAccumulation = false;
							console.log('[BonusHeader] TUMBLE_WIN_PROGRESS: skipping accumulation (first spin already seeded)');
						} else {
							this.cumulativeBonusWin += effectiveTumbleWin;
							this.accumulatedThisSpin = true;
						}
					} else if (cumulativeFromEvent > 0) {
						const delta = cumulativeFromEvent - this.lastTumbleCumulative;
						if (delta > 0) {
							let effectiveDelta = delta;
							if (hasMaxWinCap) {
								const remainingToCap = Math.max(0, maxWinCapTotal - this.cumulativeBonusWin);
								effectiveDelta = Math.min(effectiveDelta, remainingToCap);
							}
							if (this.skipNextSpinAccumulation) {
								this.accumulatedThisSpin = true;
								this.skipNextSpinAccumulation = false;
							} else {
								this.cumulativeBonusWin += effectiveDelta;
								this.accumulatedThisSpin = true;
							}
						}
						this.lastTumbleCumulative = cumulativeFromEvent;
					}
					if (hasMaxWinCap && this.cumulativeBonusWin > maxWinCapTotal) {
						this.cumulativeBonusWin = maxWinCapTotal;
					}

					// Note: TOTAL WIN is now shown only once per spin, in the WIN_STOP
					// handler, after all tumbles for that spin have completed. Here we
					// only show per-tumble "YOU WON" values.

					if (hasMaxWinCap && this.cumulativeBonusWin >= maxWinCapTotal) {
						try { symbolsComponent?.requestSkipTumbles?.(); } catch {}
					}
				}
			} catch {}
		});

		// Listen for tumble sequence completion (during bonus mode: accumulate spin total only)
		gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
				const spinData = symbolsComponent?.currentSpinData;
				
				// Prefer frontend-emitted tumble total so sticky bonus multipliers are reflected
				// immediately in UI accumulation. Fall back to freespin item totals.
				let spinWin = 0;
				try {
					const slotAny: any = spinData?.slot || {};
					const spinTumbleWin = Number((data as any)?.totalWin ?? 0);
					if (spinTumbleWin > 0) {
						// Add paylines separately if tumble payload excludes them.
						let spinPaylineWin = 0;
						if (slotAny?.paylines && Array.isArray(slotAny.paylines) && slotAny.paylines.length > 0) {
							spinPaylineWin = this.calculateTotalWinFromPaylines(slotAny.paylines);
						}
						spinWin = spinTumbleWin + spinPaylineWin;
						console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: using event total (tumbles=$${spinTumbleWin} + paylines=$${spinPaylineWin}) = $${spinWin}`);
					}

					// Fallback: freespin item backend total/subtotal
					if (spinWin === 0) {
						const currentItem = this.getCurrentFreeSpinItem(spinData);
						if (currentItem) {
							const rawItemTotal =
								(currentItem as any).totalWin ??
								(currentItem as any).subTotalWin ??
								0;
							const itemTotal = Number(rawItemTotal);
							if (!isNaN(itemTotal) && itemTotal > 0) {
								spinWin = itemTotal;
								console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: fallback freespin item totalWin=$${itemTotal}`);
							}
						}
					}
				} catch {}

				// Initialize bonus tracking if needed
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}

				// Accumulate the spin's total into the bonus cumulative.
				// The visible TOTAL WIN display is handled on WIN_STOP so that it only
				// appears after *all* win mechanics for the spin (tumbles + multipliers)
				// have finished, avoiding any label flicker during tumble updates.
				if (spinWin > 0) {
					if (this.accumulatedThisSpin) {
						console.log('[BonusHeader] TUMBLE_SEQUENCE_DONE: skipping accumulation (already added per tumble)');
						return;
					}
					if (this.skipNextSpinAccumulation) {
						this.accumulatedThisSpin = true;
						this.skipNextSpinAccumulation = false;
						console.log('[BonusHeader] TUMBLE_SEQUENCE_DONE: skipping accumulation (first spin already seeded)');
					} else {
						this.cumulativeBonusWin += spinWin;
						this.accumulatedThisSpin = true;
					}
					console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: added spinWin=$${spinWin}, cumulativeBonusWin=$${this.cumulativeBonusWin}`);
				}
			} catch {}
		});

		// Listen for spin events to hide winnings display at start of manual spin
		gameEventManager.on(GameEventType.SPIN, () => {
			if (gameStateManager.isBonus && this.cumulativeBonusWin > 0) {
				console.log('[BonusHeader] SPIN during bonus - keeping total win visible for cumulative tracking');
				return;
			}
			console.log('[BonusHeader] Manual spin started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// Listen for autoplay start to hide winnings display
		gameEventManager.on(GameEventType.AUTO_START, () => {
			if (gameStateManager.isBonus && this.cumulativeBonusWin > 0) {
				console.log('[BonusHeader] AUTO_START during bonus - keeping total win visible for cumulative tracking');
				return;
			}
			console.log('[BonusHeader] Auto play started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// After radial light transition (dialogAnimationsComplete), re-show cumulative total
		// so it stays visible when transitioning from Free Spin dialog to first bonus spin
		if (this.scene) {
			this.scene.events.on('dialogAnimationsComplete', () => {
				if (
					gameStateManager.isBonus &&
					this.justSeededWin &&
					!this.showingTotalWin &&
					this.cumulativeBonusWin > 0 &&
					this.bonusHeaderContainer?.visible
				) {
					this.showCumulativeTotalIfReady();
					console.log('[BonusHeader] dialogAnimationsComplete: re-showing cumulative total after radial light transition');
				}
			});
		}

		// Listen for reels start to reset per-spin bonus state
		gameEventManager.on(GameEventType.REELS_START, () => {
			console.log('[BonusHeader] Reels started');
			if (gameStateManager.isBonus) {
				// Reset per-spin accumulation flag
				this.accumulatedThisSpin = false;
				this.showingTotalWin = false;
				this.lastProcessedBonusWinStopSignature = null;
				this.lastTumbleCumulative = 0;
				try {
					this.tumbleTotalDisplayTimer?.destroy();
				} catch { }
				this.tumbleTotalDisplayTimer = null;
				// Initialize tracking on first spin in bonus mode
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}
				const totalWinSoFar = this.cumulativeBonusWin;
				console.log(`[BonusHeader] REELS_START (bonus): cumulative bonus win so far = $${totalWinSoFar}`);

				// Clear the justSeededWin flag when first spin starts (scatter activation complete)
				if (this.justSeededWin) {
					this.justSeededWin = false;
					console.log('[BonusHeader] Cleared justSeededWin flag - first bonus spin starting');
				}

				// At the start of each bonus spin, show the cumulative TOTAL WIN so far.
				// During the spin, per-tumble updates will switch the label to "YOU WON".
				if (totalWinSoFar > 0) {
					if (this.youWonText) {
						this.youWonText.setText('TOTAL WIN');
					}
					this.showWinningsDisplay(totalWinSoFar);
				} else {
					this.hideWinningsDisplay();
					if (this.youWonText) {
						this.youWonText.setText('YOU WON');
					}
				}
			} else {
				// Normal mode behavior: hide winnings at the start of the spin
				this.hasStartedBonusTracking = false;
				this.cumulativeBonusWin = 0;
				this.scatterBaseWin = 0;
				this.justSeededWin = false;
				this.hideWinningsDisplay();
			}
		});

		// Listen for reel done events to show winnings display (like regular header)
		gameEventManager.on(GameEventType.REELS_STOP, (data: any) => {
			console.log(`[BonusHeader] REELS_STOP received - checking for wins`);

			// In bonus mode, per-spin display is handled on WIN_STOP; skip here to avoid label mismatch
			if (gameStateManager.isBonus) {
				console.log('[BonusHeader] In bonus mode - skipping REELS_STOP winnings update (handled on WIN_STOP)');
				return;
			}
			
			// Get the current spin data from the Symbols component
			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			if (symbolsComponent && symbolsComponent.currentSpinData) {
				const spinData = symbolsComponent.currentSpinData;
				console.log(`[BonusHeader] Found current spin data:`, spinData);
				
				// Use the same logic as regular header - calculate from paylines
				if (spinData.slot && spinData.slot.paylines && spinData.slot.paylines.length > 0) {
					const totalWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
					console.log(`[BonusHeader] Total winnings calculated from paylines: ${totalWin}`);
					
					if (totalWin > 0) {
						this.showWinningsDisplay(totalWin);
					} else {
						this.hideWinningsDisplay();
					}
				} else {
					console.log('[BonusHeader] No paylines in current spin data - hiding winnings display');
					this.hideWinningsDisplay();
				}
			} else {
				console.log('[BonusHeader] No current spin data available - hiding winnings display');
				this.hideWinningsDisplay();
			}
		});

		// On WIN_START during bonus, only handle non-tumble wins.
		// For tumble-based wins, the winnings display is driven exclusively by
		// TUMBLE_WIN_PROGRESS so that "YOU WON" appears tied to each tumble.
		gameEventManager.on(GameEventType.WIN_START, () => {
			if (!gameStateManager.isBonus) {
				return;
			}
			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;

			// If this spin has tumbles, let TUMBLE_WIN_PROGRESS handle the "YOU WON"
			// label and values so the header updates are synchronized with tumbles.
			if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
				console.log('[BonusHeader] WIN_START (bonus): tumbles present - winnings display handled by TUMBLE_WIN_PROGRESS');
				return;
			}

			let spinWin = 0;
			
			// Check for paylines wins
			if (spinData?.slot?.paylines && spinData.slot.paylines.length > 0) {
				spinWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
			}
			
			// Also check for tumbles (cluster wins) - they might not have paylines
			if (spinWin === 0 && Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
				spinWin = this.calculateTotalWinFromTumbles(spinData.slot.tumbles);
			}
			
			// Always change to "YOU WIN" or "YOU WON" when wins start (unless in initial scatter phase)
			if (spinWin > 0) {
				if (!this.justSeededWin && this.youWonText) {
					this.youWonText.setText('YOU WIN');
				}
				this.showWinningsDisplay(spinWin);
			} else {
				// Don't hide if we're showing cumulative total - only hide if truly no wins
				// The TUMBLE_WIN_PROGRESS will handle showing wins during tumbles
			}
		});

		// On WIN_STOP during bonus, finalize cumulative tracking and show "TOTAL WIN" for this spin
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			if (!gameStateManager.isBonus) {
				return;
			}
			if (gameStateManager.isReelSpinning) {
				console.log('[BonusHeader] WIN_STOP (bonus): ignored while reels are spinning');
				return;
			}
			if (this.showingTotalWin) {
				console.log('[BonusHeader] WIN_STOP (bonus): duplicate TOTAL WIN update suppressed');
				return;
			}

			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;
			const winStopSignature = buildBonusWinStopSignature(spinData);
			if (
				winStopSignature &&
				this.lastProcessedBonusWinStopSignature &&
				winStopSignature === this.lastProcessedBonusWinStopSignature
			) {
				console.log('[BonusHeader] WIN_STOP (bonus): duplicate spin signature suppressed');
				return;
			}
			this.lastProcessedBonusWinStopSignature = winStopSignature || null;

			// Calculate the total win for this spin (includes paylines + tumbles)
			let spinWin = 0;
			try {
				const currentItem = this.getCurrentFreeSpinItem(spinData);
				if (currentItem) {
					// Use totalWin if available, otherwise use subTotalWin
					const rawWin = (currentItem as any).totalWin ?? (currentItem as any).subTotalWin;
					if (typeof rawWin === 'number' && rawWin > 0) {
						spinWin = rawWin;
						console.log(`[BonusHeader] WIN_STOP (bonus): using item win=$${spinWin} from freespin item`);
					}
				}
				// Fallback: if freespin item total not available, manually sum paylines + tumbles
				if (spinWin === 0) {
					// Include paylines (if any)
					if (spinData?.slot?.paylines && spinData.slot.paylines.length > 0) {
						spinWin += this.calculateTotalWinFromPaylines(spinData.slot.paylines);
					}
					// Include tumble wins (cluster wins) if present
					if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
						const tumbleWin = this.calculateTotalWinFromTumbles(spinData.slot.tumbles);
						spinWin += tumbleWin;
					}
					if (spinWin > 0) {
						console.log(`[BonusHeader] WIN_STOP (bonus): fallback calculation = $${spinWin}`);
					}
				}
			} catch {}

			// Initialize cumulative tracking if needed
			if (!this.hasStartedBonusTracking) {
				this.cumulativeBonusWin = this.scatterBaseWin || 0;
				this.hasStartedBonusTracking = true;
			}

			// If this spin's win has not yet been accumulated (no TUMBLE_SEQUENCE_DONE or it had 0),
			// add it now. Otherwise, keep the already-accumulated total.
			if (!this.accumulatedThisSpin) {
				if (this.skipNextSpinAccumulation) {
					this.accumulatedThisSpin = true;
					this.skipNextSpinAccumulation = false;
					console.log('[BonusHeader] WIN_STOP (bonus): skipping accumulation (first spin already seeded)');
				} else {
					this.cumulativeBonusWin += (spinWin || 0);
					this.accumulatedThisSpin = true;
				}
			}

			console.log(`[BonusHeader] WIN_STOP (bonus): finalized cumulativeBonusWin=$${this.cumulativeBonusWin} (spinWin=$${spinWin})`);

			// If this was the last free spin, align the cumulative total to backend totalWin
			try {
				let isFinalSpin = false;
				if (gameStateManager.isBonusFinished) {
					isFinalSpin = true;
				} else {
					const currentItem = this.getCurrentFreeSpinItem(spinData);
					if (typeof currentItem?.spinsLeft === 'number' && currentItem.spinsLeft <= 1) {
						isFinalSpin = true;
					}
					try {
						const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
						if (typeof rem === 'number' && rem <= 0) {
							isFinalSpin = true;
						}
					} catch { }
				}

				if (isFinalSpin) {
					const currentItem = this.getCurrentFreeSpinItem(spinData);
					const isMaxWinItem = !!(currentItem as any)?.isMaxWin;
					const isLastSpinItem =
						typeof (currentItem as any)?.spinsLeft === 'number' &&
						(currentItem as any).spinsLeft <= 1;
					// Retrigger guard: a spinsLeft=1 item may still continue when future items exist.
					let hasFutureRetriggerItems = false;
					try {
						const fs = spinData?.slot?.freespin || spinData?.slot?.freeSpin;
						const items = Array.isArray(fs?.items) ? fs.items : [];
						if (items.length > 1 && currentItem) {
							const currentAreaJson =
								Array.isArray((currentItem as any)?.area) ? JSON.stringify((currentItem as any).area) : null;
							const currentIdx =
								currentAreaJson == null
									? -1
									: items.findIndex((item: any) =>
										Array.isArray(item?.area) && JSON.stringify(item.area) === currentAreaJson
									);
							if (currentIdx >= 0) {
								hasFutureRetriggerItems = items
									.slice(currentIdx + 1)
									.some((item: any) => Number(item?.spinsLeft ?? 0) > 0);
							} else {
								const currentSpinsLeft = Number((currentItem as any)?.spinsLeft ?? 0);
								if (Number.isFinite(currentSpinsLeft)) {
									hasFutureRetriggerItems = items
										.some((item: any) => Number(item?.spinsLeft ?? 0) > currentSpinsLeft);
								}
							}
						}
					} catch { }
					const backendTotal = this.calculateBackendTotalWin(spinData);
					const shouldSnapToBackendTotal =
						isMaxWinItem || (isLastSpinItem && !hasFutureRetriggerItems);
					if (shouldSnapToBackendTotal && backendTotal > 0) {
						this.cumulativeBonusWin = backendTotal;
						this.hasStartedBonusTracking = true;
						console.log(
							`[BonusHeader] WIN_STOP (bonus): forcing cumulative total to slot.totalWin=$${backendTotal}` +
							` (isMaxWinItem=${isMaxWinItem}, isLastSpinItem=${isLastSpinItem}, hasFutureRetriggerItems=${hasFutureRetriggerItems})`
						);
					} else if (backendTotal > 0) {
						console.log(
							`[BonusHeader] WIN_STOP (bonus): non-MaxWin final spin - keeping frontend cumulative total=$${this.cumulativeBonusWin} ` +
							`(backend totalWin=$${backendTotal}, isLastSpinItem=${isLastSpinItem}, hasFutureRetriggerItems=${hasFutureRetriggerItems})`
						);
					}
				}
			} catch { }

			// Show "TOTAL WIN" with the cumulative total (all spins including scatter trigger)
			const showTotalWinForSpin = () => {
				console.log(`[BonusHeader] showTotalWinForSpin: spinWin=${spinWin}, cumulativeBonusWin=$${this.cumulativeBonusWin}`);
				this.showingTotalWin = true;

				this.scene?.time.delayedCall(0, () => {
					// Always show cumulative total (includes scatter trigger win + all bonus spins)
					if (this.cumulativeBonusWin > 0) {
						// Stop any existing tweens to prevent conflicts
						if (this.scene) {
							this.scene.tweens.killTweensOf(this.youWonText);
							this.scene.tweens.killTweensOf(this.amountText);
						}

						// Set text to TOTAL WIN
						if (this.youWonText) {
							this.youWonText.setText('TOTAL WIN');
							this.youWonText.setVisible(true);
							console.log('[BonusHeader] Set youWonText to "TOTAL WIN" and visible');
						}

						// Show the cumulative total (scatter + all spins so far)
						this.showWinningsDisplay(this.cumulativeBonusWin);
						console.log(`[BonusHeader] WIN_STOP (bonus): ✅ SHOWING "TOTAL WIN" with cumulative total=$${this.cumulativeBonusWin}`);
					} else {
						// No cumulative win yet – leave the existing display unchanged
						console.log('[BonusHeader] WIN_STOP (bonus): cumulativeBonusWin is 0, leaving existing winnings display unchanged');
					}

					// Always emit event to signal that spin display phase is complete
					// This allows FreeSpinController to proceed to next spin
					gameEventManager.emit(GameEventType.BONUS_TOTAL_WIN_SHOWN);
				});
			};

			showTotalWinForSpin();
		});
	}

	/**
	 * Update winnings display with subTotalWin from current spin data
	 * Hides display when no subTotalWin (similar to regular header behavior)
	 */
	public updateWinningsFromSpinData(spinData: any): void {
		if (!spinData) {
			console.warn('[BonusHeader] No spin data provided for winnings update');
			this.hideWinningsDisplay();
			return;
		}

		// Check if this is a free spin with subTotalWin (support freespin and freeSpin)
		const fs = spinData.slot?.freespin || spinData.slot?.freeSpin;
		if (fs?.items && fs.items.length > 0) {
			// Find the current free spin item (usually the first one with spinsLeft > 0)
			const currentFreeSpinItem = fs.items.find((item: any) => item.spinsLeft > 0);
			
			if (currentFreeSpinItem && currentFreeSpinItem.subTotalWin !== undefined) {
				const subTotalWin = currentFreeSpinItem.subTotalWin;
				console.log(`[BonusHeader] Found subTotalWin: $${subTotalWin}`);
				
				// Only show display if subTotalWin > 0, otherwise hide it
				if (subTotalWin > 0) {
					console.log(`[BonusHeader] Showing winnings display with subTotalWin: $${subTotalWin}`);
					this.updateWinningsDisplay(subTotalWin);
				} else {
					console.log(`[BonusHeader] subTotalWin is 0, hiding winnings display`);
					this.hideWinningsDisplay();
				}
				return;
			}
		}

		// Fallback: calculate from paylines if no subTotalWin available
		if (spinData.slot?.paylines && spinData.slot.paylines.length > 0) {
			const totalWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
			console.log(`[BonusHeader] Calculated from paylines: $${totalWin}`);
			
			// Only show display if totalWin > 0, otherwise hide it
			if (totalWin > 0) {
				console.log(`[BonusHeader] Showing winnings display with payline calculation: $${totalWin}`);
				this.updateWinningsDisplay(totalWin);
			} else {
				console.log(`[BonusHeader] No wins from paylines, hiding winnings display`);
				this.hideWinningsDisplay();
			}
		} else {
			console.log('[BonusHeader] No win data available in spin data, hiding display');
			this.hideWinningsDisplay();
		}
	}

	/**
	 * Calculate total win from paylines (fallback method)
	 */
	private calculateTotalWinFromPaylines(paylines: any[]): number {
		return getTotalWinFromPaylines(paylines);
	}

	/**
	 * Calculate total win amount from tumbles array
	 */
	private calculateTotalWinFromTumbles(tumbles: any[]): number {
		if (!Array.isArray(tumbles) || tumbles.length === 0) {
			return 0;
		}
		let totalWin = 0;
		for (const tumble of tumbles) {
			totalWin += getTumbleTotal(tumble);
		}
		return totalWin;
	}

	resize(scene: Scene): void {
		if (this.bonusHeaderContainer) {
			this.bonusHeaderContainer.setSize(scene.scale.width, scene.scale.height);
		}
		const centerX = scene.scale.width * 0.5;
		const centerXView = scene.cameras?.main ? scene.cameras.main.centerX : centerX;
		const frameScaleX = Math.max(0.01, HEADER_CONFIG.HEADER_CONTAINER_SCALE_X);
		const frameScaleY = Math.max(0.01, HEADER_CONFIG.HEADER_CONTAINER_SCALE_Y);
		const baseWidth = Math.max(1, getHeaderLayoutWidth(scene));
		const baseHeight = Math.max(1, getHeaderLayoutHeight(scene));
		const containerWidth = baseWidth * frameScaleX;
		const containerHeight = baseHeight * frameScaleY;
		const anchorX = centerXView + HEADER_CONFIG.HEADER_OFFSET_X;
		const anchorY = HEADER_CONFIG.HEADER_OFFSET_Y + HEADER_CONFIG.HEADER_CONTAINER_OFFSET_Y;

		if (this.headerLogoImage) {
			const logoY = anchorY + HEADER_CONFIG.HEADER_LOGO_OFFSET_Y;
			this.headerLogoImage.setPosition(anchorX, logoY);
			const widthFitScale = scene.scale.width / this.headerLogoImage.width;
			this.headerLogoImage.setScale(widthFitScale * HEADER_CONFIG.HEADER_LOGO_SCALE);
		}
		if (this.headerBorderImage) {
			const borderY = anchorY + HEADER_CONFIG.HEADER_BORDER_OFFSET_Y;
			this.headerBorderImage.setPosition(anchorX, borderY);
			const widthFitScale = scene.scale.width / this.headerBorderImage.width;
			this.headerBorderImage.setScale(widthFitScale * HEADER_CONFIG.HEADER_BORDER_SCALE);
		}
		if (this.headerWinBarImage) {
			const winBarY = anchorY + containerHeight + HEADER_CONFIG.WIN_BAR_OFFSET_Y;
			this.headerWinBarImage.setPosition(centerX, winBarY);
			this.headerWinBarImage.setScale((scene.scale.width / this.headerWinBarImage.width) * HEADER_CONFIG.WIN_BAR_SCALE);
		}
		this.updateHeaderDebugBorder();
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bonusHeaderContainer;
	}

	/** Set visibility of the whole bonus header (container). */
	setVisible(visible: boolean): void {
		this.bonusHeaderContainer.setVisible(visible);
		this.updateHeaderDebugBorder();
	}

	destroy(): void {
		if (this.debugHeaderFrameBorder) {
			this.debugHeaderFrameBorder.destroy();
			this.debugHeaderFrameBorder = undefined;
		}
		if (this.debugHeaderBorder) {
			this.debugHeaderBorder.destroy();
			this.debugHeaderBorder = undefined;
		}
		if (this.bonusHeaderContainer) {
			this.bonusHeaderContainer.destroy();
		}
	}
}

