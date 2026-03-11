import { SLOT_COLUMNS, SLOT_ROWS } from '../config/GameConfig';

/**
 * Grid Transformation Utilities
 * Handles conversions between row-major and column-major grid representations
 *
 * Grid Orientation Notes:
 * - Row-major: [row][col] - Used by tumble logic and backend SpinData
 * - Column-major: [col][row] - Used by rendering/display
 * - SpinData area uses bottom->top ordering (row 0 = bottom)
 * - Display uses top->bottom ordering (row 0 = top)
 */

/** Default symbol used when padding area to game config size */
const PAD_SYMBOL = 1;

/**
 * Normalize slot.area to the grid size defined in GameConfig (SLOT_COLUMNS x SLOT_ROWS).
 * Pads with PAD_SYMBOL if smaller, crops if larger. Ensures the grid never changes size.
 * @param area slot.area in [column][row] format (may be any size)
 * @returns area of size SLOT_COLUMNS x SLOT_ROWS
 */
export function normalizeAreaToGameConfig(area: number[][] | undefined): number[][] {
  const cols = SLOT_COLUMNS;
  const rows = SLOT_ROWS;
  const result: number[][] = [];

  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    const srcCol = Array.isArray(area) && area[c] ? area[c] : [];
    for (let r = 0; r < rows; r++) {
      let symbolValue = typeof srcCol[r] === 'number' ? srcCol[r] : PAD_SYMBOL;
      // Replace symbols 8 and 9 (multiplier symbols 2x, 3x - not yet implemented) with symbol 0 (scatter)
      // TODO: Remove this filter when multiplier functionality is implemented
      if (symbolValue === 8 || symbolValue === 9) {
        symbolValue = 0;
      }
      col[r] = symbolValue;
    }
    result.push(col);
  }
  return result;
}

/**
 * Convert row-major grid to column-major grid
 * @param rowMajor Grid in [row][col] format
 * @returns Grid in [col][row] format
 */
export function toColumnMajor<T>(rowMajor: T[][]): T[][] {
  if (!rowMajor || rowMajor.length === 0) return [];
  
  const numRows = rowMajor.length;
  const numCols = rowMajor[0]?.length || 0;
  
  const colMajor: T[][] = [];
  for (let col = 0; col < numCols; col++) {
    colMajor[col] = [];
    for (let row = 0; row < numRows; row++) {
      colMajor[col][row] = rowMajor[row][col];
    }
  }
  
  return colMajor;
}

/**
 * Convert column-major grid to row-major grid
 * @param colMajor Grid in [col][row] format
 * @returns Grid in [row][col] format
 */
export function toRowMajor<T>(colMajor: T[][]): T[][] {
  if (!colMajor || colMajor.length === 0) return [];
  
  const numCols = colMajor.length;
  const numRows = colMajor[0]?.length || 0;
  
  const rowMajor: T[][] = [];
  for (let row = 0; row < numRows; row++) {
    rowMajor[row] = [];
    for (let col = 0; col < numCols; col++) {
      rowMajor[row][col] = colMajor[col][row];
    }
  }
  
  return rowMajor;
}

/**
 * Invert vertical order of a grid (flip rows)
 * Used to convert between bottom->top (SpinData) and top->bottom (display) ordering
 * @param grid Grid in either format
 * @returns Grid with rows in reverse order
 */
export function invertVertical<T>(grid: T[][]): T[][] {
  if (!grid || grid.length === 0) return [];
  return [...grid].reverse();
}

/**
 * Invert vertical order within each column (for column-major grids)
 * @param colMajor Grid in [col][row] format
 * @returns Grid with each column's rows reversed
 */
export function invertVerticalColumnMajor<T>(colMajor: T[][]): T[][] {
  if (!colMajor || colMajor.length === 0) return [];
  
  return colMajor.map(column => [...column].reverse());
}

/**
 * Convert SpinData area format to display format
 * SpinData: [col][row] with bottom->top ordering
 * Display: [col][row] with top->bottom ordering
 */
export function spinDataToDisplay<T>(spinDataArea: T[][]): T[][] {
  return invertVerticalColumnMajor(spinDataArea);
}

/**
 * Convert display format to SpinData area format
 * Display: [col][row] with top->bottom ordering
 * SpinData: [col][row] with bottom->top ordering
 */
export function displayToSpinData<T>(displayGrid: T[][]): T[][] {
  return invertVerticalColumnMajor(displayGrid);
}

/**
 * Extract symbol values from a grid of symbol objects
 * @param symbolGrid Grid of symbol objects with symbolValue property
 * @returns Grid of numeric symbol values
 */
export function extractSymbolValues(symbolGrid: any[][]): number[][] {
  if (!symbolGrid || symbolGrid.length === 0) return [];
  
  const numCols = symbolGrid.length;
  const numRows = symbolGrid[0]?.length || 0;
  
  const values: number[][] = [];
  for (let col = 0; col < numCols; col++) {
    values[col] = [];
    for (let row = 0; row < numRows; row++) {
      const obj = symbolGrid[col]?.[row];
      if (obj) {
        // Try to get symbolValue property, fallback to parsing texture key
        const symbolValue = obj.symbolValue ?? 
          (obj.texture?.key?.startsWith('symbol_') 
            ? parseInt(obj.texture.key.replace('symbol_', ''), 10) 
            : -1);
        values[col][row] = symbolValue;
      } else {
        values[col][row] = -1; // Empty cell
      }
    }
  }
  
  return values;
}

/**
 * Get grid dimensions
 */
export function getGridDimensions(grid: any[][]): { cols: number; rows: number } {
  if (!grid || grid.length === 0) {
    return { cols: 0, rows: 0 };
  }
  return {
    cols: grid.length,
    rows: grid[0]?.length || 0,
  };
}

/**
 * Validate grid structure (all columns have same number of rows)
 */
export function isValidGrid(grid: any[][]): boolean {
  if (!grid || grid.length === 0) return false;
  
  const expectedRows = grid[0]?.length;
  if (typeof expectedRows !== 'number') return false;
  
  return grid.every(col => Array.isArray(col) && col.length === expectedRows);
}

/**
 * Create an empty grid of specified dimensions
 */
export function createEmptyGrid<T>(cols: number, rows: number, defaultValue: T): T[][] {
  const grid: T[][] = [];
  for (let col = 0; col < cols; col++) {
    grid[col] = [];
    for (let row = 0; row < rows; row++) {
      grid[col][row] = defaultValue;
    }
  }
  return grid;
}

/**
 * Deep clone a grid
 */
export function cloneGrid<T>(grid: T[][]): T[][] {
  return grid.map(col => [...col]);
}
