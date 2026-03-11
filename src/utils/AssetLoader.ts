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
				console.log(`[AssetLoader] Loading image: ${key} from ${path}`);
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
						console.log(`[AssetLoader] Loading spine (combined): ${key}`);
						console.log(`[AssetLoader]   JSON: ${spineData.json}`);
						console.log(`[AssetLoader]   Atlas: ${spineData.atlas}`);
						anyLoad.spine(key, spineData.json, spineData.atlas, true);
					} else {
						console.log(`[AssetLoader] Loading spine (separate): ${key} from ${spineData.json}`);
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
				console.log(`[AssetLoader] Loading audio: ${key} from ${path}`);
				scene.load.audio(key, path);
			});
		}

		// Load font files
		if (assetGroup.fonts) {
			Object.entries(assetGroup.fonts).forEach(([key, path]) => {
				console.log(`[AssetLoader] Preloading font: ${key} from ${path}`);
				this.preloadFont(key, path);
			});
		}
	}

	loadBackgroundAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading background assets...');
		this.loadAssetGroup(scene, this.assetConfig.getBackgroundAssets());
	}

	loadBonusBackgroundAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading bonus background assets...');
		const bonusAssets = this.assetConfig.getBonusBackgroundAssets();
		console.log('[AssetLoader] Bonus background assets:', bonusAssets);
		this.loadAssetGroup(scene, bonusAssets);
	}

	loadHeaderAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading header assets...');
		this.loadAssetGroup(scene, this.assetConfig.getHeaderAssets());
	}

	loadBonusHeaderAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading bonus header assets...');
		this.loadAssetGroup(scene, this.assetConfig.getBonusHeaderAssets());
	}

	loadLoadingAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading loading assets...');
		this.loadAssetGroup(scene, this.assetConfig.getLoadingAssets());
	}

	loadSymbolAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading symbol assets...');
		this.loadAssetGroup(scene, this.assetConfig.getSymbolAssets());
		console.log('[AssetLoader] Symbol assets loaded');
	}

	loadButtonAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading button assets...');
		this.loadAssetGroup(scene, this.assetConfig.getButtonAssets());
		console.log('[AssetLoader] Button assets loaded');
	}

	loadFontAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading font assets...');
		this.loadAssetGroup(scene, this.assetConfig.getFontAssets());
		this.ensureFontsLoaded();
		console.log('[AssetLoader] Font assets loaded');
	}

	loadMenuAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading menu assets...');
		this.loadAssetGroup(scene, this.assetConfig.getMenuAssets());
		console.log('[AssetLoader] Menu assets loaded');
	}

	loadHelpScreenAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading help screen assets...');
		this.loadAssetGroup(scene, this.assetConfig.getHelpScreenAssets());
		console.log('[AssetLoader] Help screen assets loaded');
	}

	loadDialogAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading dialog assets...');
		this.loadAssetGroup(scene, this.assetConfig.getDialogAssets());
		console.log('[AssetLoader] Dialog assets loaded');
	}

	loadScatterAnticipationAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading scatter anticipation assets...');
		this.loadAssetGroup(scene, this.assetConfig.getScatterAnticipationAssets());
		console.log('[AssetLoader] Scatter anticipation assets loaded');
	}

	loadNumberAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading number assets...');
		this.loadAssetGroup(scene, this.assetConfig.getNumberAssets());
		console.log('[AssetLoader] Number assets loaded');
	}

	loadBuyFeatureAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading buy feature assets...');
		this.loadAssetGroup(scene, this.assetConfig.getBuyFeatureAssets());
		console.log('[AssetLoader] Buy feature assets loaded');
	}

	loadAudioAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading audio assets...');
		this.loadAssetGroup(scene, this.assetConfig.getAudioAssets());
		console.log('[AssetLoader] Audio assets loaded');
	}

	loadAllAssets(scene: Scene): void {
		console.log('[AssetLoader] Loading all assets...');
		const allAssets = this.assetConfig.getAllAssets();
		
		Object.entries(allAssets).forEach(([groupName, assetGroup]) => {
			console.log(`[AssetLoader] Loading ${groupName} assets...`);
			this.loadAssetGroup(scene, assetGroup);
		});
	}

	private preloadFont(fontFamily: string, fontPath: string): void {
		// Only register @font-face so the font loads when first used. Avoid <link rel="preload" as="font">
		// so we don't get "preloaded but not used within a few seconds" (game uses fonts after Boot/Preloader).
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
				console.log('[AssetLoader] All fonts are loaded and ready');
			}).catch((error) => {
				console.warn('[AssetLoader] Font loading error:', error);
			});
		} else {
			// Fallback: wait a bit for fonts to load
			setTimeout(() => {
				console.log('[AssetLoader] Font loading timeout reached');
			}, 1000);
		}
	}
} 
