import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameStateManager } from "../../managers/GameStateManager";
import { gameEventManager, GameEventType } from "../../event/EventManager";
import {
	BG_BORDER_OFFSET_Y,
	BONUS_BG_COVER_OFFSET_Y,
	BONUS_BG_COVER_SCALE_X,
	BONUS_BG_COVER_SCALE_Y,
	BACKGROUND_COVER_CONFIG,
} from "../../config/GameConfig";
import { scaleBottomCoverImage } from "./BackgroundCoverLayout";

export class BonusBackground {
	private bonusContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private bonusBg: any = null; // Spine animation object
	private bonusBgCover: Phaser.GameObjects.Image | null = null;
	private bonusBgBorder: Phaser.GameObjects.Image | null = null;
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
		// Portrait and landscape currently share the same bonus background layout.
		this.createCommonBonusBackground(scene, assetScale);
	}

	private createCommonBonusBackground(scene: Scene, assetScale: number): void {
		console.log("[BonusBackground] Creating bonus background layout (same as normal)");

		// Static bonus background: prefer bg_bonus (BonusGame.webp), fall back to bg_default if missing
		const bonusBgKey = scene.textures.exists("bg_bonus") ? "bg_bonus" : "bg_default";
		if (scene.textures.exists(bonusBgKey)) {
			this.bonusBg = scene
				.add.image(scene.scale.width * 0.5, scene.scale.height * 0.5, bonusBgKey)
				.setOrigin(0.5, 0.5)
				.setDepth(0);
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			this.bonusBg.setScale(Math.max(scaleX, scaleY));
			this.bonusContainer.add(this.bonusBg);
		}

		// Bonus border: same placement logic as bg_border in Background.ts
		if (scene.textures.exists("bg_border")) {
			this.bonusBgBorder = scene
				.add.image(
					scene.scale.width * 0.5,
					scene.scale.height * 0.5 + BG_BORDER_OFFSET_Y,
					"bg_border",
				)
				.setOrigin(0.5, 0.5)
				.setDepth(0);
			this.bonusContainer.add(this.bonusBgBorder);
		}

		// Cover overlay - same layout as normal (ControllerNormal_PC / normal_bg_cover)
		this.bonusBgCover = scene
			.add.image(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				"bonus_bg_cover",
			)
			.setOrigin(0.5, 0)
			.setDepth(850);
		this.bonusBgCover.setVisible(false);
		console.log(
			"[BonusBackground] Created normal-bg-cover (same layout as normal), depth 850, initially hidden",
		);
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
			// Same layout as normal Background (ControllerNormal_PC), with configurable scale.
			// Bottom edge of the cover is aligned with the bottom of the screen (minus any coverBottomOffsetPx),
			// so you don't need to manually tweak a Y offset for alignment.
			scaleBottomCoverImage(
				scene,
				this.bonusBgCover,
				this.coverHeightPercentOfScene,
				BACKGROUND_COVER_CONFIG.BONUS_WIDTH_MULTIPLIER * BONUS_BG_COVER_SCALE_X,
				BACKGROUND_COVER_CONFIG.BONUS_HEIGHT_MULTIPLIER * BONUS_BG_COVER_SCALE_Y,
			);

			// Align the visual bottom edge of the cover with the bottom of the screen
			// (taking the image's origin into account). With originY = 0, this is
			// bottomY = y + displayHeight.
			const coverHeight = this.bonusBgCover.displayHeight;
			const originY = this.bonusBgCover.originY ?? 0;
			const bottomY = height - this.coverBottomOffsetPx;
			const y = bottomY - coverHeight * (1 - originY) + BONUS_BG_COVER_OFFSET_Y;
			this.bonusBgCover.setPosition(width * 0.5, y);
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
		// Check if bonus_bg_cover asset loaded successfully
		if (!scene.textures.exists('bonus_bg_cover')) {
			console.error('[BonusBackground] bonus_bg_cover texture not found! Check AssetConfig and file path.');
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
