/**
 * Type definitions for the Symbols component
 * Provides strong typing for better IDE support and error catching.
 * Win/tumble evaluation types (TumbleOut) are canonical in Spin.ts; re-exported here for compatibility.
 */

import type { Game } from '../../scenes/Game';
import { TumbleOut } from '../Spin';

/** Re-export from Spin (single source of truth for win/tumble evaluation) */
export type { TumbleOut } from '../Spin';

// ============================================================================
// GRID TYPES
// ============================================================================

/**
 * Represents a position in the symbol grid
 * Note: Uses x/y naming for API compatibility, but represents col/row internally
 */
export interface GridPosition {
  /** Column index (0-based, left to right) */
  x: number;
  /** Row index (0-based, top to bottom) */
  y: number;
}

/**
 * Represents a grid position with explicit col/row naming
 */
export interface CellPosition {
  col: number;
  row: number;
}

/**
 * Mock data shape used for symbol/tumble flow (replaces tmp_backend Data).
 */
export interface SpinMockData {
  symbols: number[][];
  balance?: number;
  bet?: number;
  freeSpins?: number;
  delayBetweenSpins?: number;
  scatterIndex?: number;
  wins?: { allMatching?: Map<number, Array<{ x: number; y: number }>> };
}

// ============================================================================
// SYMBOL TYPES
// ============================================================================

/**
 * Base interface for any symbol object (Sprite or Spine)
 * Uses 'any' internally but provides structure for common operations
 */
export interface SymbolObject {
  x: number;
  y: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
  depth?: number;
  visible?: boolean;
  active?: boolean;
  destroyed?: boolean;
  
  // Optional Phaser methods
  destroy?: () => void;
  setScale?: (x: number, y?: number) => void;
  setAlpha?: (alpha: number) => void;
  setOrigin?: (x: number, y: number) => void;
  setVisible?: (visible: boolean) => void;
  setDepth?: (depth: number) => void;
  setTint?: (color: number) => void;
  clearTint?: () => void;
  setBlendMode?: (mode: number) => void;
  
  // Spine-specific properties
  animationState?: SpineAnimationState;
  skeleton?: SpineSkeleton;
  
  // Custom properties added at runtime
  symbolValue?: number;
  texture?: { key: string };
  parentContainer?: Phaser.GameObjects.Container;
  displayWidth?: number;
  displayHeight?: number;
  
  // Internal tracking properties
  __overlayImage?: any;
  __winText?: any;
  __gridCol?: number;
  __gridRow?: number;
  __pausedMultiplierWin?: { base: string };
  __bounceTween?: any;
}

/**
 * Spine animation state interface
 */
export interface SpineAnimationState {
  setAnimation?: (track: number, name: string, loop: boolean) => SpineTrackEntry | null;
  addAnimation?: (track: number, name: string, loop: boolean, delay: number) => SpineTrackEntry | null;
  clearTracks?: () => void;
  getCurrent?: (track: number) => SpineTrackEntry | null;
  addListener?: (listener: SpineAnimationListener) => void;
  removeListener?: (listener: SpineAnimationListener) => void;
  timeScale?: number;
}

/**
 * Spine track entry interface
 */
export interface SpineTrackEntry {
  animation?: { name: string; duration: number };
  timeScale?: number;
  trackTime?: number;
}

/**
 * Spine animation listener interface
 */
export interface SpineAnimationListener {
  complete?: (entry: SpineTrackEntry) => void;
  start?: (entry: SpineTrackEntry) => void;
  end?: (entry: SpineTrackEntry) => void;
}

/**
 * Spine skeleton interface
 */
export interface SpineSkeleton {
  data?: {
    findAnimation?: (name: string) => { duration: number } | null;
  };
  setToSetupPose?: () => void;
}

// ============================================================================
// TUMBLE TYPES
// ============================================================================

/**
 * Represents a single tumble step
 */
export interface TumbleData {
  symbols: {
    /** New symbols to drop in (per column) */
    in: number[][];
    /** Symbols to remove */
    out: TumbleOut[];
  };
  /** Total win for this tumble */
  win: number;
}

/**
 * Tracks which cells should be removed in a tumble
 */
export type RemovalMask = boolean[][];

// ============================================================================
// FREE SPIN AUTOPLAY TYPES
// ============================================================================

/**
 * Pending free spins data from scatter bonus activation
 */
export interface PendingFreeSpinsData {
  scatterIndex: number;
  actualFreeSpins: number;
  isRetrigger?: boolean;
  fromUnresolvedSpin?: boolean;
}

/**
 * Pending scatter retrigger data
 */
export interface PendingScatterRetrigger {
  scatterGrids: GridPosition[];
}

// ============================================================================
// OVERLAY TYPES
// ============================================================================

/**
 * Restoration entry for symbols lifted to overlay container
 */
export interface OverlayRestoreEntry {
  obj: SymbolObject;
  parent: Phaser.GameObjects.Container | null;
  x: number;
  y: number;
}

// ============================================================================
// GRID BOUNDS
// ============================================================================

/**
 * Represents the bounds of the symbol grid
 */
export interface GridBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Grid dimension configuration
 */
export interface GridConfig {
  displayWidth: number;
  displayHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  slotX: number;
  slotY: number;
  totalGridWidth: number;
  totalGridHeight: number;
}

/**
 * Calculated positions for symbol placement
 */
export interface SymbolPositionConfig extends GridConfig {
  symbolTotalWidth: number;
  symbolTotalHeight: number;
  startX: number;
  startY: number;
}

// ============================================================================
// CALLBACK TYPES
// ============================================================================

/**
 * Callback for first win notification during tumble
 */
export type FirstWinCallback = (tumbleTotal: number) => void;

/**
 * Symbol iteration callback
 */
export type SymbolIteratorCallback = (
  symbol: SymbolObject,
  col: number,
  row: number
) => void;
