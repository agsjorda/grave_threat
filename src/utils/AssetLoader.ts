import { Scene } from "phaser";
	import { AssetConfig, AssetGroup } from "../config/AssetConfig";
import { ensureSpineLoader } from "./SpineGuard";

export class AssetLoader {
	private assetConfig: AssetConfig;

	constructor(assetConfig: AssetConfig) {
		this.assetConfig = assetConfig;
	}

	loadAssetGroup(scene: Scene, assetGroup: AssetGroup): void {
		// Load images
		if (assetGroup.images) {
		Object.entries(assetGroup.images).forEach(([key, path]) => {
			scene.load.image(key, path);
		});
		}

		// Load Spine animations
		if (assetGroup.spine) {
			// Ensure Spine loader APIs are present (combined `load.spine` OR separate `spineJson/spineAtlas`).
			// If we falsely skip here, later code may still try to create Spine objects and appear "racy".
			const hasLoader = ensureSpineLoader(scene, '[AssetLoader] loadAssetGroup');
			if (!hasLoader) {
				console.warn('[AssetLoader] Spine loader not available. Skipping spine asset group.');
				return;
			}

			Object.entries(assetGroup.spine).forEach(([key, spineData]) => {
				try {
					const anyLoad: any = scene.load as any;
					if (typeof anyLoad.spine === 'function') {
						anyLoad.spine(key, spineData.json, spineData.atlas, true);
					} else {
						scene.load.spineAtlas(`${key}-atlas`, spineData.atlas);
						scene.load.spineJson(key, spineData.json);
					}
				} catch (e) {
					console.warn(`[AssetLoader] Failed loading spine ${key}:`, e);
				}
			});
		}

		// Load audio files
		if (assetGroup.audio) {
			Object.entries(assetGroup.audio).forEach(([key, path]) => {
				scene.load.audio(key, path);
			});
		}

		// Load font files
		if (assetGroup.fonts) {
			Object.entries(assetGroup.fonts).forEach(([key, path]) => {
				this.preloadFont(key, path);
			});
		}
	}

	loadBackgroundAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getBackgroundAssets());
	}

	loadBonusBackgroundAssets(scene: Scene): void {
		const bonusAssets = this.assetConfig.getBonusBackgroundAssets();
		this.loadAssetGroup(scene, bonusAssets);
	}

	loadHeaderAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getHeaderAssets());
	}

	loadBonusHeaderAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getBonusHeaderAssets());
	}

	loadLoadingAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getLoadingAssets());
	}

	loadSymbolAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getSymbolAssets());
	}

	loadButtonAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getButtonAssets());
	}

	loadFontAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getFontAssets());
		this.ensureFontsLoaded();
	}

	loadMenuAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getMenuAssets());
	}

	loadHelpScreenAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getHelpScreenAssets());
	}

	loadDialogAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getDialogAssets());
	}

	loadScatterAnticipationAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getScatterAnticipationAssets());
	}

	loadNumberAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getNumberAssets());
	}

	loadBuyFeatureAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getBuyFeatureAssets());
	}

	loadAudioAssets(scene: Scene): void {
		this.loadAssetGroup(scene, this.assetConfig.getAudioAssets());
	}

	loadAllAssets(scene: Scene): void {
		const allAssets = this.assetConfig.getAllAssets();
		
		Object.entries(allAssets).forEach(([groupName, assetGroup]) => {
			this.loadAssetGroup(scene, assetGroup);
		});
	}

	private preloadFont(fontFamily: string, fontPath: string): void {
		// Preload via <link> so fonts are fetched during Boot/Preloader,
		// not lazily on first paint (prevents visible fallback fonts).
		const link = document.createElement('link');
		link.rel = 'preload';
		link.as = 'font';
		link.type = 'font/ttf';
		link.href = fontPath;
		link.crossOrigin = 'anonymous';
		document.head.appendChild(link);

		// Ensure font is registered for Phaser canvas text.
		const style = document.createElement('style');
		style.textContent = `
			@font-face {
				font-family: '${fontFamily}';
				src: url('${fontPath}') format('truetype');
				font-display: swap;
			}
		`;
		document.head.appendChild(style);
	}

	private ensureFontsLoaded(): void {
		// Wait for fonts to be loaded using document.fonts API
		if (document.fonts && document.fonts.ready) {
			document.fonts.ready.then(() => {
			}).catch((error) => {
				console.warn('[AssetLoader] Font loading error:', error);
			});
		} else {
			// Fallback: wait a bit for fonts to load
			setTimeout(() => {
			}, 1000);
		}
	}
} 
