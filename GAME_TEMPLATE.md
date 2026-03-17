# GAME_TEMPLATE.md - Template Maintenance Guide

This file is the project guide for cloning this game into future titles.
Use this document for all game-specific replacement points (assets, values, text, and rules).

## 1. Quick Clone Checklist

Update in this order:

1. `src/config/GameBranding.ts` for game name and preloader copy.
2. `src/config/AssetConfig.ts` for asset keys and paths.
3. `public/assets/...` files for all replacement art and audio.
4. `src/config/GameConfig.ts` for rules and tuning.
5. `src/game/components/Spin.ts` for paytable math.
6. `src/game/components/MenuTabs/HelpScreen.ts` for player-facing rules text.
7. `src/game/spinDataSample/fake_spin_data.json` and `src/backend/GameAPI.ts` for demo/local data consistency.

## 2. What To Change

### Branding and preloader copy

File: `src/config/GameBranding.ts`

- `CLOCK_DISPLAY_NAME`
- `GAME_DISPLAY_NAME`
- `CLOCK_DISPLAY_CONFIG`
- `PRELOADER_BRANDING`

### Assets and layout

- `src/config/AssetConfig.ts` for key/path mapping
- `src/config/GameConfig.ts` for layout, grid, tuning, thresholds, animation/depth values
  Includes `HEADER_CONFIG.HEADER_CONTAINER_SCALE_X`, `HEADER_CONFIG.HEADER_CONTAINER_SCALE_Y`, `HEADER_CONFIG.HEADER_CONTAINER_OFFSET_Y` for header layout.

### Paytables and win rules

File: `src/game/components/Spin.ts`

- `SYMBOL_PAYTABLE`
- `SCATTER_PAYTABLE`
- `QUALIFYING_CLUSTER_COUNT`
- `CLUSTER_PAY_SYMBOLS`
- `SCATTER_SYMBOL_ID`

#### Tumble win display pattern (base + bonus)

- For each tumble in a spin, the header should display **"YOU WON" + that tumble's win amount** (using the authoritative values from spin data: paylines/tumbles/items as appropriate).
- **Total Win** should only be updated **once per spin, after all tumbles for that spin are finished**:
  - In base game, this happens on `TUMBLE_SEQUENCE_DONE` (single-spin total).
  - In bonus, this happens on `WIN_STOP`, where the spin's total is added into a **cumulative Total Win** and the header shows that accumulated value.
- Do **not** synthesize extra win amounts or re-scale values for display; all visible win numbers must come directly from the backend/demo spin data.

### Help and paytable UI copy

File: `src/game/components/MenuTabs/HelpScreen.ts`

- Rule text
- Payout labels
- Scatter and free-spin text

## 3. What Not To Change (Template Boundaries)

- `src/backend/` is shared template backend integration; do not rework API shapes for skinning.
- `src/event/EventManager.ts` event contracts are shared; do not rename/remove core events casually.
- `src/managers/` should remain API-compatible; tune behavior via config first.
- `src/game/scenes/Game.ts` should keep the scene flow unless the new game truly requires structural changes.

## 4. Image Replacement Map

| What | Replace Files In | Controlled By |
| --- | --- | --- |
| Main background and overlays | `public/assets/portrait/high/background/` and `public/assets/portrait/low/background/` | `src/config/AssetConfig.ts` -> `getBackgroundAssets()` |
| Bonus background | `public/assets/portrait/high/bonus_background/` | `src/config/AssetConfig.ts` -> `getBonusBackgroundAssets()` |
| Header art | `public/assets/portrait/high/header/` | `src/config/AssetConfig.ts` -> `getHeaderAssets()` |
| Header confetti VFX | `public/assets/portrait/high/vfx/Confetti_VFX_PC.*` | `src/config/AssetConfig.ts` -> `getHeaderAssets()` and `src/config/GameConfig.ts` -> `HEADER_CONFIG.CONFETTI_*` |
| Symbol Spine art (scatter + regular) | `public/assets/portrait/high/symbols/Symbol0_PC.*` through `Symbol7_PC.*` | `src/config/AssetConfig.ts` -> `getSymbolAssets()` |
| Bonus grid character overlay (Jimboy) | `public/assets/portrait/high/characters/JimboyBonus_PC.*` | `src/config/AssetConfig.ts` -> `getSymbolAssets()` and `src/game/components/symbols/Symbols.ts` |
| Static symbol icons (help/paytable) | `public/assets/portrait/high/symbols/statics/symbol0.png` through `symbol7.png` | `src/config/AssetConfig.ts` -> `getSymbolAssets()` |
| Bonus marker images | `public/assets/portrait/high/symbols/multiplier_symbols/x1.webp` ... `x128.webp` | `src/config/GameConfig.ts` and `src/config/AssetConfig.ts` |
| Dialog Spine assets | `public/assets/portrait/high/dialogs/` | `src/config/AssetConfig.ts` dialog mapping |
| Buttons and controller icons | `public/assets/controller/portrait/high/` and `public/assets/controller/portrait/low/` | `src/config/AssetConfig.ts` -> `getButtonAssets()` |
| Audio | `public/assets/sounds/` | `src/config/AssetConfig.ts` and `src/managers/AudioManager.ts` |

Notes:
- Keep asset keys stable unless you intentionally update every consumer.
- If file names change, update `AssetConfig.ts` mappings first.
- Scatter reel-drop staged SFX keys are `scatterdrop1` ... `scatterdrop4` in `src/config/AssetConfig.ts`.

## 5. Gameplay Value Replacement Map

| Feature | Where To Change |
| --- | --- |
| Grid size | `src/config/GameConfig.ts` -> `SLOT_COLUMNS`, `SLOT_ROWS` |
| Win cluster threshold | `src/config/GameConfig.ts` -> `MIN_CLUSTER_SIZE` and `src/game/components/Spin.ts` -> `QUALIFYING_CLUSTER_COUNT` |
| Scatter trigger / retrigger thresholds | `src/config/GameConfig.ts` -> `MIN_SCATTER_FOR_BONUS`, `MIN_SCATTER_FOR_RETRIGGER` |
| Free spins by scatter count | `src/config/GameConfig.ts` -> `SCATTER_FREE_SPINS` |
| Maximum win cap | `src/config/GameConfig.ts` -> `MAX_WIN_MULTIPLIER` |
| Symbol paytable | `src/game/components/Spin.ts` -> `SYMBOL_PAYTABLE` |
| Big/Mega/Epic/Super thresholds | `src/config/GameConfig.ts` -> `WIN_THRESHOLDS` |
| Symbol size/spacing | `src/config/GameConfig.ts` -> `SYMBOL_CONFIG` |
| Grid position/mask | `src/config/GameConfig.ts` -> `GRID_*` constants |
| Animation timings | `src/config/GameConfig.ts` -> `TIMING_CONFIG`, `ANIMATION_CONFIG`, and related timing constants |
| Debug toggles | `src/config/GameConfig.ts` -> `SHOW_*` flags (including `SHOW_HEADER_BORDER`) |

### Grid semantics (area -> visual grid)

Backend/demo data (`slot.area` and `src/game/spinDataSample/fake_spin_data.json`) use a **column-major** layout:

```ts
const area = [
  [4, 7, 7, 3, 3, 6, 6], // column 0: top -> bottom
  [0, 7, 6, 7, 2, 7, 7], // column 1
  [7, 0, 3, 1, 5, 5, 6], // column 2
  [0, 6, 5, 5, 7, 4, 6], // column 3
  [1, 1, 5, 5, 6, 4, 3], // column 4
  [6, 5, 5, 7, 4, 6, 5], // column 5
  [2, 6, 2, 3, 1, 5, 6]  // column 6
];

// Helper to view the grid as rows (top -> bottom)
function convertColumnsToGrid(columns: number[][]): number[][] {
  if (!columns.length) return [];

  const height = columns[0].length;
  const width = columns.length;
  const grid: number[][] = [];

  for (let row = 0; row < height; row++) {
    const newRow: number[] = [];
    for (let col = 0; col < width; col++) {
      newRow.push(columns[col][row]);
    }
    grid.push(newRow);
  }

  return grid;
}
```

For the `area` above, the visual grid (top row first) is:

```text
 4  0  7  0  1  6  2
 7  7  0  6  1  5  6
 7  6  3  5  5  5  2
 3  7  1  5  5  7  3
 3  2  5  7  6  4  1
 6  7  5  4  4  6  5
 6  7  6  6  3  5  6
```

**Important grid reference rule:** when documenting or discussing grid coordinates, **row 0 is the top**. That same grid should be read like this:

```text
    c0 c1 c2 c3 c4 c5 c6
r0:  4  0  7  0  1  6  2
r1:  7  7  0  6  1  5  6
r2:  7  6  3  5  5  5  2
r3:  3  7  1  5  5  7  3
r4:  3  2  5  7  6  4  1
r5:  6  7  5  4  4  6  5
r6:  6  7  6  6  3  5  6
```

- Columns are left -> right.
- Rows are top -> bottom (row 0 = top).
- Scatter symbols (Symbol0) are the `0` entries in this grid.

In code, use `toRowMajor(area)` from `src/utils/GridTransform.ts` to obtain the row-major view (`grid[row][col]` with row 0 = top) for logic that expects top-based rows (e.g. scatter detection).

## 6. Scatter Trigger / Retrigger Flow

All scatter flows (normal trigger, scatter retrigger in bonus, and buy-feature trigger) should use **one unified sequence**:

1. **Detect scatters from the final grid**
   - After reels and all tumbles finish, detect Symbol0 on the settled grid:
     - Use `symbolsToUse = slot.area` (base game) or `freeSpinItem.area` (bonus).
     - Convert to row-major with `toRowMajor(symbolsToUse)`.
     - Run `getScatterGrids(grid, SCATTER_SYMBOL_ID)` to get `(col,row)` positions.
   - For retrigger, store these positions (e.g. in `pendingScatterRetrigger.scatterGrids`) and reuse them; do **not** re-derive them from a different grid shape.

2. **Unified animation flow**
   - Entry point: a single controller (`ScatterAnimationManager.runScatterFlow(...)`) used by:
     - normal game trigger,
     - bonus scatter retrigger,
     - buy-feature trigger.
   - Sequence:
     1. **Merge / gather**: convert each Symbol0 at `(col,row)` into a Spine symbol (if needed), move them to the center and bring them to the front.
     2. **Play win animation**: on the merged Symbol0 instances, play `Symbol0_PC_win` (loop).
        - Read the Spine animation duration (e.g. via `skeleton.data.findAnimation('Symbol0_PC_win')`) and hold the scene for ~70% of that duration so the win is clearly visible.
     3. **Show dialog**:
        - After the win hold, show `FreeSpin_PC` (or `FreeSpinRetrigger` for retrigger).
        - When the dialog’s fade-in completes (`dialogFullyDisplayed`), switch the merged Symbol0 to idle (`Symbol0_PC_idle`) so it sits calmly behind the dialog.
     4. **Unmerge on dialog close**:
        - When dialog animations complete (`dialogAnimationsComplete`), run the unmerge animation: shrink merged Symbol0 and move symbols back to their original `(col,row)` cells.

3. **Consistency rules**
   - Do not implement separate scatter flows for normal game, bonus, and buy-feature; they should all call into the same merge → win → hold → dialog → idle → unmerge pipeline.
   - Any future timing tweaks (e.g. making win linger longer) should be applied in the shared controller, not in per-flow hacks.

### MaxWin Cap Flow (`isMaxWin` on free spin item)

When the current free spin item has `isMaxWin: true`, enforce `slot.totalWin` as a hard cap for bonus tumble progression and header display.

1. Determine cap from `spinData.slot.totalWin`.
2. Before each tumble, if accumulated bonus win is already `>= slot.totalWin`, stop remaining tumbles.
3. For each tumble, compute `remaining = slot.totalWin - accumulated`.
4. If `tumbleWin > remaining`, clamp the displayed/accumulated tumble win to `remaining`.
5. If `tumbleWin + accumulated == slot.totalWin`, finish this tumble and stop next tumbles.
6. Header behavior:
   - `YOU WON` shows only the clamped tumble amount needed to reach the cap.
   - `TOTAL WIN` must display exactly `slot.totalWin` once capped/finalized.

Implementation reference:
- Tumble cap/stop logic: `src/game/components/symbols/Symbols.ts` (`applyTumbles`).
- Header clamp/display logic: `src/game/components/BonusHeader.ts` (`TUMBLE_WIN_PROGRESS`, `WIN_STOP`).

## 6. Bonus Marker (Multiplier Spot) Rules

Current setup uses image tiers through x128.

- Marker image mapping by mark count: `src/config/GameConfig.ts` -> `BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT`
- Marker logic cap: `src/config/GameConfig.ts` -> `BONUS_MULTIPLIER_MAX_VALUE`
- Marker image loading: `src/config/AssetConfig.ts` -> `getSymbolAssets()`
- Marker rendering and progression: `src/game/components/symbols/SymbolMarker.ts`
- Bonus tumble multiplier application: `src/game/components/symbols/Symbols.ts`

If adding tiers (example x256):

1. Add files under `public/assets/portrait/high/symbols/pastry_cub_symbols/multiplier_symbols/`.
2. Extend `BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT`.
3. Increase `BONUS_MULTIPLIER_MAX_VALUE`.

## 7. Text and Rules Sync

Always keep player-facing text aligned with mechanics.

- Branding text: `src/config/GameBranding.ts`
- Help/rules text: `src/game/components/MenuTabs/HelpScreen.ts`

If mechanics change, sync these values in copy:
- scatter trigger count
- scatter retrigger count
- free-spin award table
- cluster threshold
- bonus marker and multiplier behavior

## 8. Demo and Backend Data Sync

- Demo payloads: `src/game/spinDataSample/fake_spin_data.json`
- Max win test payload: `src/game/spinDataSample/max_win_data.json` (enable with `?useMaxWin=true`)
- Sample data selector: `?sampleData=<file_base_name>` (aliases: `?useFakeData=true`, `?useMaxWin=true`)
- Parsing/normalization: `src/backend/GameAPI.ts`
- Demo state source and helpers: `src/backend/GameAPI.ts` -> `getDemoState()`, `getDemoBalance()`, `updateDemoBalance()`
- Game identifier used in backend/demo spin payloads: `src/backend/GameAPI.ts` -> `GAME_ID` (placeholder value; update per target game integration)

When symbol IDs, grid size, or payout logic changes, verify demo payloads still match expected shape.

Demo mode reference behavior for template ports:
- Enable with `?demo=true` in URL.
- `initializeGame()` should allow demo startup without requiring auth token.
- Demo spin path uses analytics endpoint; normal play uses slots bet endpoint.
- Demo balance is local/mock and should stay in sync with bet deductions and base-game wins.
- History should not call backend in demo mode (show demo-safe empty state/message).
- Demo UI should append `| DEMO` in clock suffix where applicable.
- Demo storage cleanup should remove `demo` from both `localStorage` and `sessionStorage`.

## 9. Required Validation After Template Changes

1. Confirm all assets load without missing-texture warnings.
2. Run a base spin and verify cluster and win text behavior.
3. Trigger bonus and verify marker spots persist only during bonus.
4. Verify marker steps show correct tiers: x1 -> x2 -> x4 -> ... -> x128.
5. Verify help text matches implemented rules.
6. Verify no old-game naming remains in UI copy.

## 10. Update Policy

Whenever a new replace point is introduced (new folder, constant, rule source), update this file in the same PR.
