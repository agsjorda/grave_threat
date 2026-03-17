/**
 * Game branding and preloader copy (PACKAGE_5 template).
 * For a new game: replace this file or edit these values only.
 * Backend and game flow stay unchanged.
 */

// =============================================================================
// BRANDING
// =============================================================================
/** Name shown beside the clock (top-right) */
export const CLOCK_DISPLAY_NAME = 'DiJoker';
/** Game name shown after the time (e.g. " | Pastry Cub") */
export const GAME_DISPLAY_NAME = 'Grave Threat';

/** Clock + branding text position and style (used in Preloader and Game) */
export const CLOCK_DISPLAY_CONFIG = {
  offsetX: 5,
  offsetY: 5,
  fontSize: 16,
  fontFamily: 'poppins-regular',
  color: '#FFFFFF',
  alpha: 0.5,
  depth: 30000,
  scale: 0.7,
  additionalTextOffsetX: 5,
  additionalTextOffsetY: 0,
  additionalTextScale: 0.7,
  additionalTextColor: '#FFFFFF',
  additionalTextFontSize: 16,
  additionalTextFontFamily: 'poppins-regular',
} as const;

// =============================================================================
// PRELOADER COPY (tagline, website, max win text)
// =============================================================================
export const PRELOADER_BRANDING = {
  TAGLINE: {
    TEXT: 'PLAY LOUD. WIN WILD. DIJOKER STYLE',
    OFFSET_X: -5,
    OFFSET_Y: 375,
    FONT_SIZE_PX: 14,
  },
  WEBSITE: {
    TEXT: 'www.dijoker.com',
    OFFSET_Y: 400,
    FONT_SIZE_PX: 14,
  },
  MAX_WIN: {
    TEXT: 'Win up to 21,000x',
    OFFSET_Y_FROM_CENTER: 145,
    FONT_SIZE_PX: 32,
    BREATHING_DURATION_MS: 800,
    BREATHING_SCALE_FROM: 0.9,
    BREATHING_SCALE_TO: 0.95,
  },
} as const;
