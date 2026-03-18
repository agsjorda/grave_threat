import { NetworkManager } from "../managers/NetworkManager";
import { ScreenModeManager } from "../managers/ScreenModeManager";
import { BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT } from "./GameConfig";

export interface AssetGroup {
	images?: { [key: string]: string };
	spine?: { [key: string]: { atlas: string; json: string } };
	audio?: { [key: string]: string };
	fonts?: { [key: string]: string };
}

export class AssetConfig {
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	private getAssetPrefix(): string {
		const screenConfig = this.screenModeManager.getScreenConfig();
		const isHighSpeed = this.networkManager.getNetworkSpeed();

		const orientation = screenConfig.isPortrait ? 'portrait' : 'landscape';
		const quality = isHighSpeed ? 'high' : 'low';

		return `assets/${orientation}/${quality}`;
	}

	getBackgroundAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'bg_default': `${prefix}/background/NormalGame.webp`,
				'normal_bg_cover': `${prefix}/background/ControllerNormal.webp`,
				'bg_border': `${prefix}/background/bg_border.webp`,
				'shine': `assets/portrait/high/background/shine.png`,
				'dijoker_loading': `${prefix}/dijoker_loading/DI JOKER.png`
			},
			spine: {
				'di_joker': {
					atlas: `${prefix}/dijoker_loading/DI JOKER.atlas`,
					json: `${prefix}/dijoker_loading/DI JOKER.json`
				}
			}
		};
	}

	getBonusBackgroundAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		// Separate bonus background so we can use BonusGame.webp instead of NormalGame.webp.
		return {
			images: {
				'bg_bonus': `${prefix}/bonus_background/BonusGame.webp`,
				'bonus_bg_cover': `${prefix}/bonus_background/ControllerBonus.webp`,
				'shine': `assets/portrait/high/background/shine.png`,
				'dijoker_loading': `${prefix}/dijoker_loading/DI JOKER.png`
			},
			spine: {
				'di_joker': {
					atlas: `${prefix}/dijoker_loading/DI JOKER.atlas`,
					json: `${prefix}/dijoker_loading/DI JOKER.json`
				}
			}
		};
	}

	getHeaderAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'header_winbar': `${prefix}/header/Header_WinBar.webp`,
				'header_logo': `${prefix}/background/HeaderLogo.webp`,
				'header_border': `${prefix}/header/Header_Border.webp`
			}
		};
	}

	getBonusHeaderAssets(): AssetGroup {
		// Same layout and assets as normal game
		return this.getHeaderAssets();
	}


	getLoadingAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'loading_background': `${prefix}/background/LoadingScreen.png`,
				'preload_logo': `${prefix}/background/HeaderLogo.webp`,
				'button_bg': `${prefix}/loading/button_bg.png`,
				'button_spin': `${prefix}/loading/button_spin.png`,
				'loading_frame': `${prefix}/loading/loading-frame.png`,
				'loading_frame_2': `${prefix}/loading/loading-frame-2.png`,
				'dijoker_logo': `${prefix}/loading/DiJoker-logo.png`,
			},
			spine: {
				// Studio loading spine (DI JOKER) – only available in portrait/high
				'di_joker': {
					atlas: `${prefix}/dijoker_loading/DI JOKER.atlas`,
					json: `${prefix}/dijoker_loading/DI JOKER.json`
				},
			}
		};
	}

	// Add more asset groups as needed
	getSymbolAssets(): AssetGroup {
		// Symbols and related bonus art live under portrait/high for pastry_cub.
		const suffix = 'GT';
		const pcPath = 'assets/portrait/high/symbols/';
		console.log(`[AssetConfig] Loading symbol assets from: ${pcPath}`);

		// Generate symbol assets for all symbols (0-10)
		const symbolImages: { [key: string]: string } = {};
		const symbolSpine: { [key: string]: { atlas: string; json: string } } = {};

		// Symbol Spine: 0-7 (scatter + regular)
		for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
			const spineKey = `symbol_${i}_spine`;
			symbolSpine[spineKey] = { atlas: `${pcPath}/Symbol${i}_${suffix}.atlas`, json: `${pcPath}/Symbol${i}_${suffix}.json` };
		}

		// symbols for helper (HelpScreen, etc.): 0-7 only
		for (let i = 0; i <= 7; i++) {
			const spritePath = `${pcPath}/statics/symbol${i}.png`;
			symbolImages[`symbol${i}`] = spritePath;
			symbolImages[`symbol_${i}`] = spritePath;
		}

		// Multiplier overlays for bonus grid image tiers (1st mark->x1, 2nd->x2, ...).
		// Files expected in: assets/portrait/high/symbols/pastry_cub_symbols/multiplier_symbols/x1.webp, x2.webp, ...
		BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT.forEach((mult, index) => {
			const key = `bonus_multiplier_x${mult}`;
			const path = `${pcPath}/multiplier_symbols/x${mult}.webp`;
			symbolImages[key] = path;
			console.log(`[AssetConfig] Bonus multiplier mark#${index + 1} -> ${mult}x: ${path}`);
		});

		return {
			images: symbolImages,
			spine: symbolSpine
		};
	}

	getButtonAssets(): AssetGroup {
		// Controller buttons now follow portrait/landscape structure
		const screenConfig = this.screenModeManager.getScreenConfig();
		const isHighSpeed = this.networkManager.getNetworkSpeed();
		const quality = isHighSpeed ? 'high' : 'low';
		const screenMode = screenConfig.isPortrait ? 'portrait' : 'landscape';

		console.log(`[AssetConfig] Loading controller buttons with quality: ${quality}, screen mode: ${screenMode}`);

		return {
			images: {
				'autoplay_off': `assets/controller/${screenMode}/${quality}/autoplay_off.png`,
				'autoplay_on': `assets/controller/${screenMode}/${quality}/autoplay_on.png`,
				'decrease_bet': `assets/controller/${screenMode}/${quality}/decrease_bet.png`,
				'increase_bet': `assets/controller/${screenMode}/${quality}/increase_bet.png`,
				'menu': `assets/controller/${screenMode}/${quality}/menu.png`,
				'spin': `assets/controller/${screenMode}/${quality}/spin_bg.png`,
				'spin_icon': `assets/controller/${screenMode}/${quality}/spin_icon.png`,
				'autoplay_stop_icon': `assets/controller/${screenMode}/${quality}/autoplay_stop_icon.png`,
				'turbo_off': `assets/controller/${screenMode}/${quality}/turbo_off.png`,
				'turbo_on': `assets/controller/${screenMode}/${quality}/turbo_on.png`,
				'amplify': `assets/controller/${screenMode}/${quality}/amplify.png`,
				'feature': `assets/controller/${screenMode}/${quality}/feature.png`,
				'long_button': `assets/controller/${screenMode}/${quality}/long_button.png`,
				'maximize': `assets/controller/${screenMode}/${quality}/maximize.png`,
				'minimize': `assets/controller/${screenMode}/${quality}/minimize.png`,
				// Free round button background (currently only available as portrait/high asset)
				// We reference it directly so it can be used in all modes without additional variants.
				'freeround_bg': `assets/controller/portrait/high/freeround_bg.png`,
				// "Spin Now" button for free round reward panel (portrait/high only asset)
				'spin_now_button': `assets/controller/portrait/high/spin_now_button.png`,
			},
			spine: {
				'spin_button_animation': {
					atlas: `assets/controller/${screenMode}/${quality}/spin_button_anim/spin_button_anim.atlas`,
					json: `assets/controller/${screenMode}/${quality}/spin_button_anim/spin_button_anim.json`
				},
				// Free-round specific spin button animation (portrait/high only asset)
				// Used instead of the normal spin_button_animation while in initialization
				// free-round spins mode.
				'fr_spin_button_animation': {
					atlas: `assets/controller/portrait/high/Button_Bonus_Buttom/Button_Bonus_VFX.atlas`,
					json: `assets/controller/portrait/high/Button_Bonus_Buttom/Button_Bonus_VFX.json`
				},
				'button_animation_idle': {
					atlas: `assets/controller/${screenMode}/${quality}/button_animation_idle/button_animation_idle.atlas`,
					json: `assets/controller/${screenMode}/${quality}/button_animation_idle/button_animation_idle.json`
				},
				'amplify_bet': {
					atlas: `assets/portrait/high/amplify_bet/Amplify Bet.atlas`,
					json: `assets/portrait/high/amplify_bet/Amplify Bet.json`
				},
				// Enhance Bet idle loop (available only in portrait/high for now)
				'enhance_bet_idle_on': {
					atlas: `assets/controller/portrait/high/enhanceBet_idle_on/Amplify Bet.atlas`,
					json: `assets/controller/portrait/high/enhanceBet_idle_on/Amplify Bet.json`
				},
				'turbo_animation': {
					atlas: `assets/controller/${screenMode}/${quality}/turbo_animation/Turbo_Spin.atlas`,
					json: `assets/controller/${screenMode}/${quality}/turbo_animation/Turbo_Spin.json`
				}
			}
		};
	}

	getFontAssets(): AssetGroup {
		console.log(`[AssetConfig] Loading font assets`);

		return {
			fonts: {
				'poppins-bold': 'assets/fonts/poppins/Poppins-Bold.ttf',
				'poppins-regular': 'assets/fonts/poppins/Poppins-Regular.ttf'
			}
		};
	}

	getMenuAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();
		return {
			images: {
				// Menu tab icons
				'menu_info': `${prefix}/menu/Info.png`,
				'menu_history': `${prefix}/menu/History.png`,
				'menu_settings': `${prefix}/menu/Settings.png`,
				// Pagination and loading
				'icon_left': `${prefix}/menu/icon_left.png`,
				'icon_most_left': `${prefix}/menu/icon_most_left.png`,
				'icon_right': `${prefix}/menu/icon_right.png`,
				'icon_most_right': `${prefix}/menu/icon_most_right.png`,
				'loading_icon': `${prefix}/menu/loading.png`,
				// Close icon (portrait/high specific path)
				'menu_close': `assets/controller/portrait/high/close.png`
			}
		};
	}

	getHelpScreenAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();
		
		return {
			images: {
				// Payline visuals
				'paylineMobileWin': `${prefix}/help_screen/game_settings_content/paylineMobileWin.webp`,
				'paylineMobileNoWin': `${prefix}/help_screen/game_settings_content/paylineMobileNoWin.webp`,
				// Alias for existing GameSettingsContent key
				'help_paylines': `${prefix}/help_screen/game_settings_content/paylineMobileWin.webp`,

				// Scatter / Tumble / Multiplier visuals
				'scatterGame': `${prefix}/help_screen/bonus_game_content/scatterGame.png`,
				'tumbleWin': `${prefix}/help_screen/bonus_game_content/tumbleWin.png`,
				'multiplierGame': `${prefix}/help_screen/bonus_game_content/multiplierGame.png`,

				// How To Play || Bet controls
				'betControlsMinus': `${prefix}/help_screen/how_to_play_content/betControls_minus.png`,
				'betControlsPlus': `${prefix}/help_screen/how_to_play_content/betControls_plus.png`,

				// How To Play || Game actions
				'spin_button': `${prefix}/help_screen/how_to_play_content/spin_button.png`,
				'enhanced_bet_button': `${prefix}/help_screen/how_to_play_content/enhanced_bet.png`,
				'amplify_bet_button': `${prefix}/help_screen/how_to_play_content/enhanced_bet.png`,
				'autoplay_button': `${prefix}/help_screen/how_to_play_content/autoplay.png`,
				'turbo_button': `${prefix}/help_screen/how_to_play_content/turbo.png`,

				// How To Play || General controls
				'sound_icon_on': `${prefix}/help_screen/how_to_play_content/sound_icon_on.png`,
				'sound_icon_off': `${prefix}/help_screen/how_to_play_content/sound_icon_off.png`,
				'settings_icon': `${prefix}/help_screen/how_to_play_content/settings.png`,
				'info_icon': `${prefix}/help_screen/how_to_play_content/info.png`,
			}
		};
	}

	getDialogAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();
	
		console.log(`[AssetConfig] Loading dialog assets with prefix: ${prefix}`);
	
		return {
			spine: {
				'Congrats': {
					atlas: `${prefix}/dialogs/Congrats_GT.atlas`,
					json: `${prefix}/dialogs/Congrats_GT.json`
				},
				'BigWin': {
					atlas: `${prefix}/dialogs/BigW_GT.atlas`,
					json: `${prefix}/dialogs/BigW_GT.json`
				},
				'MegaWin': {
					atlas: `${prefix}/dialogs/MEgaW_GT.atlas`,
					json: `${prefix}/dialogs/MEgaW_GT.json`
				},
				'EpicWin': {
					atlas: `${prefix}/dialogs/EpicW_GT.atlas`,
					json: `${prefix}/dialogs/EpicW_GT.json`
				},
				'SuperWin': {
					atlas: `${prefix}/dialogs/SuperW_GT.atlas`,
					json: `${prefix}/dialogs/SuperW_GT.json`
				},
				'MaxWin': {
					atlas: `${prefix}/dialogs/MaxW_PC.atlas`,
					json: `${prefix}/dialogs/MaxW_PC.json`
				},
				'TotalWin': {
					atlas: `${prefix}/dialogs/Congrats_GT.atlas`,
					json: `${prefix}/dialogs/Congrats_GT.json`
				},
				'FreeSpin': {
					atlas: `${prefix}/dialogs/FreeSpin_PC.atlas`,
					json: `${prefix}/dialogs/FreeSpin_PC.json`
				}
			}
		};
	}
	
	/**
	 * Scatter Anticipation assets – only available in portrait/high for now.
	 * We intentionally do not use getAssetPrefix() to avoid missing assets on low quality.
	 */
	getScatterAnticipationAssets(): AssetGroup {
		console.log('[AssetConfig] Loading Scatter Anticipation assets');
		return {
			spine: {}
		};
	}

	getNumberAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		console.log(`[AssetConfig] Loading number assets with prefix: ${prefix}`);

		// Generate number assets for digits 0-9, plus comma and dot
		const numberImages: { [key: string]: string } = {};

		// Add digit images (0-9)
		for (let i = 0; i <= 9; i++) {
			const key = `number_${i}`;
			const path = `${prefix}/numbers/Number${i}.webp`;
			numberImages[key] = path;
			console.log(`[AssetConfig] Number ${key}: ${path}`);
		}

		// Add comma and dot
		numberImages['number_comma'] = `${prefix}/numbers/comma.webp`;
		numberImages['number_dot'] = `${prefix}/numbers/dot.webp`;

		console.log(`[AssetConfig] Number comma: ${prefix}/numbers/comma.webp`);
		console.log(`[AssetConfig] Number dot: ${prefix}/numbers/dot.webp`);

		return {
			images: numberImages
		};
	}

	getBuyFeatureAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		console.log(`[AssetConfig] Loading buy feature assets with prefix: ${prefix}`);

		return {
			images: {
				'buy_feature_logo': `${prefix}/buy_feature/buy_feature_logo.webp`,
				'buy_feature_logo2': `${prefix}/buy_feature/buy_feature_logo2.webp`,
				'buy_feature_bg': `${prefix}/buy_feature/buy_feature_bg.webp`,
				'buy_feature_selected_icon': `${prefix}/buy_feature/selected_icon.png`,
			}
		};
	}

	//-------------------------
	// Audio assets
	//-------------------------

	getAudioAssets(): AssetGroup {
		console.log(`[AssetConfig] Loading audio assets`);

		return {
			audio: {
				// Menu/UI clicks
				'click': 'assets/sounds/SFX/click_2.ogg',
				//BG sounds
				'mainbg': 'assets/sounds/BG/mainbg_GT.ogg',
				'bonusbg': 'assets/sounds/BG/bonusbg_GT.ogg',
				'freespinbg': 'assets/sounds/BG/freespin_won_GT.ogg',
				'spinb': 'assets/sounds/SFX/spin_GT.ogg',
				'reelroll': 'assets/sounds/SFX/reelroll_PC.ogg',
				'reeldrop': 'assets/sounds/SFX/reeldrop_GT.ogg',
				// Scatter reel-drop variants (played progressively per scatter reel in a spin)
				'scatterdrop1': 'assets/sounds/SFX/symbol_win/scatterdrop_brass_1.ogg',
				'scatterdrop2': 'assets/sounds/SFX/symbol_win/scatterdrop_brass_2.ogg',
				'scatterdrop3': 'assets/sounds/SFX/symbol_win/scatterdrop_brass_3.ogg',
				'scatterdrop4': 'assets/sounds/SFX/symbol_win/scatterdrop_brass_4.ogg',
				'turbodrop': 'assets/sounds/SFX/turbo_GT.ogg',
				// Non-scatter box close SFX (played once when all regular symbol wins finish)
				'box_close': 'assets/sounds/SFX/box_close.ogg',
				// Radial light transition whistle SFX
				'whistle': 'assets/sounds/SFX/whistle_BB.ogg',
				'scatter': 'assets/sounds/SFX/scatter_GT.ogg',
				// Tumble symbol-win SFX (play per tumble index)
				'twin1': 'assets/sounds/SFX/symbol_win/twin_1_GT.ogg',
				'twin2': 'assets/sounds/SFX/symbol_win/twin_2_GT.ogg',
				'twin3': 'assets/sounds/SFX/symbol_win/twin_3_GT.ogg',
				'twin4': 'assets/sounds/SFX/symbol_win/twin_4_GT.ogg',
				// Win dialog SFX
				'bigw': 'assets/sounds/Wins/bigw_GT.ogg',
				'megaw': 'assets/sounds/Wins/megaw_GT.ogg',
				'superw': 'assets/sounds/Wins/superw_GT.ogg',
				'epicw': 'assets/sounds/Wins/epicw_GT.ogg',
				'maxw': 'assets/sounds/Wins/maxw_GT.ogg',
				'maxwend': 'assets/sounds/Wins/maxw_end_GT.ogg',
				'totalw': 'assets/sounds/Wins/totalw_GT.ogg',
				'retrigger': 'assets/sounds/Wins/retrigger_PC.ogg',
			}
		};
	}

	// Helper method to get all assets for a scene
	getAllAssets(): { [key: string]: AssetGroup } {
		return {
			background: this.getBackgroundAssets(),
			bonusBackground: this.getBonusBackgroundAssets(),
			header: this.getHeaderAssets(),
			bonusHeader: this.getBonusHeaderAssets(),
			loading: this.getLoadingAssets(),
			symbols: this.getSymbolAssets(),
			buttons: this.getButtonAssets(),
			fonts: this.getFontAssets(),
			dialogs: this.getDialogAssets(),
			numbers: this.getNumberAssets(),
			buyFeature: this.getBuyFeatureAssets(),
			audio: this.getAudioAssets(),
		};
	}

	// Method to get debug info
	getDebugInfo(): void {
		const prefix = this.getAssetPrefix();
		console.log(`[AssetConfig] Asset prefix: ${prefix}`);
		console.log(`[AssetConfig] Available asset groups:`, Object.keys(this.getAllAssets()));
	}
} 



