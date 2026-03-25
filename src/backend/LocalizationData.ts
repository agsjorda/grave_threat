/**
 * Centralized localization keys and fallback text.
 * Use localizationManager.getTextByKey(key) ?? LOCALIZATION_DEFAULTS[key] ?? key.
 */

// ----- Common -----
export const COMMON_BALANCE = 'common_balance';
export const COMMON_BET = 'common_bet';
export const COMMON_OK = 'common_ok';
export const COMMON_SETTINGS = 'common_settings';
export const COMMON_SPIN = 'common_spin';
export const COMMON_TURBO = 'common_turbo';
export const COMMON_TOTAL_WIN = 'common_total-win';

// ----- Controller -----
export const CONTROLLER_TURBO = 'controller_turbo';
export const CONTROLLER_AMPLIFY_BET = 'controller_amplify-bet';
export const CONTROLLER_AUTOPLAY = 'controller_autoplay';
export const CONTROLLER_MENU = 'controller_menu';
export const CONTROLLER_AMPLIFY_BET_DESC0 = 'controller_amplify-bet-desc0';
export const CONTROLLER_AMPLIFY_BET_DESC1 = 'controller_amplify-bet-desc1';
export const CONTROLLER_BALANCE = 'controller_balance';
export const CONTROLLER_BET = 'controller_bet';
export const CONTROLLER_BUY_FEATURE = 'controller_buy-feature';
export const CONTROLLER_REMAINING = 'controller_remaining';
export const CONTROLLER_FREE_SPINS = 'controller_free-spins';

// ----- Menu -----
export const MENU_RULES = 'menu_rules';
export const MENU_HISTORY = 'menu_history';
export const MENU_SETTINGS = 'menu_settings';
export const MENU_DEMO_UNAVAILABLE = 'menu_demo-unavailable';
export const MENU_HISTORY_SPIN = 'menu_history-spin';
export const MENU_HISTORY_CURRENCY = 'menu_history-currency';
export const MENU_HISTORY_BET = 'menu_history-bet';
export const MENU_HISTORY_WIN = 'menu_history-win';
export const MENU_HISTORY_PAGE = 'menu_history-page';
export const MENU_BACKGROUND_MUSIC = 'menu_background-music';
export const MENU_SOUND_FX = 'menu_sound-fx';
export const MENU_SKIP_INTRO = 'menu_skip-intro';

// ----- Header / Win bar -----
export const WINBAR_YOU_WON = 'winbar_you-won';
export const WINBAR_TOTAL_WIN = 'winbar_total-win';

// ----- Popups -----
export const POPUP_SESSION_EXPIRED = 'popup_session-expired';
export const POPUP_INSUFFICIENT_BALANCE = 'popup_insufficient-balance';
export const POPUP_CONFIRM_OK = 'popup_confirm-ok';
export const POPUP_CURRENCY_ERROR = 'popup_currency-error';
export const POPUP_REFRESH = 'popup_refresh';
export const POPUP_BUYFEAT_CARD_TITLE = 'popup_buyfeat-card-title';
export const POPUP_BUYFEAT_RANDOM_SCATTER = 'popup_buyfeat-random-scatter';
export const POPUP_BUYFEAT_START_MULTIPLIER = 'popup_buyfeat-start-multiplier';

// ----- Free Round Manager -----
export const FREEROUND_PANEL_LABEL = 'freeround_panel-label';
export const FREEROUND_REWARD_TITLE = 'freeround_reward-title';
export const FREEROUND_GRANTED_SUBTITLE = 'freeround_granted-subtitle';
export const FREEROUND_SPINS_LABEL = 'freeround_spins-label';
export const FREEROUND_WITH_LABEL = 'freeround_with-label';
export const FREEROUND_SPIN_NOW_BUTTON = 'freeround_spin-now-button';
export const FREEROUND_DONE_TITLE = 'freeround_done-title';
export const FREEROUND_CREDITED_LINE1 = 'freeround_credited-line1';
export const FREEROUND_CREDITED_LINE2 = 'freeround_credited-line2';

// ----- Dialogs -----
export const DIALOG_PRESS_CONTINUE = 'dialog_press-continue';

// ----- Help -----
export const HELP_GAME_RULES_TITLE = 'help_game-rules-title';
export const HELP_GAME_RULES_DESC = 'help_game-rules-desc';
export const HELP_RTP_TITLE = 'help_rtp-title';
export const HELP_MAX_WIN_TITLE = 'help_max-win-title';
export const HELP_PAYOUT_TITLE = 'help_payout-title';
export const HELP_SCATTER_TITLE = 'help_scatter-title';
export const HELP_SCATTER_DESC = 'help_scatter-desc';
export const HELP_FREESPIN_RULES_TITLE = 'help_freespin-rules-title';
export const HELP_BONUS_TRIGGER_TITLE = 'help_bonus-trigger-title';
export const HELP_BONUS_TRIGGER_DESC = 'help_bonus-trigger-desc';
export const HELP_RETRIGGER_TITLE = 'help_retrigger-title';
export const HELP_RETRIGGER_DESC = 'help_retrigger-desc';
export const HELP_TUMBLE_TITLE = 'help_tumble-win';
export const HELP_TUMBLE_DESC = 'help_tumble-desc';
export const HELP_FREESPIN_ROUND_TITLE = 'help_freespin-round-title';
export const HELP_FREESPIN_ROUND_DESC = 'help_freespin-round-desc';
export const HELP_GAME_SETTINGS_TITLE = 'help_game-settings-title';
export const HELP_PAYLINES_TITLE = 'help_paylines-title';
export const HELP_PAYLINES_DESC0 = 'help_paylines-desc0';
export const HELP_PAYLINES_DESC1 = 'help_paylines-desc1';
export const HELP_HOW_PLAY_TITLE = 'help_how-play-title';
export const HELP_BET_CONTROLS_TITLE = 'help_bet-controls-title';
export const HELP_BUTTONS_LABEL = 'help_buttons-label';
export const HELP_BET_CONTROLS_DESC = 'help_bet-controls-desc';
export const HELP_GAME_ACTIONS_TITLE = 'help_game-actions-title';
export const HELP_SPIN_LABEL = 'help_spin-label';
export const HELP_SPIN_DESC = 'help_spin-desc';
export const HELP_BUY_FEATURE_LABEL = 'help_buy-feature-label';
export const HELP_BUY_FEATURE_DESC = 'help_buy-feature-desc';
export const HELP_AMPLIFY_LABEL = 'help_amplify-label';
export const HELP_AMPLIFY_DESC = 'help_amplify-desc';
export const HELP_AUTOPLAY_LABEL = 'help_autoplay-label';
export const HELP_AUTOPLAY_DESC = 'help_autoplay-desc';
export const HELP_TURBO_LABEL = 'help_turbo-label';
export const HELP_TURBO_DESC = 'help_turbo-desc';
export const HELP_DISPLAY_STATS_TITLE = 'help_display-stats-title';
export const HELP_BALANCE_LABEL = 'help_balance-label';
export const HELP_BALANCE_DESC = 'help_balance-desc';
export const HELP_TOTALWIN_LABEL = 'help_totalwin-label';
export const HELP_TOTALWIN_DESC = 'help_totalwin-desc';
export const HELP_BET_LABEL = 'help_bet-label';
export const HELP_BET_DESC = 'help_bet-desc';
export const HELP_GENERAL_CONTROLS_TITLE = 'help_general-controls-title';
export const HELP_SOUNDS_LABEL = 'help_sounds-label';
export const HELP_SOUNDS_DESC = 'help_sounds-desc';
export const HELP_SETTINGS_LABEL = 'help_settings-label';
export const HELP_SETTINGS_DESC = 'help_settings-desc';
export const HELP_INFO_LABEL = 'help_info-label';
export const HELP_INFO_DESC = 'help_info-desc';

export const LOCALIZATION_DEFAULTS: Record<string, string> = {
  [COMMON_BALANCE]: 'Balance',
  [COMMON_BET]: 'Bet',
  [COMMON_OK]: 'OK',
  [COMMON_SETTINGS]: 'Settings',
  [COMMON_SPIN]: 'Spin',
  [COMMON_TURBO]: 'Turbo',
  [COMMON_TOTAL_WIN]: 'Total Win',

  [CONTROLLER_TURBO]: 'Turbo',
  [CONTROLLER_AMPLIFY_BET]: 'Amplify Bet',
  [CONTROLLER_AUTOPLAY]: 'Autoplay',
  [CONTROLLER_MENU]: 'Menu',
  [CONTROLLER_AMPLIFY_BET_DESC0]: 'Double Chance',
  [CONTROLLER_AMPLIFY_BET_DESC1]: 'For Feature',
  [CONTROLLER_BALANCE]: 'Balance',
  [CONTROLLER_BET]: 'Bet',
  [CONTROLLER_BUY_FEATURE]: 'BUY',
  [CONTROLLER_REMAINING]: 'Remaining',
  [CONTROLLER_FREE_SPINS]: 'Free Spin : ',

  [MENU_RULES]: 'Rules',
  [MENU_HISTORY]: 'History',
  [MENU_SETTINGS]: 'Settings',
  [MENU_DEMO_UNAVAILABLE]: 'History is not available in demo mode',
  [MENU_HISTORY_SPIN]: 'Spin',
  [MENU_HISTORY_CURRENCY]: 'Currency',
  [MENU_HISTORY_BET]: 'Bet',
  [MENU_HISTORY_WIN]: 'Win',
  [MENU_HISTORY_PAGE]: 'Page {page} of {total}',
  [MENU_BACKGROUND_MUSIC]: 'Background Music',
  [MENU_SOUND_FX]: 'Sound FX',
  [MENU_SKIP_INTRO]: 'Skip Intro',

  [WINBAR_YOU_WON]: 'YOU WON',
  [WINBAR_TOTAL_WIN]: 'TOTAL WIN',

  [POPUP_SESSION_EXPIRED]: 'Your play session has expired. Please log in again to keep playing. \n\nIf you were actively playing a game, your progress has been saved, and you can pick up right where you left off after relaunching the game.',
  [POPUP_INSUFFICIENT_BALANCE]: 'Insufficient balance.\nYour balance is too low to place this bet.\nPlease add funds or adjust your bet.',
  [POPUP_CONFIRM_OK]: 'OK',
  [POPUP_CURRENCY_ERROR]: 'There was an error with the selected currency.\n\nPlease try refreshing the game or selecting another currency.',
  [POPUP_REFRESH]: 'REFRESH',
  [POPUP_BUYFEAT_CARD_TITLE]: "Nathan's Goolish Gold bonus v",
  [POPUP_BUYFEAT_RANDOM_SCATTER]: 'Random Scatter',
  [POPUP_BUYFEAT_START_MULTIPLIER]: 'Start Multipliers',

  [FREEROUND_PANEL_LABEL]: 'Free\nSpin',
  [FREEROUND_REWARD_TITLE]: 'Free Spin Reward',
  [FREEROUND_GRANTED_SUBTITLE]: 'You have been Granted',
  [FREEROUND_SPINS_LABEL]: 'Spins',
  [FREEROUND_WITH_LABEL]: 'With',
  [FREEROUND_SPIN_NOW_BUTTON]: 'SPIN NOW',
  [FREEROUND_DONE_TITLE]: 'Free Spin Done',
  [FREEROUND_CREDITED_LINE1]: 'has been credited',
  [FREEROUND_CREDITED_LINE2]: 'to your balance',

  [DIALOG_PRESS_CONTINUE]: 'Press anywhere to continue',

  [HELP_GAME_RULES_TITLE]: 'Game Rules',
  [HELP_GAME_RULES_DESC]: 'Wins are awarded for clusters of 5 or more matching symbols connected horizontally or vertically.',
  [HELP_RTP_TITLE]: 'RTP',
  [HELP_MAX_WIN_TITLE]: 'Max Win',
  [HELP_PAYOUT_TITLE]: 'Payout',
  [HELP_SCATTER_TITLE]: 'Scatter',
  [HELP_SCATTER_DESC]: 'SCATTER symbols can appear anywhere on the screen.\nLand 3 or more SCATTER symbols to trigger Free Spins.',
  [HELP_FREESPIN_RULES_TITLE]: 'Free Spin Rules',
  [HELP_BONUS_TRIGGER_TITLE]: 'Bonus Trigger',
  [HELP_BONUS_TRIGGER_DESC]:
    'Land 3 or more {image} SCATTER symbols anywhere on the screen to trigger Free Spins.\n\n' +
    '3 SCATTERS award 10 free spins, 4 SCATTERS award 12 free spins, 5 SCATTERS award 15 free spins, 6 SCATTERS award 20 free spins, and 7 SCATTERS award 30 free spins.',
  [HELP_RETRIGGER_TITLE]: 'In-Bonus Freespin Retrigger',
  [HELP_RETRIGGER_DESC]:
    'During Free Spins, landing 3 or more {image} SCATTER symbols retriggers the feature.\n\n' +
    'Retriggers use the same table as the initial trigger (3->10, 4->12, 5->15, 6->20, 7->30 extra free spins).',
  [HELP_TUMBLE_TITLE]: 'Tumble Win',
  [HELP_TUMBLE_DESC]:
    'After each spin, winning symbols are paid and then removed from the screen. Remaining symbols drop down, and new ones fall from above to fill the empty spaces.\n\n' +
    'Tumbles continue as long as new winning combinations appear - there is no limit to the number of tumbles per spin.\n\n' +
    'All wins are credited to your balance after all tumbles from a base spin are completed.',
  [HELP_FREESPIN_ROUND_TITLE]: 'Free Spins Round',
  [HELP_FREESPIN_ROUND_DESC]:
    'During Free Spins, wins are calculated using the same cluster rules as the base game.\n\n' +
    'Winning tumbles can build multipliers on the winning positions, and those multipliers carry through the feature.\n\n' +
    'Free Spins can be retriggered by landing 3 or more SCATTER symbols.',
  [HELP_GAME_SETTINGS_TITLE]: 'Game Settings',
  [HELP_PAYLINES_TITLE]: 'Paylines',
  [HELP_PAYLINES_DESC0]: 'Symbols can land anywhere on the 7x7 grid.',
  [HELP_PAYLINES_DESC1]:
    'A win is formed by a cluster of 5 or more matching symbols connected horizontally or vertically.\nAfter a win, winning symbols are removed and new symbols tumble in.\nTumbles continue while new wins are formed.\nAll wins are multiplied by your total bet.\nSCATTER symbols award Free Spins.',
  [HELP_HOW_PLAY_TITLE]: 'How to Play',
  [HELP_BET_CONTROLS_TITLE]: 'Bet Controls',
  [HELP_BUTTONS_LABEL]: 'Buttons',
  [HELP_BET_CONTROLS_DESC]: 'Adjust your total bet',
  [HELP_GAME_ACTIONS_TITLE]: 'Game Actions',
  [HELP_SPIN_LABEL]: 'Spin',
  [HELP_SPIN_DESC]: 'Starts the game round.',
  [HELP_BUY_FEATURE_LABEL]: 'Buy Feature',
  [HELP_BUY_FEATURE_DESC]: 'Lets you buy the free spins round for 100x your total bet.',
  [HELP_AMPLIFY_LABEL]: 'Amplify Bet',
  [HELP_AMPLIFY_DESC]: "You're wagering 25% more per spin, but you also have better chances at hitting big features.",
  [HELP_AUTOPLAY_LABEL]: 'Auto Play',
  [HELP_AUTOPLAY_DESC]: 'Opens the autoplay menu. Tap again to stop autoplay.',
  [HELP_TURBO_LABEL]: 'Turbo',
  [HELP_TURBO_DESC]: 'Speeds up the game.',
  [HELP_DISPLAY_STATS_TITLE]: 'Display & Stats',
  [HELP_BALANCE_LABEL]: 'BALANCE',
  [HELP_BALANCE_DESC]: 'Shows your current available credits.',
  [HELP_TOTALWIN_LABEL]: 'TOTAL WIN',
  [HELP_TOTALWIN_DESC]: 'Displays your total winnings from the current round.',
  [HELP_BET_LABEL]: 'BET',
  [HELP_BET_DESC]: 'Adjust your wager using the - and + buttons.',
  [HELP_GENERAL_CONTROLS_TITLE]: 'General Controls',
  [HELP_SOUNDS_LABEL]: 'Sounds',
  [HELP_SOUNDS_DESC]: 'Toggle game sounds on or off.',
  [HELP_SETTINGS_LABEL]: 'Settings',
  [HELP_SETTINGS_DESC]: 'Access gameplay preferences and systems options.',
  [HELP_INFO_LABEL]: 'Info',
  [HELP_INFO_DESC]: 'View game rules, features, and paytable.',
};
