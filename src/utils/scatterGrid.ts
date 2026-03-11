/**
 * Scatter grid utilities (replaces tmp_backend SymbolDetector.getScatterGrids).
 *
 * Backend/API `area` is column-major:
 * - `area[col][row]`
 * - First element in each column = bottom cell, last element = top cell.
 *
 * For gameplay logic and visualization we often want a row-major view:
 * - `grid[row][col]` with row 0 = top.
 */

export interface ScatterGridPosition {
  x: number; // column
  y: number; // row (0 = top)
}

/**
 * Convert backend/API column data into a row-major grid with row 0 = top.
 *
 * Example:
 *   const grid = columnsToRowMajor(area);
 *   // grid[row][col] now matches the visual layout.
 */
export function columnsToRowMajor(columns: number[][]): number[][] {
  if (!Array.isArray(columns) || !columns.length) return [];
  const height = columns[0].length;
  const width = columns.length;
  const grid: number[][] = [];

  for (let rowFromTop = 0; rowFromTop < height; rowFromTop++) {
    const apiRow = height - 1 - rowFromTop; // 0 = bottom in API, 0 = top in grid
    const newRow: number[] = [];
    for (let col = 0; col < width; col++) {
      const column = columns[col];
      newRow.push(Array.isArray(column) ? column[apiRow] : undefined as any);
    }
    grid.push(newRow);
  }

  return grid;
}

/**
 * Find all grid positions where the symbol equals the scatter symbol id.
 *
 * Expects a row-major grid: symbols[row][col] with row 0 = top.
 * Use `columnsToRowMajor(area)` first if you start from backend/API columns.
 */
export function getScatterGrids(
  symbols: number[][],
  scatterSymbolId: number
): ScatterGridPosition[] {
  const result: ScatterGridPosition[] = [];
  for (let row = 0; row < symbols.length; row++) {
    const line = symbols[row];
    if (!Array.isArray(line)) continue;
    for (let col = 0; col < line.length; col++) {
      if (line[col] === scatterSymbolId) {
        result.push({ x: col, y: row });
      }
    }
  }
  return result;
}
