/**
 * Spin - Centralized spin mechanics and win matching for cluster pays
 *
 * Contains:
 * - Paytables (symbol and scatter)
 * - Qualifying cluster threshold (5+)
 * - Cluster detection from grid (4-connected)
 * - Win calculation from grid (cluster pays + scatter)
 * - Helpers to interpret backend tumble/out data
 */

import {
  SLOT_COLUMNS,
  SCATTER_FREE_SPINS,
  MAX_WIN_MULTIPLIER,
  MIN_CLUSTER_SIZE,
  NORMAL_SYMBOLS,
  SCATTER_SYMBOL_ID,
} from '../../config/GameConfig';

/** Minimum matching symbol count to qualify as a winning cluster (win dialog, WinTracker, high-count animation) */
export const QUALIFYING_CLUSTER_COUNT = MIN_CLUSTER_SIZE;

/** Regular pay symbols (1-7). Cluster pays apply only to these. */
export const CLUSTER_PAY_SYMBOLS: readonly number[] = NORMAL_SYMBOLS;

/** Valid symbol payout counts (5 through 15) */
export const SYMBOL_PAY_COUNTS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

// -----------------------------------------------------------------------------
// PAYTABLES (bet multipliers; win = multiplier * bet)
// -----------------------------------------------------------------------------

/** Symbol paytable: symbol -> count -> bet multiplier. Counts 5–15. */
export const SYMBOL_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 5: 1.0, 6: 1.5, 7: 1.75, 8: 2.0, 9: 2.5, 10: 5.0, 11: 7.5, 12: 15.0, 13: 35.0, 14: 70.0, 15: 150.0 },
  2: { 5: 0.75, 6: 1.0, 7: 1.25, 8: 1.5, 9: 2.0, 10: 4.0, 11: 6.0, 12: 12.5, 13: 30.0, 14: 60.0, 15: 100.0 },
  3: { 5: 0.5, 6: 0.75, 7: 1.0, 8: 1.25, 9: 1.5, 10: 3.0, 11: 4.5, 12: 10.0, 13: 20.0, 14: 40.0, 15: 60.0 },
  4: { 5: 0.4, 6: 0.5, 7: 0.75, 8: 1.0, 9: 1.25, 10: 2.0, 11: 3.0, 12: 5.0, 13: 10.0, 14: 20.0, 15: 40.0 },
  5: { 5: 0.3, 6: 0.4, 7: 0.5, 8: 0.75, 9: 1.0, 10: 1.5, 11: 2.5, 12: 3.5, 13: 8.0, 14: 15.0, 15: 30.0 },
  6: { 5: 0.25, 6: 0.3, 7: 0.4, 8: 0.5, 9: 0.75, 10: 1.25, 11: 2.0, 12: 3.0, 13: 6.0, 14: 12.0, 15: 25.0 },
  7: { 5: 0.2, 6: 0.25, 7: 0.3, 8: 0.4, 9: 0.5, 10: 1.0, 11: 1.5, 12: 2.5, 13: 5.0, 14: 10.0, 15: 20.0 },
};

/** Scatter: count -> bet multiplier. Per PACKAGE_5 spec, scatter pays FS only; cash multiplier kept for backward compat. */
export const SCATTER_PAYTABLE: Record<number, number> = {
  3: 0, 4: 0, 5: 0, 6: 0, 7: 0, // Scatter awards FS via SCATTER_FREE_SPINS, not cash
};

/** Get free spins awarded for scatter count (3–7). Uses GameConfig.SCATTER_FREE_SPINS. */
export function getScatterFreeSpins(count: number): number {
  return SCATTER_FREE_SPINS[count] ?? 0;
}

/** Get symbol payout multiplier for a given count (before bet). Returns 0 if below qualifying count. */
export function getSymbolPayoutMultiplier(symbol: number, count: number): number {
  if (count < QUALIFYING_CLUSTER_COUNT) return 0;
  const row = SYMBOL_PAYTABLE[symbol];
  if (!row) return 0;
  return row[count] ?? 0;
}

/** Get scatter payout multiplier for a given scatter count (before bet). */
export function getScatterPayoutMultiplier(count: number): number {
  return SCATTER_PAYTABLE[count] ?? 0;
}

/** Cap win at MAX_WIN_MULTIPLIER × bet (2,100× per spec). */
export function capWinByMaxMultiplier(win: number, bet: number): number {
  if (!Number.isFinite(bet) || bet <= 0) return win;
  const cap = bet * MAX_WIN_MULTIPLIER;
  return Math.min(win, cap);
}

// -----------------------------------------------------------------------------
// CLUSTER DETECTION (4-connected on grid)
// -----------------------------------------------------------------------------

/** Grid is column-major: area[col][row] */
export type GridArea = number[][];

export interface Cluster {
  symbol: number;
  count: number;
  positions: { col: number; row: number }[];
}

/**
 * Find all clusters of a pay symbol (1-7) using 4-directional connectivity (no diagonals).
 * Only clusters with 5+ connected symbols qualify. Does not include scatter or multiplier symbols.
 */
export function findClusters(area: GridArea): Cluster[] {
  const clusters: Cluster[] = [];
  const cols = Math.min(area?.length ?? 0, SLOT_COLUMNS);
  const visited = new Set<string>();

  function key(c: number, r: number): string {
    return `${c},${r}`;
  }

  function get(c: number, r: number): number {
    const col = area[c];
    if (!Array.isArray(col)) return -1;
    const val = col[r];
    return typeof val === 'number' ? val : -1;
  }

  // 4-directional connectivity only (left, right, up, down — no diagonals). Clusters of 5+ symbols qualify.
  function dfs(col: number, row: number, symbol: number, positions: { col: number; row: number }[]): void {
    const k = key(col, row);
    if (visited.has(k)) return;
    const v = get(col, row);
    if (v !== symbol) return;
    visited.add(k);
    positions.push({ col, row });
    dfs(col - 1, row, symbol, positions);
    dfs(col + 1, row, symbol, positions);
    dfs(col, row - 1, symbol, positions);
    dfs(col, row + 1, symbol, positions);
  }

  const isClusterSymbol = (s: number) => CLUSTER_PAY_SYMBOLS.includes(s as any);

  /** Get 4-connected components of a set of positions (4-adjacency only). */
  function getFourConnectedComponents(positions: { col: number; row: number }[]): { col: number; row: number }[][] {
    const set = new Set(positions.map((p) => key(p.col, p.row)));
    const components: { col: number; row: number }[][] = [];
    const seen = new Set<string>();
    for (const start of positions) {
      const k = key(start.col, start.row);
      if (seen.has(k)) continue;
      const comp: { col: number; row: number }[] = [];
      const stack = [start];
      while (stack.length > 0) {
        const p = stack.pop()!;
        const pk = key(p.col, p.row);
        if (seen.has(pk)) continue;
        seen.add(pk);
        comp.push(p);
        for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nc = p.col + dc, nr = p.row + dr;
          if (set.has(key(nc, nr))) stack.push({ col: nc, row: nr });
        }
      }
      if (comp.length > 0) components.push(comp);
    }
    return components;
  }

  for (let c = 0; c < cols; c++) {
    const rows = area[c]?.length ?? 0;
    for (let r = 0; r < rows; r++) {
      const sym = get(c, r);
      if (!isClusterSymbol(sym) || visited.has(key(c, r))) continue;
      const positions: { col: number; row: number }[] = [];
      dfs(c, r, sym, positions);
      if (positions.length < QUALIFYING_CLUSTER_COUNT) continue;
      const components = getFourConnectedComponents(positions).filter(
        (comp) => comp.length >= QUALIFYING_CLUSTER_COUNT
      );
      for (const comp of components) clusters.push({ symbol: sym, count: comp.length, positions: comp });
      for (const p of positions) visited.add(key(p.col, p.row));
    }
  }
  return clusters;
}

/**
 * True when at least one qualifying (5+) cluster exists in the provided grid.
 */
export function hasQualifyingClusterInGrid(area: GridArea): boolean {
  return findClusters(area).length > 0;
}

/** Sentinel for empty cell during cascade simulation (not a valid symbol id). */
const CASCADE_EMPTY = -1;

/** Max tumble steps to avoid infinite loops. */
const MAX_CASCADE_STEPS = 20;

export interface CascadeResult {
  tumbles: Tumble[];
  finalArea: GridArea;
  totalWin: number;
}

function cloneArea(area: GridArea): number[][] {
  return (area ?? []).map((col) => (Array.isArray(col) ? [...col] : []));
}

function getGridRows(area: GridArea): number {
  const c0 = area?.[0];
  return Array.isArray(c0) ? c0.length : 0;
}

/**
 * Simulate tumble cascade from current grid state: find 5+ 4-connected clusters,
 * remove them, apply gravity, fill with new symbols, repeat until no wins.
 * Grid is column-major; row 0 = bottom. Used for fake-data so win logic matches demo/normal.
 */
export function simulateTumbleCascade(area: GridArea, bet: number): CascadeResult {
  const cols = Math.min(area?.length ?? 0, SLOT_COLUMNS);
  const rows = Math.max(getGridRows(area), 1);
  const state = cloneArea(area);
  for (let c = 0; c < cols; c++) {
    if (!state[c]) state[c] = [];
    while (state[c].length < rows) state[c].push(CASCADE_EMPTY);
    state[c] = state[c].slice(0, rows);
  }

  const tumbles: Tumble[] = [];
  let totalWin = 0;

  for (let step = 0; step < MAX_CASCADE_STEPS; step++) {
    const clusters = findClusters(state);
    if (clusters.length === 0) break;

    let stepWin = 0;
    const outs: TumbleOut[] = [];
    const removeSet = new Set<string>();

    for (const cl of clusters) {
      const mult = getSymbolPayoutMultiplier(cl.symbol, cl.count);
      const winAmount = mult * bet;
      if (winAmount <= 0) continue;
      stepWin += winAmount;
      outs.push({
        symbol: cl.symbol,
        size: cl.count,
        count: cl.count,
        positions: cl.positions.map((p) => [p.col, p.row] as [number, number]),
        win: { base: winAmount, multiplier: 1, total: winAmount },
      });
      for (const p of cl.positions) removeSet.add(`${p.col},${p.row}`);
    }

    if (outs.length === 0) break;

    totalWin += stepWin;
    const stepTumble: Tumble = { win: stepWin, symbols: { in: [], out: outs } };
    tumbles.push(stepTumble);

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (removeSet.has(`${c},${r}`)) state[c][r] = CASCADE_EMPTY;
      }
    }

    const ins: number[][] = Array.from({ length: cols }, () => []);
    for (let c = 0; c < cols; c++) {
      const column = state[c];
      const fallen: number[] = [];
      for (let r = 0; r < rows; r++) {
        const v = column[r];
        if (v !== CASCADE_EMPTY && v !== undefined && typeof v === 'number') fallen.push(v);
      }
      const emptyCount = rows - fallen.length;
      const newSymbols: number[] = [];
      for (let i = 0; i < emptyCount; i++) {
        newSymbols.push(CLUSTER_PAY_SYMBOLS[Math.floor(Math.random() * CLUSTER_PAY_SYMBOLS.length)]);
      }
      state[c] = [...fallen, ...newSymbols];
      ins[c] = newSymbols;
    }
    (stepTumble.symbols as TumbleSymbols).in = ins;
  }

  return { tumbles, finalArea: state, totalWin };
}

/**
 * Count total scatter symbols (symbol 0) in the grid.
 */
export function countScatters(area: GridArea): number {
  let n = 0;
  const cols = area?.length ?? 0;
  for (let c = 0; c < cols; c++) {
    const col = area[c];
    if (!Array.isArray(col)) continue;
    for (let r = 0; r < col.length; r++) {
      if (col[r] === SCATTER_SYMBOL_ID) n++;
    }
  }
  return n;
}

// -----------------------------------------------------------------------------
// WIN CALCULATION FROM GRID
// -----------------------------------------------------------------------------

export interface EvaluateGridResult {
  /** Cluster wins (symbol, count, win in currency) */
  outs: TumbleOut[];
  /** Total win (cluster + scatter) in currency */
  totalWin: number;
  /** True if at least one qualifying cluster exists */
  hasCluster: boolean;
}

/**
 * Evaluate a grid and compute cluster pays + scatter pay.
 * @param area Column-major grid area[col][row]
 * @param bet Bet amount (win = multiplier * bet)
 */
export function evaluateGrid(area: GridArea, bet: number): EvaluateGridResult {
  const outs: TumbleOut[] = [];
  let totalWin = 0;

  const clusters = findClusters(area);
  for (const cl of clusters) {
    const mult = getSymbolPayoutMultiplier(cl.symbol, cl.count);
    const win = mult * bet;
    if (win > 0) {
      totalWin += win;
      outs.push({ symbol: cl.symbol, count: cl.count, win });
    }
  }

  const scatterCount = countScatters(area);
  const scatterMult = getScatterPayoutMultiplier(scatterCount);
  if (scatterMult > 0) {
    const win = scatterMult * bet;
    totalWin += win;
    outs.push({ symbol: SCATTER_SYMBOL_ID, count: scatterCount, win });
  }

  const hasCluster = outs.some((o) => (o.count ?? 0) >= QUALIFYING_CLUSTER_COUNT && o.symbol !== SCATTER_SYMBOL_ID);

  return { outs, totalWin, hasCluster };
}

export interface TumbleOut {
  symbol?: number;
  count?: number;
  size?: number;
  positions?: Array<[number, number] | { col?: number; row?: number; x?: number; y?: number }>;
  win?: number | { base?: number; multiplier?: number; total?: number; amount?: number; value?: number };
}

export interface TumbleSymbols {
  in?: number[][];
  out?: TumbleOut[];
}

export interface Tumble {
  win?: number;
  symbols?: TumbleSymbols;
}

export interface TumbleResult {
  totalWin: number;
  hasCluster: boolean;
}

/**
 * Resolve the count for a tumble out entry (supports count, size, or positions length).
 */
export function getOutCount(out: TumbleOut | any): number {
  const count = Number(out?.count);
  if (Number.isFinite(count) && count > 0) return count;
  const size = Number(out?.size);
  if (Number.isFinite(size) && size > 0) return size;
  if (Array.isArray(out?.positions)) return out.positions.length;
  return 0;
}

/**
 * Resolve the win amount for a tumble out entry (supports numeric win or win object).
 */
export function getOutWin(out: TumbleOut | any): number {
  const direct = Number(out?.win);
  if (Number.isFinite(direct)) return direct;
  const obj = out?.win;
  if (obj && typeof obj === 'object') {
    const total = Number(obj?.total);
    if (Number.isFinite(total)) return total;
    const base = Number(obj?.base);
    if (Number.isFinite(base)) return base;
    const amount = Number(obj?.amount ?? obj?.value);
    if (Number.isFinite(amount)) return amount;
  }
  return 0;
}

/**
 * Calculate total win from tumbles and detect if any qualifying cluster (count >= QUALIFYING_CLUSTER_COUNT) exists.
 * Tumble wins only count toward total when the tumble has at least 5 matching adjacent (H+V) symbols.
 * Used for win dialog triggering and total win display.
 */
export function calculateTotalWinFromTumbles(tumbles: Tumble[] | any[]): TumbleResult {
  if (!Array.isArray(tumbles) || tumbles.length === 0) {
    return { totalWin: 0, hasCluster: false };
  }
  let totalWin = 0;
  let hasCluster = false;
  for (const tumble of tumbles) {
    const outs = tumble?.symbols?.out || [];
    const tumbleHasQualifying = Array.isArray(outs) && outs.some((o: any) => getOutCount(o) >= QUALIFYING_CLUSTER_COUNT);
    if (tumbleHasQualifying) hasCluster = true;
    if (tumbleHasQualifying) {
      const w = getTumbleTotal(tumble);
      if (Number.isFinite(w) && w > 0) totalWin += w;
    }
  }
  return { totalWin, hasCluster };
}

/**
 * Check if any out in the array represents a qualifying cluster (count >= QUALIFYING_CLUSTER_COUNT)
 */
export function hasQualifyingCluster(outs: TumbleOut[] | null | undefined): boolean {
  if (!Array.isArray(outs) || outs.length === 0) return false;
  return outs.some((o) => getOutCount(o) >= QUALIFYING_CLUSTER_COUNT);
}

/**
 * Check if a single count qualifies as a winning cluster
 */
export function isQualifyingClusterCount(count: number): boolean {
  return Number.isFinite(count) && count >= QUALIFYING_CLUSTER_COUNT;
}

/**
 * Filter outs to only those that qualify for display (count >= QUALIFYING_CLUSTER_COUNT, win > 0)
 */
export function filterQualifyingOuts(
  outs: TumbleOut[] | null | undefined
): TumbleOut[] {
  if (!Array.isArray(outs) || outs.length === 0) return [];
  return outs.filter((o) => {
    const count = getOutCount(o);
    const win = getOutWin(o);
    return (
      Number.isFinite(Number(o?.symbol)) &&
      count >= QUALIFYING_CLUSTER_COUNT &&
      win > 0
    );
  });
}

/**
 * Get set of symbol IDs that have qualifying cluster count in outs (for UI e.g. high-count win animation).
 */
export function getHighCountSymbolsFromOuts(outs: TumbleOut[] | null | undefined): Set<number> {
  const set = new Set<number>();
  if (!Array.isArray(outs) || outs.length === 0) return set;
  for (const o of outs) {
    const c = getOutCount(o);
    const s = Number(o?.symbol);
    if (Number.isFinite(s) && c >= QUALIFYING_CLUSTER_COUNT) set.add(s);
  }
  return set;
}

/**
 * Get total win for a single tumble (tumble.win or sum of symbols.out[].win).
 */
export function getTumbleTotal(tumble: Tumble | any): number {
  const winObj = tumble?.win;
  if (winObj && typeof winObj === 'object') {
    const total = Number((winObj as any)?.total);
    if (Number.isFinite(total) && total > 0) return total;
  }
  const w = Number(tumble?.win ?? 0);
  if (Number.isFinite(w) && w > 0) return w;
  const outs = tumble?.symbols?.out ?? [];
  if (!Array.isArray(outs)) return 0;
  return outs.reduce((sum: number, o: any) => sum + getOutWin(o), 0);
}

/**
 * Sum of count from outs (for validation/debug).
 */
export function getTotalCountFromOuts(outs: TumbleOut[] | null | undefined): number {
  if (!Array.isArray(outs) || outs.length === 0) return 0;
  return outs.reduce((s, o) => s + getOutCount(o), 0);
}

/**
 * Total win from slot's freespin data only (totalWin or sum of items). Use for bonus/congrats dialog when not using cumulative from header.
 */
export function getTotalWinFromFreespinOnly(slot: any): number {
  if (!slot) return 0;
  const fs = slot.freespin || slot.freeSpin;
  if (!fs) return 0;
  if (typeof fs.totalWin === 'number' && fs.totalWin > 0) return fs.totalWin;
  if (fs.items && Array.isArray(fs.items)) {
    return fs.items.reduce((sum: number, item: any) => sum + (item.totalWin || item.subTotalWin || 0), 0);
  }
  return 0;
}

/**
 * Sum win from paylines array.
 */
export function getTotalWinFromPaylines(paylines: any[] | null | undefined): number {
  if (!Array.isArray(paylines) || paylines.length === 0) return 0;
  let total = 0;
  for (const pl of paylines) {
    const w = Number(pl?.win ?? 0);
    if (Number.isFinite(w)) total += w;
  }
  return total;
}

/**
 * Total win from slot: slot.totalWin, or freespin items sum, or paylines + tumbles.
 */
export function getTotalWinFromSlot(slot: any): number {
  if (!slot) return 0;
  if (typeof slot.totalWin === 'number' && slot.totalWin > 0) return slot.totalWin;

  const freespinData = slot.freespin || slot.freeSpin;
  let itemsSum = 0;
  let hasItems = false;

  if (freespinData?.items && Array.isArray(freespinData.items)) {
    hasItems = true;
    itemsSum = freespinData.items.reduce((sum: number, item: any) => {
      const perSpinTotal =
        (typeof item?.totalWin === 'number' && item.totalWin > 0)
          ? item.totalWin
          : (item?.subTotalWin || 0);
      return sum + perSpinTotal;
    }, 0);
  }

  let totalWin = itemsSum;
  try {
    const mvRaw =
      slot?.freeSpin?.multiplierValue ??
      slot?.freespin?.multiplierValue ??
      freespinData?.multiplierValue ??
      0;
    const multiplierValue = Number(mvRaw) || 0;
    if (multiplierValue > 0) totalWin += multiplierValue;
  } catch {}

  if (!hasItems || itemsSum <= 0) {
    totalWin += getTotalWinFromPaylines(slot.paylines);
    if (Array.isArray(slot.tumbles) && slot.tumbles.length > 0) {
      for (const tumble of slot.tumbles) {
        totalWin += getTumbleTotal(tumble);
      }
    }
  }
  return totalWin;
}

/**
 * Spin total for multiplier logic: current freespin item subTotalWin if in bonus, else paylines + tumbles.
 */
export function getSpinTotalFromSpinData(spinData: any): number {
  let spinTotal = 0;
  try {
    const slot = spinData?.slot;
    const fs = slot?.freespin || slot?.freeSpin;
    if (fs?.items && Array.isArray(fs.items)) {
      const currentItem = fs.items.find((item: any) => Number(item?.spinsLeft) > 0);
      const base = Number(currentItem?.subTotalWin);
      if (Number.isFinite(base) && base > 0) spinTotal = base;
    }
    if (spinTotal === 0 && slot) {
      spinTotal += getTotalWinFromPaylines(slot.paylines);
      if (Array.isArray(slot.tumbles)) {
        for (const t of slot.tumbles) spinTotal += getTumbleTotal(t);
      }
    }
  } catch {}
  return spinTotal;
}

/**
 * Resolve spin total from spin data with fallback: match freespin item by area, then paylines + tumbles.
 */
export function getSpinTotalWithFallback(spinData: any): number {
  try {
    const slotAny = spinData?.slot || {};
    const fs = slotAny?.freespin || slotAny?.freeSpin;
    if (fs?.items && Array.isArray(fs.items)) {
      const currentItem = fs.items.find((item: any) => Number(item?.spinsLeft) > 0);
      const base = Number(currentItem?.subTotalWin);
      if (Number.isFinite(base) && base > 0) return base;
    }
    if (Array.isArray(fs?.items) && Array.isArray(slotAny?.area)) {
      const areaJson = JSON.stringify(slotAny.area);
      const matchItem = fs?.items.find((item: any) =>
        Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
      );
      if (matchItem) {
        const raw = (matchItem as any).totalWin ?? (matchItem as any).subTotalWin ?? 0;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    let total = 0;
    if (Array.isArray(slotAny?.paylines)) {
      for (const pl of slotAny.paylines) {
        const w = Number(pl?.win || 0);
        if (Number.isFinite(w)) total += w;
      }
    }
    if (Array.isArray(slotAny?.tumbles)) {
      for (const t of slotAny.tumbles) {
        const w = Number(t?.win ?? 0);
        if (Number.isFinite(w)) total += w;
      }
    }
    return total;
  } catch {}
  return 0;
}
