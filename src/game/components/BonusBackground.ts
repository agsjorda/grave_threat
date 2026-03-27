import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameStateManager } from "../../managers/GameStateManager";
import { gameEventManager, GameEventType } from "../../event/EventManager";
import {
	BACKGROUND_COVER_CONFIG,
} from "../../config/GameConfig";
import { scaleBottomCoverImage } from "./BackgroundCoverLayout";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import { ClippingAttachment } from "@esotericsoftware/spine-core";

export class BonusBackground {
	private bonusContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private bonusBg: any = null; // Spine animation object
	private fireBg1: any = null; // Fire VFX instance 1 over bonus background
	private fireBg2: any = null; // Fire VFX instance 2 over bonus background
	private willOWispBg: any = null; // Spine VFX over bonus background
	private bonusBgCover: Phaser.GameObjects.Image | null = null;
	private scene: Scene | null = null;

	// Same layout as normal Background for ControllerNormal_PC (normal-bg-cover)
	private coverHeightPercentOfScene: number = 0.5;
	private coverBottomOffsetPx: number = 0;
	// Same layout as normal: background centered (no offset)
	private bonusBackgroundYOffset: number = 0;

	// BonusBackground-local tuning (moved from GameConfig for isolated bonus VFX iteration).
	private readonly bonusBgCoverScaleX = 0.85;
	private readonly bonusBgCoverScaleY = 0.8;
	private readonly bonusBgCoverOffsetY = 0;

	private readonly fireBg1ScaleMultiplierX = 0.17;
	private readonly fireBg1ScaleMultiplierY = 0.17;
	private readonly fireBg1OffsetX = -147;
	private readonly fireBg1OffsetY = -207;

	private readonly fireBg2ScaleMultiplierX = 0.17;
	private readonly fireBg2ScaleMultiplierY = 0.17;
	private readonly fireBg2OffsetX = -100;
	private readonly fireBg2OffsetY = -180;

	private readonly willOWispScaleMultiplierX = 0.75;
	private readonly willOWispScaleMultiplierY = 0.8;
	private readonly willOWispOffsetY = -170;
	private readonly willOWispRemoveRootClip = true;
	
	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are loaded centrally through AssetConfig in Preloader
	}

	create(scene: Scene): void {
		
		// Store scene reference
		this.scene = scene;
		
		// Create main container for all bonus background elements
	// Set depth to -1 so it's behind symbols (0-600) and all other game elements
	this.bonusContainer = scene.add.container(0, 0);
	this.bonusContainer.setDepth(-1);
		const assetScale = this.networkManager.getAssetScale();
		

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

		// Will-o-wisp bonus VFX (2 layers above BonusGame image depth 0).
		const fireBgKey = "Fire_BG_GT";
		if (scene.cache.json.has(fireBgKey) && ensureSpineFactory(scene, `[BonusBackground] ${fireBgKey}`)) {
			try {
				const createFireInstance = (opts?: { timeScale?: number; startOffsetSec?: number }): any => {
					const fire: any = scene.add.spine(
						scene.scale.width * 0.5,
						scene.scale.height * 0.5,
						fireBgKey,
						`${fireBgKey}-atlas`,
					);
					// 1 depth above BonusGame image (bonusBg depth 0)
					fire.setDepth(1);
					fire.setOrigin?.(0.5, 0.5);
					try {
						const state =
							fire.animationState ||
							fire.spine?.animationState;
						if (state && typeof state.setAnimation === "function") {
							const entry = state.setAnimation(0, "animation", true);
							// De-sync duplicate instances by allowing per-instance speed/phase.
							if (entry) {
								if (typeof opts?.timeScale === "number") {
									entry.timeScale = opts.timeScale;
								}
								if (typeof opts?.startOffsetSec === "number") {
									entry.trackTime = Math.max(0, opts.startOffsetSec);
								}
							}
						}
					} catch {}
					this.bonusContainer.add(fire);
					return fire;
				};

				this.fireBg1 = createFireInstance();
				this.fireBg2 = createFireInstance({
					// Slightly different speed and phase so it doesn't mirror FIRE_BG_1.
					timeScale: 0.9 + Math.random() * 0.25,
					startOffsetSec: Math.random() * 2.5,
				});
			} catch (e) {
				console.warn(`[BonusBackground] Failed to create ${fireBgKey} spine:`, e);
				this.fireBg1 = null;
				this.fireBg2 = null;
			}
		}

		// Will-o-wisp bonus VFX (2 layers above BonusGame image depth 0).
		const willOWispKey = "Will-o-wisp_BG_GT";
		if (scene.cache.json.has(willOWispKey) && ensureSpineFactory(scene, `[BonusBackground] ${willOWispKey}`)) {
			try {
				this.willOWispBg = scene.add.spine(
					scene.scale.width * 0.5,
					scene.scale.height * 0.5,
					willOWispKey,
					`${willOWispKey}-atlas`,
				);
				this.willOWispBg.setDepth(2);
				this.willOWispBg.setOrigin?.(0.5, 0.5);
				try {
					const state =
						this.willOWispBg.animationState ||
						this.willOWispBg.spine?.animationState;
					if (state && typeof state.setAnimation === "function") {
						state.setAnimation(0, "animation", true);
					}
				} catch {}
				this.mitigateWillOWispClipArtifacts(this.willOWispBg);
				this.bonusContainer.add(this.willOWispBg);
			} catch (e) {
				console.warn(`[BonusBackground] Failed to create ${willOWispKey} spine:`, e);
				this.willOWispBg = null;
			}
		}

		// bg_border is a single scene object in Background.ts at BG_BORDER_DEPTH (above grid); not duplicated here.

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
	}

	/**
	 * Will-o-wisp_BG_GT (grave_threat only): root slot uses a ClippingAttachment. That clip edge
	 * can read as white lines at the top; toggling atlas PMA does not fix it. Removing the clip
	 * matches other pma:false assets that do not use this skeleton-specific clip.
	 */
	private mitigateWillOWispClipArtifacts(spineGo: any): void {
		if (!this.willOWispRemoveRootClip) return;
		try {
			const skel = spineGo?.skeleton;
			if (!skel || typeof skel.findSlot !== "function") return;
			const rootSlot = skel.findSlot("root");
			const att = rootSlot?.getAttachment();
			if (rootSlot && att instanceof ClippingAttachment) {
				rootSlot.setAttachment(null);
			}
			if (typeof spineGo.updatePose === "function") {
				spineGo.updatePose(0);
			}
		} catch {
			/* ignore */
		}
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

		if (this.willOWispBg) {
			this.willOWispBg.setPosition(
				width * 0.5,
					height * 0.5 + this.willOWispOffsetY,
			);
			try {
				const vfxWidth =
					this.willOWispBg.width ||
					this.willOWispBg.skeleton?.data?.width ||
					954.49;
				const vfxHeight =
					this.willOWispBg.height ||
					this.willOWispBg.skeleton?.data?.height ||
					1464.8;
				const base = Math.max(
					width / (vfxWidth || 1),
					height / (vfxHeight || 1),
				);
				this.willOWispBg.setScale(
					base * this.willOWispScaleMultiplierX,
					base * this.willOWispScaleMultiplierY,
				);
			} catch (e) {
				console.warn("[BonusBackground] Failed to scale Will-o-wisp BG VFX:", e);
			}
		}

		if (this.fireBg1) {
			this.fireBg1.setPosition(
				width * 0.5 + this.fireBg1OffsetX,
				height * 0.5 + this.fireBg1OffsetY,
			);
			try {
				const vfxWidth =
					this.fireBg1.width ||
					this.fireBg1.skeleton?.data?.width ||
					954.49;
				const vfxHeight =
					this.fireBg1.height ||
					this.fireBg1.skeleton?.data?.height ||
					1464.8;
				const scale = Math.max(
					width / (vfxWidth || 1),
					height / (vfxHeight || 1),
				);
				this.fireBg1.setScale(
					scale * this.fireBg1ScaleMultiplierX,
					scale * this.fireBg1ScaleMultiplierY,
				);
			} catch (e) {
				console.warn("[BonusBackground] Failed to scale FIRE_BG_1 VFX:", e);
			}
		}

		if (this.fireBg2) {
			this.fireBg2.setPosition(
				width * 0.5 + this.fireBg2OffsetX,
				height * 0.5 + this.fireBg2OffsetY,
			);
			try {
				const vfxWidth =
					this.fireBg2.width ||
					this.fireBg2.skeleton?.data?.width ||
					954.49;
				const vfxHeight =
					this.fireBg2.height ||
					this.fireBg2.skeleton?.data?.height ||
					1464.8;
				const scale = Math.max(
					width / (vfxWidth || 1),
					height / (vfxHeight || 1),
				);
				this.fireBg2.setScale(
					scale * this.fireBg2ScaleMultiplierX,
					scale * this.fireBg2ScaleMultiplierY,
				);
			} catch (e) {
				console.warn("[BonusBackground] Failed to scale FIRE_BG_2 VFX:", e);
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
				BACKGROUND_COVER_CONFIG.BONUS_WIDTH_MULTIPLIER * this.bonusBgCoverScaleX,
				BACKGROUND_COVER_CONFIG.BONUS_HEIGHT_MULTIPLIER * this.bonusBgCoverScaleY,
			);

			// Align the visual bottom edge of the cover with the bottom of the screen
			// (taking the image's origin into account). With originY = 0, this is
			// bottomY = y + displayHeight.
			const coverHeight = this.bonusBgCover.displayHeight;
			const originY = this.bonusBgCover.originY ?? 0;
			const bottomY = height - this.coverBottomOffsetPx;
			const y = bottomY - coverHeight * (1 - originY) + this.bonusBgCoverOffsetY;
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
		}
		
		// Listen for bonus mode events using scene.events (same as Background.ts)
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			
			if (this.bonusBgCover) {
				this.bonusBgCover.setVisible(isBonus);
			}
			
			// Refresh layout when bonus mode changes
			if (isBonus) {
				this.layout(scene);
			}
		});

		// Listen for showBonusBackground to refresh layout (called after dialog closes)
		scene.events.on('showBonusBackground', () => {
			this.layout(scene);
		});

		// Set initial visibility based on current bonus state
		const isBonus = gameStateManager.isBonus;
		
		if (this.bonusBgCover) {
			this.bonusBgCover.setVisible(isBonus);
		}
	}
}
