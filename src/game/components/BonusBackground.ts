import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameStateManager } from "../../managers/GameStateManager";
import { gameEventManager, GameEventType } from "../../event/EventManager";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import {
	GRID_CENTER_Y_RATIO,
	GRID_CENTER_Y_OFFSET_PX,
	TIMING_CONFIG,
} from "../../config/GameConfig";
import { startAnimation, stopAnimation } from "../../utils/SpineAnimationHelper";

export class BonusBackground {
	private bonusContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private bonusBg: any = null; // Spine animation object
	private bonusBgCover: Phaser.GameObjects.Image | null = null;
	private scene: Scene | null = null;

	// Same layout as normal Background for ControllerNormal_PC (normal-bg-cover)
	private coverHeightPercentOfScene: number = 0.5;
	private coverBottomOffsetPx: number = 0;
	// Same layout as normal: background centered (no offset)
	private bonusBackgroundYOffset: number = 0;
	
	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are loaded centrally through AssetConfig in Preloader
		console.log(`[BonusBackground] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[BonusBackground] Creating bonus background elements");
		
		// Store scene reference
		this.scene = scene;
		
		// Create main container for all bonus background elements
	// Set depth to -1 so it's behind symbols (0-600) and all other game elements
	this.bonusContainer = scene.add.container(0, 0);
	this.bonusContainer.setDepth(-1);
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[BonusBackground] Creating bonus background with scale: ${assetScale}x`);

		// Add bonus background elements
		this.createBonusElements(scene, assetScale);
		this.layout(scene);
		
		// Setup bonus mode listener to toggle cover visibility
		this.setupBonusModeListener(scene);
	}

	private createBonusElements(scene: Scene, assetScale: number): void {
		const screenConfig = this.screenModeManager.getScreenConfig();
		
		if (screenConfig.isPortrait) {
			this.createPortraitBonusBackground(scene, assetScale);
		} else {
			this.createLandscapeBonusBackground(scene, assetScale);
		}

	}

	private createPortraitBonusBackground(scene: Scene, assetScale: number): void {
		console.log("[BonusBackground] Creating portrait bonus background layout (same as normal)");

		// Static bonus background (same as normal: BG-Default / NormalGame.webp)
		if (scene.textures.exists('BG-Default')) {
			this.bonusBg = scene.add.image(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				'BG-Default'
			).setOrigin(0.5, 0.5).setDepth(0);
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			this.bonusBg.setScale(Math.max(scaleX, scaleY));
			this.bonusContainer.add(this.bonusBg);
		}

		// Cover overlay - same layout as normal (ControllerNormal_PC / normal-bg-cover)
		this.bonusBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'normal-bg-cover'
		).setOrigin(0.5, 0).setDepth(850);
		this.bonusBgCover.setVisible(false);
		console.log('[BonusBackground] Created normal-bg-cover (same layout as normal), depth 850, initially hidden');
	}

	private createLandscapeBonusBackground(scene: Scene, assetScale: number): void {
		console.log("[BonusBackground] Creating landscape bonus background layout (same as normal)");

		// Static bonus background (same as normal: BG-Default / NormalGame.webp)
		if (scene.textures.exists('BG-Default')) {
			this.bonusBg = scene.add.image(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				'BG-Default'
			).setOrigin(0.5, 0.5).setDepth(0);
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			this.bonusBg.setScale(Math.max(scaleX, scaleY));
			this.bonusContainer.add(this.bonusBg);
		}

		// Cover overlay - same layout as normal (ControllerNormal_PC / normal-bg-cover)
		this.bonusBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'normal-bg-cover'
		).setOrigin(0.5, 0).setDepth(850);
		this.bonusBgCover.setVisible(false);
		console.log('[BonusBackground] Created normal-bg-cover (same layout as normal), depth 850, initially hidden');
	}

	private scaleImageToCover(image: Phaser.GameObjects.Image, targetWidth: number, targetHeight: number): void {
		const sourceWidth = image.width;
		const sourceHeight = image.height;
		if (!sourceWidth || !sourceHeight) return;
		const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
		image.setScale(scale);
	}

	private scaleImageToWidth(image: Phaser.GameObjects.Image, targetWidth: number): void {
		const sourceWidth = image.width;
		if (!sourceWidth) return;
		image.setScale(targetWidth / sourceWidth);
	}

	private layout(scene: Scene): void {
		const width = scene.scale.width;
		const height = scene.scale.height;

		if (this.bonusBg) {
			// Apply vertical offset adjustment (see bonusBackgroundYOffset property at top of class)
			const yPosition = (height * 0.5) + this.bonusBackgroundYOffset;
			this.bonusBg.setPosition(width * 0.5, yPosition);
			// Scale spine animation to cover screen
			try {
				const scaleX = width / (this.bonusBg.width || 1);
				const scaleY = height / (this.bonusBg.height || 1);
				const scale = Math.max(scaleX, scaleY);
				this.bonusBg.setScale(scale);
			} catch (e) {
				console.warn('[BonusBackground] Failed to scale bonus bg:', e);
			}
		}

		if (this.bonusBgCover) {
			// Same layout as normal Background (ControllerNormal_PC)
			const pct = Phaser.Math.Clamp(this.coverHeightPercentOfScene, 0, 1);
			const scaleX = this.bonusBgCover.width ? (width / this.bonusBgCover.width * 1.2) : 1;
			const scaleY = this.bonusBgCover.height ? ((height * pct) / this.bonusBgCover.height * 1.15) : 1;
			this.bonusBgCover.setScale(scaleX, scaleY);
			const coverHalfHeight = this.bonusBgCover.displayHeight * 1;
			const y = height - coverHalfHeight - this.coverBottomOffsetPx;
			this.bonusBgCover.setPosition(width * 0.5, y * 1.56);
		}

	}

	resize(scene: Scene): void {
		if (this.bonusContainer) {
			this.bonusContainer.setSize(scene.scale.width, scene.scale.height);
		}
		this.layout(scene);
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bonusContainer;
	}

	destroy(): void {
		if (this.bonusContainer) {
			this.bonusContainer.destroy();
		}
	}

	/**
	 * Setup listener for bonus mode changes to toggle cover and cloud visibility
	 */
	private setupBonusModeListener(scene: Scene): void {
		// Check if normal-bg-cover asset loaded successfully (same as normal game)
		if (!scene.textures.exists('normal-bg-cover')) {
			console.error('[BonusBackground] normal-bg-cover texture not found! Check AssetConfig and file path.');
			console.log('[BonusBackground] Available textures:', scene.textures.getTextureKeys());
		}
		
		// Listen for bonus mode events using scene.events (same as Background.ts)
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			console.log(`[BonusBackground] Bonus mode changed to: ${isBonus}`);
			
			if (this.bonusBgCover) {
				this.bonusBgCover.setVisible(isBonus);
				console.log(`[BonusBackground] Bonus bg cover visibility: ${isBonus}`);
			}
			
			// Refresh layout when bonus mode changes
			if (isBonus) {
				this.layout(scene);
			}
		});

		// Listen for showBonusBackground to refresh layout (called after dialog closes)
		scene.events.on('showBonusBackground', () => {
			console.log('[BonusBackground] showBonusBackground event - refreshing layout');
			this.layout(scene);
		});

		// Set initial visibility based on current bonus state
		const isBonus = gameStateManager.isBonus;
		
		if (this.bonusBgCover) {
			this.bonusBgCover.setVisible(isBonus);
			console.log(`[BonusBackground] Initial bonus bg cover visibility: ${isBonus} (isBonus: ${isBonus})`);
		}
	}
}
