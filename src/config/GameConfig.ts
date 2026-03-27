/**
 * Game Configuration Constants
 * Centralized configuration for the slot game.
 * PACKAGE_5 template: per-game branding lives in GameBranding.ts; edit that file for a new game.
 */

import { PRELOADER_BRANDING } from './GameBranding';

// Re-export branding so existing imports from GameConfig still work
export { CLOCK_DISPLAY_NAME, GAME_DISPLAY_NAME, CLOCK_DISPLAY_CONFIG } from './GameBranding';

/** WinTracker position and icon size (symbol win strip) */
export const WIN_TRACKER_LAYOUT = {
  /** Vertical offset from base position (negative = up, positive = down) */
  offsetY: 210,
  /** Scale of symbol icons in the strip */
  iconScale: 0.1,
} as const;

/** Bonus multiplier overlay placement and fit on each symbol cell */
export const BONUS_MULTIPLIER_LAYOUT = {
  /** Horizontal offset (px) from the center of each cell */
  offsetX: 0,
  /** Vertical offset (px) from the center of each cell */
  offsetY: 0,
  /** Extra fit scale after matching cell size (1 = exact cell fit) */
  scale: 1.1,
} as const;

/**
 * Bonus marker image mapping by mark count.
 * Index 0 = first time a cell is marked (x1), index 1 = second mark (x2), etc.
 * Current art set provides 8 tiers up to x128.
 */
export const BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT: readonly number[] = [1, 2, 4, 8, 16, 32, 64, 128] as const;

/** Bonus marker logic cap (can exceed current image tiers; UI falls back to text if no matching image exists). */
export const BONUS_MULTIPLIER_MAX_VALUE: number = 128;

/** Header layout (win bar position and scale) */
export const HEADER_CONFIG = {
  /** X offset (px) for header area. Positive = right, negative = left. */
  HEADER_OFFSET_X: 0,
  /** Y position (px) of the top edge of header area. 0 = top of screen; positive = lower. */
  HEADER_OFFSET_Y: -2,
  /** Scale multiplier for header area width. 1 = width-fit, < 1 = smaller, > 1 = larger. */
  HEADER_WIDTH_SCALE: 1,
  /** Header area height as ratio of layout width. height = layoutWidth * this. */
  HEADER_LAYOUT_ASPECT_RATIO: 0.35,
  /** Header area container: X scale multiplier. 1 = fit screen width, < 1 = narrower, > 1 = wider. */
  HEADER_CONTAINER_SCALE_X: 0.95,
  /** Header area container: Y scale multiplier. < 1 = shorter, > 1 = taller. */
  HEADER_CONTAINER_SCALE_Y: 0.9,
  /** Header area container: Y offset (px). Positive = down, negative = up. */
  HEADER_CONTAINER_OFFSET_Y: 0,
  /** Header logo: scale multiplier (applied after width-fit). 1 = full width-fit, < 1 = smaller. */
  HEADER_LOGO_SCALE: 0.4,
  /** Header logo: Y offset (px) from top of header area. Positive = down, negative = up. */
  HEADER_LOGO_OFFSET_Y: 0,
  /** Header border (Header_Border): scale multiplier (applied after width-fit). 1 = full width-fit, < 1 = smaller. */
  HEADER_BORDER_SCALE: 1,
  /** Header border: Y offset (px) from top of header area. Positive = down, negative = up. */
  HEADER_BORDER_OFFSET_Y: 70,
  /** Scale multiplier for Header_WinBar. 1 = width-fit, < 1 = smaller, > 1 = larger. */
  WIN_BAR_SCALE: 0.8,
  /** Y offset (px) added to Header_WinBar position. Positive = down, negative = up. */
  WIN_BAR_OFFSET_Y: -10,
  /** Y offset (px) for win bar text (YOU WON / amount). Positive = lower, negative = higher. Applied on top of base position. */
  WIN_BAR_TEXT_OFFSET_Y: 6,
  /** Scale multiplier for win bar label text (YOU WON / TOTAL WIN). 1 = default size, < 1 = smaller, > 1 = larger. */
  WIN_BAR_TEXT_SCALE: 0.9,
  /** Scale multiplier for win bar value text (amount e.g. $0.00). 1 = default size, < 1 = smaller, > 1 = larger. */
  WIN_BAR_TEXT_VALUE_SCALE: 0.9,
} as const;

/** Additional Y offset (px) applied only to BonusHeader win bar text (on top of WIN_BAR_TEXT_OFFSET_Y). Positive = lower, negative = higher. */
export const BONUS_HEADER_WIN_BAR_TEXT_OFFSET_Y = 2;

/** Y offset (px) for bg_border in Background.ts. Positive = down, negative = up from screen center. */
export const BG_BORDER_OFFSET_Y = 180;

/**
 * Base display depth for reel/symbol grid content. bg_border must render above this (see BG_BORDER_DEPTH).
 * Keep in sync with Symbols.ts idle symbol depth.
 */
export const SYMBOL_GRID_BASE_DEPTH = 600;
/** bg_border sits just above the symbol grid so the frame is not covered by symbols. */
export const BG_BORDER_DEPTH = SYMBOL_GRID_BASE_DEPTH + 1;


/** Normal and bonus bottom cover (controller overlay) scale multipliers. */
export const BACKGROUND_COVER_CONFIG = {
  /** Normal game bottom cover: extra width multiplier applied after fit-to-width. */
  NORMAL_WIDTH_MULTIPLIER: 1,
  /** Normal game bottom cover: extra height multiplier applied after height ratio. */
  NORMAL_HEIGHT_MULTIPLIER: 0.6,
  /** Bonus game bottom cover: base width multiplier before BONUS_BG_COVER_SCALE_X. */
  BONUS_WIDTH_MULTIPLIER: 1.2,
  /** Bonus game bottom cover: base height multiplier before BONUS_BG_COVER_SCALE_Y. */
  BONUS_HEIGHT_MULTIPLIER: 1.15,
} as const;

// =============================================================================
// PRELOADER / LOADING SCREEN (structure + branding from GameBranding)
// =============================================================================
export const PRELOADER_CONFIG = {
  /** Background color (hex) for loading screen */
  BACKGROUND_COLOR: 0x10161d,
  /** Vertical offset modifier added to max-win and other elements */
  VERTICAL_OFFSET_MODIFIER: 10,
  /** Progress bar padding in pixels */
  PROGRESS_BAR_PADDING: 3,
  /** Loading frame: Y offset from screen center */
  LOADING_FRAME_OFFSET_Y: 345,
  /** Loading frame: scale multiplier applied after cover-fit */
  LOADING_FRAME_SCALE_MODIFIER: 0.04,
  TAGLINE: PRELOADER_BRANDING.TAGLINE,
  WEBSITE: PRELOADER_BRANDING.WEBSITE,
  MAX_WIN: PRELOADER_BRANDING.MAX_WIN,
  /** Press-to-play button: Y position as ratio of screen height */
  BUTTON_Y_RATIO: 0.77,
  /** Spin button rotation animation duration (ms) */
  SPIN_BUTTON_ROTATION_DURATION_MS: 5000,
  /** Character 1 (left): position ratios and scale */
  CHARACTER_1: { X_RATIO: 0.23, Y_RATIO: 0.61, SCALE: 0.2 },
  /** Character 2 (right): position ratios and scale */
  CHARACTER_2: { X_RATIO: 0.75, Y_RATIO: 0.52, SCALE: 0.3 },
  /** Delay (ms) before creating characters after create() */
  CHARACTER_CREATE_DELAY_MS: 100,
  /** Fullscreen button: base margin and icon scale (multiplied by assetScale at runtime) */
  FULLSCREEN_MARGIN_BASE: 16,
  FULLSCREEN_ICON_SCALE_BASE: 1.5,
} as const;

// =============================================================================
// LOADING SPINNER (in-game spin wait indicator)
// =============================================================================
/** When true, show the loading spinner while fetching spin API. When false, spinner never shows. */
export const LOADING_SPINNER_ENABLED = false;
/** Minimum time (ms) to show the loading spinner when spin is pressed (simulate slow network). Set to 0 to hide as soon as data arrives. */
export const LOADING_SPINNER_SIMULATE_MIN_DISPLAY_MS = 0;
/** Target height of DI JOKER spine as ratio of scene height (e.g. 0.28 = 28%). Used to scale the spine for different screen sizes. */
export const LOADING_SPINNER_SPINE_HEIGHT_RATIO = 0.28;
/** Playback speed of DI JOKER spine animation (1 = normal, 0.5 = half speed, 2 = double speed). */
export const LOADING_SPINNER_SPINE_TIME_SCALE = 0.5;
/** Alpha of the loading spinner (1 = opaque, 0.75 = slightly transparent). */
export const LOADING_SPINNER_ALPHA = 0.75;

// =============================================================================
// IDLE / SESSION TIMEOUT
// =============================================================================
/** Idle / session timeout (minutes); converted to ms where needed. */
export const MAX_IDLE_TIME_MINUTES: number = 5; // 5 minutes (use 0.25 for 15 seconds during testing)

// =============================================================================
// GAME SCENE (main play scene)
// =============================================================================
/** Physics world height = scale.height - this offset */
export const GAME_SCENE_PHYSICS_BOTTOM_OFFSET = 220;
/** Fade-in from black duration (ms) */
export const GAME_SCENE_FADE_IN_DURATION_MS = 1000;

// =============================================================================
// GRID CONFIGURATION
// =============================================================================
export const SLOT_COLUMNS: number = 7; // number of columns (vertical reels)
export const SLOT_ROWS: number = 7; // number of rows (horizontal)

// =============================================================================
// SYMBOL CONFIGURATION
// =============================================================================
export const SCATTER_SYMBOL: number[] = [0];
export const SCATTER_SYMBOL_ID: number = 0;
/** Regular pay symbols (cluster pays) */
export const NORMAL_SYMBOLS: number[] = [1, 2, 3, 4, 5, 6, 7];
export const ALL_SYMBOLS: number[] = [...SCATTER_SYMBOL, ...NORMAL_SYMBOLS];

/** Minimum cluster size to trigger a win (connected horizontally and vertically) */
export const MIN_CLUSTER_SIZE: number = 5;

/** Minimum scatter symbols to trigger Free Spins */
export const MIN_SCATTER_FOR_BONUS: number = 3;

/** Minimum scatter symbols to trigger retrigger during bonus */
export const MIN_SCATTER_FOR_RETRIGGER: number = 3;

/** Scatter count → Free Spins awarded (trigger and retrigger use same table) */
export const SCATTER_FREE_SPINS: Record<number, number> = {
  3: 10,
  4: 12,
  5: 15,
  6: 20,
  7: 30,
};

/** Max win cap as multiplier of bet */
export const MAX_WIN_MULTIPLIER: number = 21000;

/** @deprecated Scatter pays FS only per spec; use SCATTER_FREE_SPINS. Kept for backwards compat. */
export const SCATTER_PAYOUT_MULTIPLIERS: Record<number, number> = {
  4: 3,
  5: 5,
  6: 100,
};

// =============================================================================
// SYMBOL DISPLAY CONFIGURATION
// =============================================================================
export const SYMBOL_CONFIG = {
  /** Display width of each symbol in pixels */
  DISPLAY_WIDTH: 60,
  /** Display height of each symbol in pixels */
  DISPLAY_HEIGHT: 60,
  /** Horizontal spacing between symbols */
  HORIZONTAL_SPACING: 6,
  /** Vertical spacing between symbols */
  VERTICAL_SPACING: 4,
  /** Number of filler symbols during reel spin */
  FILLER_COUNT: 20,
} as const;

// =============================================================================
// TIMING CONFIGURATION
// =============================================================================
export const DELAY_BETWEEN_SPINS: number = 2500;
/** Ratio for time between column starts relative to DELAY_BETWEEN_SPINS */
export const DROP_REEL_START_INTERVAL_RATIO: number = 0.08;

/** Bonus: delay between showing "YOU WON" and "TOTAL WIN" per tumble (ms). */
export const BONUS_TUMBLE_TOTAL_WIN_DELAY_MS: number =1000;

export const TIMING_CONFIG = {
  /** Extended duration for scatter anticipation (ms) */
  EXTEND_DURATION_MS: 3000,
  /** Stagger delay between symbols within a column (ms) */
  SYMBOL_STAGGER_MS: 100,
  /** Stagger delay between columns (ms) */
  COLUMN_STAGGER_MS: 50,
  /** Win dialog auto-close delay (ms) */
  WIN_DIALOG_AUTO_CLOSE_MS: 2500,
  /** Grace period before showing congrats dialog (ms) */
  CONGRATS_GRACE_MS: 1200,
} as const;

/**
 * Reel drop timing.
 * REEL_DROP_DURATION_MULTIPLIER: < 1 = faster symbol drop, > 1 = slower. Default 1.
 */
export const REEL_DROP_DURATION_MULTIPLIER: number = 1;

// =============================================================================
// ANIMATION CONFIGURATION
// =============================================================================
export const ANIMATION_CONFIG = {
  /** Symbol hop height for drop animation */
  SYMBOL_HOP_HEIGHT: 10,
  /** Symbol bounce after landing */
  SYMBOL_BOUNCE_HEIGHT: 5,
  /** Filler symbol bounce after landing */
  FILLER_BOUNCE_HEIGHT: 40,
  /** Time scale for symbol win animations (1 = normal, 0.5 = half speed). Use < 1 to slow down and see the animation clearly. */
  SYMBOL_WIN_ANIM_TIME_SCALE: 0.7,
  /** Delay in ms before playing win animations on cluster win (then win anim → destroy → tumble). */
  CLUSTER_WIN_PRE_ANIM_DELAY_MS: 400,
} as const;

// =============================================================================
// UI CONFIGURATION
// =============================================================================
export const UI_CONFIG = {
  /** Depth layers for UI elements */
  DEPTH: {
    SYMBOLS: 10,
    SYMBOL_OVERLAY: 500,
    WINNING_SYMBOLS: 501,
    CONTROLLER: 900,
    DIALOGS: 1000,
    COIN_ANIMATION: 800,
  },
  /** Controller button configuration */
  BUTTON: {
    DEFAULT_DEPTH: 10,
    ANIMATION_DEPTH: 11,
    SPIN_ANIMATION_SCALE: 0.435,
    AUTOPLAY_ANIMATION_SCALE: 0.16,
  },
} as const;

// =============================================================================
// WIN THRESHOLDS (multipliers of bet amount)
// =============================================================================
export const WIN_THRESHOLDS = {
  /** Threshold for "Big Win" dialog */
  BIG_WIN: 20,
  /** Threshold for "Mega Win" dialog */
  MEGA_WIN: 30,
  /** Threshold for "Epic Win" dialog */
  EPIC_WIN: 45,
  /** Threshold for "Super Win" dialog */
  SUPER_WIN: 60,
  /** Threshold for "Max Win" dialog */
  MAX_WIN: 21000,
} as const;

// =============================================================================
// INITIAL / DEMO GRID
// =============================================================================
/** Default symbols shown on game load (row-major: [row][col]). Used for demo/testing. */
export const INITIAL_SYMBOLS: number[][] = [
  [0, 1, 3, 1, 0, 2, 4],
  [1, 5, 2, 5, 2, 4, 3],
  [2, 5, 5, 1, 5, 3, 1],
  [3, 4, 1, 2, 4, 1, 2],
  [4, 2, 0, 3, 1, 5, 4],
  [1, 3, 2, 4, 5, 2, 6],
  [2, 1, 4, 3, 2, 1, 7],
];

// =============================================================================
// SYMBOL GRID LAYOUT (reel position, mask, overlay)
// =============================================================================
/** Reel/grid center: centerX = scene.scale.width * GRID_CENTER_X_RATIO + GRID_CENTER_X_OFFSET_PX */
export const GRID_CENTER_X_RATIO = 0.5;
export const GRID_CENTER_X_OFFSET_PX = -5;
export const GRID_CENTER_Y_RATIO = 0.52;
export const GRID_CENTER_Y_OFFSET_PX = -65;

export const GRID_MASK_PADDING = { left: 14, right: 14, top: 40, bottom: 20 } as const;
export const GRID_MASK_GRADIENT_FADE_HEIGHT = 24;
export const GRID_OVERLAY_PADDING = { x: 9, y: 8, offsetX: 1, offsetY: 0.7 } as const;

// =============================================================================
// SYMBOL ANIMATION TIMING (ms)
// =============================================================================
export const ANIMATION_STAGGER_MS = 50;
export const SCALE_UP_DELAY_MS = 500;
export const WIN_TEXT_DELAY_MS = 800;
/** Scale for the win amount text that appears on cluster wins during bonus (e.g. 0.7 = 70% size). */
export const WIN_TEXT_SCALE_BONUS = 0.7;
export const SCATTER_SHRINK_DURATION_MS = 350;
export const SCATTER_MOVE_DURATION_MS = 500;
export const SCATTER_GATHER_DURATION_MS = 800;
export const OVERLAY_FADE_IN_DURATION_MS = 300;
export const OVERLAY_FADE_OUT_DURATION_MS = 200;

// =============================================================================
// SYMBOL SCALES (Spine/visual tuning) – centralized; use here only. Offsets applied at call sites if needed.
// =============================================================================
export const SPINE_SYMBOL_SCALES: Record<number, number> = {
  0: 1.1, 1: 0.035, 2: 0.035, 3: 0.035, 4: 0.135, 5: 0.135, 6: 0.135, 7: 0.135,
  8: 0.135, 9: 0.135, 10: 0.135, 11: 0.135, 12: 0.137, 13: 0.137, 14: 0.137, 15: 0.137, 16: 0.137, 17: 0.137, 18: 0.137, 19: 0.137, 20: 0.137, 21: 0.137, 22: 0.137,
};
export const DEFAULT_SPINE_SCALE = 0.6;
export const SPINE_SCALE_ADJUSTMENT = 0.93;
/** Scale for the single merged Symbol0 (scatter) during scatter flow; used in Symbols.ts. */
export const SYMBOL0_MERGE_SCALE = 1;
export const SCATTER_ANIMATION_SCALE = 1.8;
export const SCATTER_GATHER_SCALE = 2.5;

// =============================================================================
// DEBUG / VISUAL (dev toggles – easy to find)
// =============================================================================
/** When true, draw a red border around symbols that are part of a win (cluster/tumble). */
export const SHOW_WIN_BORDER_SYMBOLS: boolean = false;
/** Line width (px) for the win border when SHOW_WIN_BORDER_SYMBOLS is true. Use a smaller value for thinner lines. */
export const WIN_BORDER_LINE_WIDTH = 2;
/** When true, draw a red border around the reel/grid container. */
export const SHOW_REEL_BORDER: boolean = false;
/** When true, draw hitboxes for controller buttons. */
export const SHOW_BUTTON_HITBOXES: boolean = false;
/** When true, draw a red debug border around the full header area (win bar, win text). */
export const SHOW_HEADER_BORDER: boolean = false;
/** When true, draw red debug borders for scatter payout section in HelpScreen (scatter image + header/grid/text). */
export const HELPSCREEN_PAYOUT_SCATTER_DEBUG_LINE: boolean = false;

// =============================================================================
// SYMBOL DEPTH (Z-ordering)
// =============================================================================
export const DEPTH_SYMBOL_DEFAULT = 0;
export const DEPTH_OVERLAY = 500;
export const DEPTH_WINNING_SYMBOL = 600;
export const DEPTH_OVERLAY_CONTAINER = 930;
export const DEPTH_RETRIGGER_SYMBOL = 931;
export const DEPTH_WIN_LINES = 1000;

