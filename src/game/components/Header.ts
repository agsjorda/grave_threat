import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { gameStateManager } from '../../managers/GameStateManager';
import { PaylineData } from '../../backend/SpinData';
import { CurrencyManager } from './CurrencyManager';
import { HEADER_CONFIG, SHOW_HEADER_BORDER, SHOW_HEADER_SCENEFRAME_BORDER } from '../../config/GameConfig';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { startAnimation, stopAnimation } from '../../utils/SpineAnimationHelper';
import { getTotalWinFromPaylines } from './Spin';


export class Header {
	private headerContainer: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private amountText: Phaser.GameObjects.Text;
	private youWonText: Phaser.GameObjects.Text;
	private headerSceneContainer?: Phaser.GameObjects.Container;
	private headerSceneImage?: Phaser.GameObjects.Image;
	private headerSceneFrameImage?: Phaser.GameObjects.Image;
	private headerWinBarImage?: Phaser.GameObjects.Image;
	private headerSceneContentMaskGraphics?: Phaser.GameObjects.Graphics;
	private headerSceneContentMask?: Phaser.Display.Masks.GeometryMask;
	private debugHeaderFrameBorder?: Phaser.GameObjects.Graphics;
	private debugHeaderBorder?: Phaser.GameObjects.Graphics;
	private currentWinnings: number = 0;
	private pendingWinnings: number = 0;
	private scene: Scene | null = null;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
		console.log(`[Header] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[Header] Creating header elements");
		
		// Store scene reference for animations
		this.scene = scene;
		
		// Create main container for all header elements
		this.headerContainer = scene.add.container(0, 0).setDepth(9500); // Above controller (900) and background (850)
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[Header] Creating header with scale: ${assetScale}x`);

		// Add header elements
		this.createHeaderElements(scene, assetScale);
		scene.events.on('update', (_time: number, _delta: number) => {
			this.updateHeaderSceneContainerDebugBorder(scene);
			this.updateHeaderDebugBorder();
		});
		
		// Set up event listeners for winnings updates
		this.setupWinningsEventListener();
		
		// Set up listener to hide winnings display when bonus mode starts
		this.setupBonusModeListener(scene);
	}

	private createHeaderElements(scene: Scene, assetScale: number): void {
		const centerX = scene.scale.width * 0.5;
		const centerXView = scene.cameras?.main ? scene.cameras.main.centerX : centerX;
		const frameBaseWidth = this.getHeaderImageDisplayWidth(scene, 'Header_SceneFrame');
		const frameBaseHeight = this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame');
		if (!this.headerSceneContainer) {
			this.headerSceneContainer = scene.add.container(0, 0);
			this.headerContainer.add(this.headerSceneContainer);
		}
		const headerSceneContainer = this.headerSceneContainer as Phaser.GameObjects.Container;

		// Header_Scene: background in local container space.
		if (scene.textures.exists('Header_Scene')) {
			const sceneY = HEADER_CONFIG.HEADER_SCENE_OFFSET_Y;
			this.headerSceneImage = scene.add.image(0, sceneY, 'Header_Scene').setOrigin(0.5, 0);
			this.headerSceneImage.setDisplaySize(
				Math.max(1, frameBaseWidth) * HEADER_CONFIG.HEADER_SCENE_SCALE_X,
				Math.max(1, frameBaseHeight) * HEADER_CONFIG.HEADER_SCENE_SCALE_Y
			);
			this.headerSceneImage.setDepth(0);
			headerSceneContainer.add(this.headerSceneImage);
		}

		// Header_SceneFrame: on top (foreground), in local container space.
		if (scene.textures.exists('Header_SceneFrame')) {
			this.headerSceneFrameImage = scene.add.image(0, 0, 'Header_SceneFrame');
			this.headerSceneFrameImage.setOrigin(0.5, 0);
			this.headerSceneFrameImage.setDepth(9501);
			headerSceneContainer.add(this.headerSceneFrameImage);
		}

		// Header_WinBar: below the frame (same formula as BonusHeader for identical layout)
		if (scene.textures.exists('Header_WinBar')) {
			const frameTopY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_CONTAINER_OFFSET_Y;
			const baseHeight = Math.max(1, this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame'));
			const frameScaleY = Math.max(0.01, HEADER_CONFIG.HEADER_SCENE_CONTAINER_SCALE_Y);
			const containerHeight = baseHeight * frameScaleY;
			const winBarY = frameTopY + containerHeight + HEADER_CONFIG.WIN_BAR_OFFSET_Y;
			this.headerWinBarImage = this.createScaledHeaderImage(scene, 'Header_WinBar', centerX, winBarY);
			this.headerWinBarImage.setScale((scene.scale.width / this.headerWinBarImage.width) * HEADER_CONFIG.WIN_BAR_SCALE);
			this.headerContainer.add(this.headerWinBarImage);
		}
		if (this.headerSceneContainer) {
			this.headerContainer.bringToTop(this.headerSceneContainer);
		}

		// Add winnings text centered on the win bar
		const winBarTextY = scene.scale.height * 0.15 + HEADER_CONFIG.WIN_BAR_TEXT_OFFSET_Y;
		this.createWinBarText(scene, scene.scale.width * 0.5, winBarTextY);
		this.updateHeaderSceneContainerLayout(scene, centerXView);
		this.updateHeaderDebugBorder();
	}

	private createScaledHeaderImage(scene: Scene, key: string, x: number, y: number): Phaser.GameObjects.Image {
		const img = scene.add.image(x, y, key).setOrigin(0.5, 0);
		const scale = scene.scale.width / img.width;
		img.setScale(scale);
		return img;
	}

	private getHeaderSceneFrameBaseSize(scene: Scene): { width: number; height: number } {
		if (!scene.textures.exists('Header_SceneFrame')) {
			return { width: 0, height: 0 };
		}
		const source = scene.textures.get('Header_SceneFrame').getSourceImage() as { width?: number; height?: number };
		const sourceWidth = Number(source?.width ?? 0);
		const sourceHeight = Number(source?.height ?? 0);
		if (sourceWidth <= 0 || sourceHeight <= 0) {
			return { width: 0, height: 0 };
		}
		return {
			width: sourceWidth,
			height: sourceHeight
		};
	}

	private getHeaderSceneFrameWorldHeight(scene: Scene, centerXView?: number): number {
		const rect = this.getHeaderSceneFrameRect(scene, centerXView);
		if (rect && Number.isFinite(rect.height) && rect.height > 0) {
			return rect.height;
		}
		return this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame');
	}

	private getHeaderImageDisplayHeight(scene: Scene, key: string): number {
		if (key === 'Header_SceneFrame') {
			const base = this.getHeaderSceneFrameBaseSize(scene);
			if (base.width <= 0 || base.height <= 0) return 0;
			// Preserve aspect ratio; width is already screen-fitted in getHeaderImageDisplayWidth
			const displayWidth = scene.scale.width * HEADER_CONFIG.SCENE_FRAME_SCALE;
			return Math.max(1, base.height * (displayWidth / base.width));
		}
		if (!scene.textures.exists(key)) return 0;
		const texture = scene.textures.get(key).getSourceImage();
		const scale = scene.scale.width / texture.width;
		const scaleMultiplier = 1;
		return texture.height * scale * scaleMultiplier;
	}

	// private createCharacterSpineAnimation(scene: Scene, assetScale: number): void {}

	private createWinBarText(scene: Scene, x: number, y: number): void {
		// Line 1: "YOU WON"
		this.youWonText = scene.add.text(x, y - 7, 'YOU WON', {
			fontSize: '18px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(9501).setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE); // Above header container (9500)
		// Don't add to container - add directly to scene so depth works correctly
		// Start hidden by default; will be shown only when there is an actual win.
		this.youWonText.setVisible(false);

		// Line 2: amount value
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemoInitial = (this.scene as any)?.gameAPI?.getDemoState();
		const currencyPrefixInitial = isDemoInitial ? '' : CurrencyManager.getInlinePrefix();
		this.amountText = scene.add.text(x, y + 18, `${currencyPrefixInitial}0.00`, {
			fontSize: '24px',
			color: '#00ff00',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(9501).setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE); // Above header container (9500)
		// Don't add to container - add directly to scene so depth works correctly
		// Start hidden by default; will be shown only when there is an actual win.
		this.amountText.setVisible(false);
	}

	private updateHeaderSceneContainerLayout(scene: Scene, centerXView?: number): void {
		const viewCenter = centerXView ?? (scene.cameras?.main ? scene.cameras.main.centerX : scene.scale.width * 0.5);
		if (this.headerSceneContainer) {
			const frameScaleX = Math.max(0.01, HEADER_CONFIG.HEADER_SCENE_CONTAINER_SCALE_X);
			const frameScaleY = Math.max(0.01, HEADER_CONFIG.HEADER_SCENE_CONTAINER_SCALE_Y);
			const baseWidth = Math.max(
				1,
				this.getHeaderImageDisplayWidth(scene, 'Header_SceneFrame')
			);
			const baseHeight = Math.max(
				1,
				this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame')
			);
			// Apply container scale so HEADER_SCENE_CONTAINER_SCALE_X/Y actually size the container and frame
			const containerWidth = baseWidth * frameScaleX;
			const containerHeight = baseHeight * frameScaleY;
			const anchorX = viewCenter + HEADER_CONFIG.SCENE_FRAME_OFFSET_X;
			const anchorY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_CONTAINER_OFFSET_Y;
			this.headerSceneContainer.setScale(1, 1);
			this.headerSceneContainer.setPosition(anchorX, anchorY);
			this.headerSceneContainer.setSize(containerWidth, containerHeight);
			this.fitHeaderSceneToContainer(scene, containerWidth, containerHeight);
		}
		const rect = this.getHeaderSceneFrameRect(scene, centerXView);
		this.updateHeaderSceneContentMask(scene, rect);
		this.updateHeaderSceneContainerDebugBorder(scene, rect);
	}

	private fitHeaderSceneToContainer(scene: Scene, containerWidth: number, containerHeight: number): void {
		const w = Math.max(1, containerWidth);
		const h = Math.max(1, containerHeight);
		if (this.headerSceneFrameImage) {
			this.headerSceneFrameImage.setOrigin(0.5, 0);
			this.headerSceneFrameImage.setPosition(0, 0);
			this.headerSceneFrameImage.setDisplaySize(w, h);
		}
		if (this.headerSceneImage) {
			this.headerSceneImage.setOrigin(0.5, 0);
			this.headerSceneImage.setPosition(0, HEADER_CONFIG.HEADER_SCENE_OFFSET_Y);
			// Header_Scene (background): size within container, optional HEADER_SCENE_SCALE_X/Y
			const contentWidth = w * HEADER_CONFIG.HEADER_SCENE_SCALE_X;
			const contentHeight = h * HEADER_CONFIG.HEADER_SCENE_SCALE_Y;
			this.headerSceneImage.setDisplaySize(Math.max(1, contentWidth), Math.max(1, contentHeight));
		}
	}

	private updateHeaderSceneContentMask(scene: Scene, rect: Phaser.Geom.Rectangle | null): void {
		if (!rect) {
			try { this.headerSceneImage?.clearMask?.(false); } catch {}
			try { this.conveyorTopSpine?.clearMask?.(false); } catch {}
			return;
		}

		if (!this.headerSceneContentMaskGraphics || !this.headerSceneContentMask) {
			this.headerSceneContentMaskGraphics = scene.add.graphics();
			this.headerSceneContentMaskGraphics.setVisible(false);
			this.headerSceneContentMask = this.headerSceneContentMaskGraphics.createGeometryMask();
		}

		this.headerSceneContentMaskGraphics.clear();
		this.headerSceneContentMaskGraphics.fillStyle(0xffffff, 1);
		this.headerSceneContentMaskGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);

		try { this.headerSceneImage?.setMask?.(this.headerSceneContentMask); } catch {}
		try { this.conveyorTopSpine?.setMask?.(this.headerSceneContentMask); } catch {}
	}

	private updateHeaderSceneContainerDebugBorder(scene: Scene, rect?: Phaser.Geom.Rectangle | null): void {
		const hideFrameBorder = () => {
			this.debugHeaderFrameBorder?.clear();
			this.debugHeaderFrameBorder?.setVisible(false);
		};
		const bounds = rect ?? this.getHeaderSceneFrameRect(scene);
		if (!bounds || !this.headerContainer) {
			hideFrameBorder();
			return;
		}
		const visible = this.headerContainer.visible;

		if (SHOW_HEADER_SCENEFRAME_BORDER) {
			if (!this.debugHeaderFrameBorder) {
				this.debugHeaderFrameBorder = scene.add.graphics().setDepth(9603);
			}
			this.debugHeaderFrameBorder.clear();
			this.debugHeaderFrameBorder.lineStyle(2, 0x00ff00, 1);
			this.debugHeaderFrameBorder.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
			this.debugHeaderFrameBorder.setVisible(visible);
		} else {
			hideFrameBorder();
		}
	}

	private getHeaderSceneFrameRect(scene: Scene, centerXView?: number): Phaser.Geom.Rectangle | null {
		if (this.headerSceneFrameImage) {
			try {
				const b = this.headerSceneFrameImage.getBounds();
				const width = Math.max(1, Number(b?.width ?? 0));
				const height = Math.max(1, Number(b?.height ?? 0));
				const x = Number(b?.x ?? 0);
				const y = Number(b?.y ?? 0);
				if (Number.isFinite(x) && Number.isFinite(y)) {
					return new Phaser.Geom.Rectangle(x, y, width, height);
				}
			} catch {}
		}

		const baseWidth = this.getHeaderImageDisplayWidth(scene, 'Header_SceneFrame');
		const baseHeight = this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame');
		if (baseWidth <= 0 || baseHeight <= 0) {
			return null;
		}

		const viewCenter = centerXView ?? (scene.cameras?.main ? scene.cameras.main.centerX : scene.scale.width * 0.5);
		const width = baseWidth;
		const height = baseHeight;
		const left = viewCenter + HEADER_CONFIG.SCENE_FRAME_OFFSET_X - width * 0.5;
		const top = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_CONTAINER_OFFSET_Y;
		return new Phaser.Geom.Rectangle(left, top, width, height);
	}

	private getHeaderImageDisplayWidth(scene: Scene, key: string): number {
		if (key === 'Header_SceneFrame') {
			// Width-fit to screen so container and frame stay within game scene
			return Math.max(1, scene.scale.width * HEADER_CONFIG.SCENE_FRAME_SCALE);
		}
		if (!scene.textures.exists(key)) return 0;
		const texture = scene.textures.get(key).getSourceImage();
		const scale = scene.scale.width / texture.width;
		const scaleMultiplier = 1;
		return texture.width * scale * scaleMultiplier;
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
			this.debugHeaderBorder = this.scene.add.graphics().setDepth(9603);
		}

		this.debugHeaderBorder.clear();
		this.debugHeaderBorder.lineStyle(2, 0xff0000, 1);
		this.debugHeaderBorder.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
		const isHeaderVisible = Boolean(this.headerContainer?.visible && (this.headerSceneFrameImage?.visible ?? true));
		this.debugHeaderBorder.setVisible(isHeaderVisible);
	}

	private getHeaderDebugBounds(): Phaser.Geom.Rectangle | null {
		const candidates: any[] = [
			this.headerSceneImage,
			this.headerSceneFrameImage,
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

	resize(scene: Scene): void {
		if (this.headerContainer) {
			this.headerContainer.setSize(scene.scale.width, scene.scale.height);
		}
		const centerX = scene.scale.width * 0.5;
		const centerXView = scene.cameras?.main ? scene.cameras.main.centerX : centerX;
		// Recompute layout from current scale (needed when scale mode changes size, e.g. RESIZE or orientation)
		this.updateHeaderSceneContainerLayout(scene, centerXView);
		// Conveyor spine scale is set only at create; update it on resize to match frame width
		if (this.conveyorTopSpine) {
			const frameBaseWidth = this.getHeaderImageDisplayWidth(scene, 'Header_SceneFrame');
			const spineRefWidth = 580;
			const scale = ((frameBaseWidth > 0 ? frameBaseWidth : scene.scale.width) / spineRefWidth) * HEADER_CONFIG.CONVEYOR_TOP_SCALE;
			this.conveyorTopSpine.setScale(scale);
		}
	
		if (this.headerWinBarImage && scene.textures.exists('Header_SceneFrame')) {
			const frameTopY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_CONTAINER_OFFSET_Y;
			const baseHeight = Math.max(1, this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame'));
			const frameScaleY = Math.max(0.01, HEADER_CONFIG.HEADER_SCENE_CONTAINER_SCALE_Y);
			const containerHeight = baseHeight * frameScaleY;
			const winBarY = frameTopY + containerHeight + HEADER_CONFIG.WIN_BAR_OFFSET_Y;
			this.headerWinBarImage.setPosition(centerX, winBarY);
			this.headerWinBarImage.setScale((scene.scale.width / this.headerWinBarImage.width) * HEADER_CONFIG.WIN_BAR_SCALE);
		}
		this.updateHeaderDebugBorder();
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.headerContainer;
	}

	/** Set visibility of the whole header (container + scene frame when not in container). */
	setVisible(visible: boolean): void {
		this.headerContainer.setVisible(visible);
		if (this.headerSceneFrameImage) {
			this.headerSceneFrameImage.setVisible(visible);
		}
		if (this.scene) {
			this.updateHeaderSceneContainerDebugBorder(this.scene);
		}
		this.updateHeaderDebugBorder();
	}

	/**
	 * Set up event listener for winnings updates from backend
	 */
	private setupWinningsEventListener(): void {
		

		// Note: SPIN_RESPONSE event listener removed - now using SPIN_DATA_RESPONSE

		// Listen for tumble win progress (running total during tumbles)
		gameEventManager.on(GameEventType.TUMBLE_WIN_PROGRESS, (data: any) => {
			try {
				// Don't show winnings in header if in bonus mode (bonus header handles it)
				if (gameStateManager.isBonus) {
					return;
				}
				const amount = Number((data as any)?.cumulativeWin ?? 0);
				if (amount > 0) {
					// Ensure label shows YOU WON while accumulating
					if (this.youWonText) this.youWonText.setText('YOU WON');
					this.showWinningsDisplay(amount);
				}
			} catch {}
		});

		// Listen for tumble sequence completion to display TOTAL WIN
		gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, (data: any) => {
			try {
				// Don't show winnings in header if in bonus mode (bonus header handles it)
				if (gameStateManager.isBonus) {
					this.hideWinningsDisplay();
					return;
				}
				const amount = Number((data as any)?.totalWin ?? 0);
				if (amount > 0) {
					if (this.youWonText) this.youWonText.setText('TOTAL WIN');
					// Force an animation even if the numeric value hasn't changed from the
					// last tumble update, so the transition to "TOTAL WIN" feels responsive.
					// By resetting currentWinnings, showWinningsDisplay will detect a change
					// and play the pulse or scale-in animation as appropriate.
					this.currentWinnings = 0;
					this.showWinningsDisplay(amount);
				} else {
					// Zero win - hide if not in scatter
					if (!gameStateManager.isScatter) {
						this.hideWinningsDisplay();
					}
				}
			} catch {}
		});

		// Listen for spin events to hide winnings display at start of manual spin
		gameEventManager.on(GameEventType.SPIN, () => {
			console.log('[Header] Manual spin started - showing winnings display');
			
			// CRITICAL: Block autoplay spin actions if win dialog is showing, but allow manual spins
			// This fixes the timing issue where manual spin winnings display was blocked
			if (gameStateManager.isShowingWinDialog && gameStateManager.isAutoPlaying) {
				console.log('[Header] Autoplay SPIN event BLOCKED - win dialog is showing');
				console.log('[Header] Manual spins are still allowed to proceed');
				return;
			}
			
			// Keep winnings visible during scatter/bonus transitions
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				console.log('[Header] Skipping hide on SPIN (scatter/bonus active)');
			} else {
				// Show the winnings display with the stored winnings
				this.hideWinningsDisplay();
			}
			this.pendingWinnings = this.currentWinnings;
		});

		// Listen for autoplay start to hide winnings display
		gameEventManager.on(GameEventType.AUTO_START, () => {
			console.log('[Header] Auto play started - showing winnings display');
			// Keep winnings visible during scatter/bonus transitions (e.g., free spin autoplay)
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				console.log('[Header] Skipping hide on AUTO_START (scatter/bonus active)');
				return;
			}
			this.hideWinningsDisplay();
		});

		// Listen for reels start to hide winnings display and play conveyor top
		gameEventManager.on(GameEventType.REELS_START, () => {
			console.log('[Header] Reels started - hiding winnings display');
			// Keep winnings visible during scatter transition and bonus start
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				console.log('[Header] Skipping hide on REELS_START (scatter/bonus active)');
			} else {
				this.hideWinningsDisplay();
			}
			this.playConveyorTopAnimation();
		});

		// Follow reel conveyor behavior during tumbles
		gameEventManager.on(GameEventType.TUMBLE_COLUMNS_START, () => {
			this.playConveyorTopAnimation();
		});
		gameEventManager.on(GameEventType.TUMBLE_COLUMNS_DONE, () => {
			this.stopConveyorTopAnimation();
		});

		// Listen for reel done events to show winnings display
		gameEventManager.on(GameEventType.REELS_STOP, (data: any) => {
			console.log(`[Header] REELS_STOP received - checking for wins`);
			this.stopConveyorTopAnimation();
			
			// Don't show winnings in header if in bonus mode (bonus header handles it)
			if (gameStateManager.isBonus) {
				console.log('[Header] Skipping REELS_STOP winnings update - bonus mode active');
				this.hideWinningsDisplay();
				return;
			}
			
			// Get the current spin data from the Symbols component
			const symbolsComponent = (this.headerContainer.scene as any).symbols;
			if (symbolsComponent && symbolsComponent.currentSpinData) {
				const spinData = symbolsComponent.currentSpinData;
				console.log(`[Header] Found current spin data:`, spinData);
				
				// If this spin uses tumbles, let tumble events drive the display
				if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
					console.log('[Header] Tumbles present - winnings display handled by tumble events');
					return;
				}

				if (spinData.slot && spinData.slot.paylines && spinData.slot.paylines.length > 0) {
					const totalWin = this.calculateTotalWinningsFromPaylines(spinData.slot.paylines);
					console.log(`[Header] Total winnings calculated from paylines: ${totalWin}`);
					
					if (totalWin > 0) {
						if (this.youWonText) this.youWonText.setText('YOU WON');
						this.showWinningsDisplay(totalWin);
					} else {
						// If scatter is active, keep the winnings shown (it may have been set by scatter logic)
						if (gameStateManager.isScatter) {
							console.log('[Header] Skipping hide on REELS_STOP no-paylines (scatter active)');
						} else {
							this.hideWinningsDisplay();
						}
					}
				} else {
					console.log('[Header] No paylines in current spin data - hiding winnings display');
					// If scatter is active, keep the winnings shown (it may have been set by scatter logic)
					if (gameStateManager.isScatter) {
						console.log('[Header] Skipping hide on REELS_STOP (no paylines) due to scatter');
					} else {
						this.hideWinningsDisplay();
					}
				}
			} else {
				console.log('[Header] No current spin data available - hiding winnings display');
				// If scatter is active, keep the winnings shown
				if (gameStateManager.isScatter) {
					console.log('[Header] Skipping hide on REELS_STOP (no spin data) due to scatter');
				} else {
					this.hideWinningsDisplay();
				}
			}
		});
	}

	/**
	 * Update the winnings display in the header
	 */
	public updateWinningsDisplay(winnings: number): void {
		// Don't update winnings display if in bonus mode (bonus header handles it)
		if (gameStateManager.isBonus) {
			console.log('[Header] Skipping updateWinningsDisplay - bonus mode active (bonus header handles winnings)');
			return;
		}
		
		if (this.amountText) {
			this.currentWinnings = winnings;
			const formattedWinnings = this.formatCurrency(winnings);
			this.amountText.setText(formattedWinnings);
			console.log(`[Header] Winnings updated to: ${formattedWinnings} (raw: ${winnings})`);
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
			
			console.log('[Header] Winnings display hidden with shrink animation');
		} else {
			console.warn('[Header] Cannot hide winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Show the winnings display with both "YOU WON" text and amount with scale in animation
	 */
	public showWinningsDisplay(winnings: number): void {
		// Don't show winnings display if in bonus mode (bonus header handles it)
		if (gameStateManager.isBonus) {
			console.log('[Header] Skipping showWinningsDisplay - bonus mode active (bonus header handles winnings)');
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
			const currentScale = this.youWonText.scaleX;
			const isAlreadyScaled = currentScale > 0.9;
			
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
					console.log(`[Header] Winnings display updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
				} else {
					// Value hasn't changed - just ensure scale is correct without animation
					this.youWonText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_SCALE);
					this.amountText.setScale(HEADER_CONFIG.WIN_BAR_TEXT_VALUE_SCALE);
					console.log(`[Header] Winnings display value unchanged, skipping animation: ${formattedWinnings} (raw: ${winnings})`);
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
				console.log(`[Header] Winnings display shown with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		} else {
			console.warn('[Header] Cannot show winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}



	/**
	 * Calculate total winnings from paylines array
	 */
	private calculateTotalWinningsFromPaylines(paylines: PaylineData[]): number {
		if (!paylines || paylines.length === 0) {
			return 0;
		}

		const totalWin = getTotalWinFromPaylines(paylines);
		
		console.log(`[Header] Calculated total winnings: ${totalWin} from ${paylines.length} paylines`);
		return totalWin;
	}

	/**
	 * Format currency value for display
	 */
	private formatCurrency(amount: number): string {
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemo = (this.scene as any)?.gameAPI?.getDemoState();
		const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
		const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `${currencyPrefix}${formatted}`;
	}

	/**
	 * Get current winnings amount
	 */
	public getCurrentWinnings(): number {
		return this.currentWinnings;
	}

	/**
	 * Reset winnings display to zero
	 */
	public resetWinnings(): void {
		this.updateWinningsDisplay(0);
	}

	/**
	 * Debug method to check the current state of text objects
	 */
	public debugTextObjects(): void {
		console.log('[Header] Debug - Text objects state:', {
			amountText: {
				exists: !!this.amountText,
				visible: this.amountText?.visible,
				text: this.amountText?.text,
				alpha: this.amountText?.alpha
			},
			youWonText: {
				exists: !!this.youWonText,
				visible: this.youWonText?.visible,
				text: this.youWonText?.text,
				alpha: this.youWonText?.alpha
			},
			currentWinnings: this.currentWinnings
		});
	}

	/**
	 * Initialize winnings display when game starts
	 */
	public initializeWinnings(): void {
		console.log('[Header] Initializing winnings display');
		this.currentWinnings = 0;
		
		// Debug the text objects to make sure they exist
		this.debugTextObjects();
		
		// Hide winnings display at game start
		this.hideWinningsDisplay();
	}

	/**
	 * Setup listener for bonus mode changes to hide winnings display
	 */
	private setupBonusModeListener(scene: Scene): void {
		// Listen for bonus mode events
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			if (isBonus) {
				// Hide winnings display when bonus mode starts (bonus header will show its own)
				// Force hide immediately and ensure it stays hidden
				this.hideWinningsDisplay();
				// Also check gameStateManager to ensure it's hidden
				if (gameStateManager.isBonus) {
					// Double-check: if still visible after hide, force hide again
					if (this.amountText && this.youWonText && 
					    (this.amountText.visible || this.youWonText.visible)) {
						this.amountText.setVisible(false);
						this.youWonText.setVisible(false);
						console.log('[Header] Force-hiding winnings display - bonus mode active');
					}
				}
				console.log('[Header] Winnings display hidden - bonus mode started');
			} else {
				
				console.log('[Header] Bonus mode ended - winnings display can be shown again');
			}
		});

		// Also listen for showBonusHeader event to hide winnings display
		scene.events.on('showBonusHeader', () => {
			this.hideWinningsDisplay();
			// Force hide to ensure it's hidden
			if (this.amountText && this.youWonText) {
				this.amountText.setVisible(false);
				this.youWonText.setVisible(false);
			}
			console.log('[Header] Winnings display hidden - bonus header shown');
		});
	}

	public destroy(): void {
	}
}
