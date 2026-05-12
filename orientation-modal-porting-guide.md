# Mobile viewport and orientation gate porting guide

`thats_bait/` is the baseline for the shared **viewport pipeline** (visible sizing, orientation blocking,
Phaser bridge). **`oppals/`** ships the **canonical orientation gate visuals** as of this doc: green accent
(`#66D449`), SVG arc + explicit polygon arrowhead, synchronized loop animations, and a phone icon that
**tints green in portrait** and returns to white in landscape.

When porting **presentation**, copy from **`oppals/public/style.css`** (all gate-related blocks, including
phone paint keyframes) and from **`ensureGate()`** in **`oppals/src/bootstrap/MobileViewport.ts`**. Keep
viewport mechanics aligned with the `thats_bait` pattern described below.

The old approach treated the orientation modal as the main feature. That was too fragile. The reliable
implementation is split into three responsibilities:

1. A bootstrap viewport manager that owns real visible viewport sizing.
2. A generated document-level orientation gate that blocks play when a phone-like device is landscape.
3. A Phaser bridge that registers each Phaser game with the manager and refreshes scale after browser
   viewport changes.

Do not port only the overlay. The canvas sizing and delayed Phaser refresh ladder are the part that keeps
iPhone Safari, Android Chrome/WebView, embedded iframes, and dynamic browser toolbars stable.

---

## Source files

### Core pipeline (`thats_bait` pattern)

| File | Role |
| --- | --- |
| `src/bootstrap/MobileViewport.ts` | Single owner for viewport sizing, phone-like detection, generated orientation gate, input blocking, QA helpers, iframe `postMessage`, and Phaser refresh scheduling. |
| `src/main.tsx` | Imports `./bootstrap/MobileViewport` before React mounts. |
| `src/game/main.ts` | Calls `registerMobileViewportGame(game, { parent })` after Phaser is created or restarted. |
| `public/style.css` | CSS contract for the shell, generated gate, safe-area padding, and viewport CSS variables. |
| `index.html` | Uses the same viewport CSS variables for the background and boot loader so first paint and runtime sizing agree. |

### Orientation gate visuals (`oppals`) — **canonical fixed version**

| Location | Role |
| --- | --- |
| `oppals/src/bootstrap/MobileViewport.ts` → `ensureGate()` | Gate DOM: phone + **SVG arc** (`stroke="#66D449"`) + **`<polygon>` arrowhead** in `<g>` with `transform` (**no** SVG `<marker>` on arcs). Title/copy. Set iframe `game: 'oppals'` (or your slug) when copying. |
| `oppals/public/style.css` | Gate scrim (green radial), **`.mobile-orientation-gate__circ-wrap`** glow, **`--gate-loop-duration`**, `tb-gate-seq-phone` + **paint/detail** keyframes, `tb-gate-seq-circ-fade`, `tb-gate-seq-circ-spin`, reduced-motion (motion off + **static white phone**). |

---

## Canonical gate specification (`oppals`)

These details match the **fixed** **`oppals`** gate so ports stay visually and behaviorally aligned.

### Palette

- **Accent / stroke / arrow / portrait phone:** `#66D449` (RGB `102, 212, 73`).
- **Landscape phone:** white outline / light fills as defined in `.mobile-orientation-gate__phone` base styles.
- **Fullscreen scrim:** dark base `rgba(2, 7, 12, 0.88)` plus a soft **green radial** behind the panel content, e.g. `rgba(102, 212, 73, ~0.18)` at the radial stop (see `.mobile-orientation-gate`).
- **Ring glow:** stacked **`drop-shadow`** on `.mobile-orientation-gate__circ-wrap` using the same green hue (inner bright + outer soft halo). **Do not** put `filter` on the stroked `<path>` — it can hide markers or fight compositing; glow the **wrapper** instead.

### SVG structure (inside `ensureGate()`)

1. **Arc:** single `<path>` — partial circle with a gap (reference: `d="M 50 13 A 37 37 0 1 1 13 50"`), **`stroke="#66D449"`**, rounded caps, **no markers**.
2. **Arrowhead:** sibling `<g class="mobile-orientation-gate__circ-arrow">` + `<polygon fill="#66D449">` with **`transform`**, **not** `<marker>`.
3. **Placement / direction:** anchor at path **start** `(50, 13)` with **`rotate(180)`** so the tip follows **counter-clockwise** motion along the arc, matching **`.mobile-orientation-gate__circ-spin`** (`rotate(-360deg)` per loop).
4. **Phone:** CSS-drawn frame (`::before` notch, `::after` home pill), **`z-index`** above `.circ-wrap`.

### Phone body accent (portrait = green)

Synced to the **same** `--gate-loop-duration` as the rotation keyframes:

| Animation | Target | Purpose |
| --- | --- | --- |
| `tb-gate-seq-phone-paint` | `.mobile-orientation-gate__phone` | `border-color`, `background`, `box-shadow` — **green** during the portrait hold, **white** in landscape; **crossfade** into green (~21%→28%) as rotation settles to portrait, **crossfade** back (~61%→69%) before returning to landscape. |
| `tb-gate-seq-phone-detail` | `::before` (notch) | Background fades white ↔ `#66D449` on the same percentages. |
| `tb-gate-seq-phone-detail-solid` | `::after` (home button) | Solid white ↔ `#66D449` on the same percentages. |

Apply **`tb-gate-seq-phone`** and **`tb-gate-seq-phone-paint`** together on the phone element (two comma-separated animations). Pseudo-elements each run their own animation with **`var(--gate-loop-duration)`**.

### Animation sync

- **`--gate-loop-duration`** on `.mobile-orientation-gate__icon` — single timeline for icon, phone, and ring.
- **`tb-gate-seq-phone`:** phone tilts landscape → portrait → landscape (transform only).
- **`tb-gate-seq-phone-paint`** (+ detail keyframes): phone **colors** track portrait vs landscape as above.
- **`tb-gate-seq-circ-fade`:** ring group fades in/out on the same timeline.
- **`tb-gate-seq-circ-spin`:** **exactly one full CCW revolution per loop** (`0deg` → `-360deg`), duration `var(--gate-loop-duration)`.
- **`prefers-reduced-motion`:** stop phone + ring animations; reset phone border/background/shadow and notch/home backgrounds to the static white styling (see existing media query).

---

## Required TypeScript bootstrap

Import the manager in the earliest browser entry, before React renders:

```ts
import './bootstrap/MobileViewport';
```

For React/Vite games in this repository, that is usually `src/main.tsx`.

The manager creates the orientation gate itself. Do not add static modal markup to `index.html`.

---

## Required Phaser bridge

In the Phaser startup file, import the registration function:

```ts
import { registerMobileViewportGame } from '../bootstrap/MobileViewport';
```

After creating the Phaser game, register it:

```ts
let mobileViewportCleanup: (() => void) | null = null;

const rebindPerGameHandlers = () => {
  try { mobileViewportCleanup?.(); } catch {}
  mobileViewportCleanup = registerMobileViewportGame(game, { parent });
};
```

Call `rebindPerGameHandlers()` after the first game creation and after any game restart. Before destroying
an old game during a restart, call the cleanup:

```ts
try { mobileViewportCleanup?.(); } catch {}
mobileViewportCleanup = null;
```

The registration handles:

- `fullscreenTarget = #root`
- `screen.orientation.lock('portrait')` when the browser allows it
- canvas touch gesture suppression
- touch-safe styles on `#root`, `#game-container`, and the canvas
- `game.scale.refresh()` after viewport changes
- cleanup when the Phaser game is destroyed

---

## Required CSS contract

Every game shell must keep this chain intact:

```css
html,
body,
#root,
#app,
#game-container {
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}
```

The source CSS also defines these variables:

```css
:root {
  --tb-viewport-width: 100vw;
  --tb-viewport-height: 100dvh;
  --tb-viewport-left: 0px;
  --tb-viewport-top: 0px;
}
```

`MobileViewport.ts` updates those variables from `window.visualViewport` whenever possible. The generated
gate, boot loader, background, `#root`, `#app`, and `#game-container` should all derive from the same values.

Do not leave games with only `#app { height: 100vh; }`. That is one of the common causes of failures after
rotation and toolbar changes.

---

## Required HTML shell behavior

The boot loader and fixed background should use the viewport variables:

```css
width: var(--tb-viewport-width, 100dvw);
height: var(--tb-viewport-height, 100dvh);
```

This keeps first paint, runtime sizing, and iframe sizing consistent. The manager still applies inline
pixel sizes at runtime, but the HTML/CSS fallback must be correct before JavaScript completes.

### Fullscreen background image (`index.html`)

Games often place a fixed **`background-container`** (with an `<img>` WebP) **behind** `#root` so letterboxing
around a `Phaser.Scale.FIT` canvas shows art instead of empty UI chrome.

**Stacking rule (easy to get wrong):** do **not** set **`z-index: -1`** on `.background-container` when the
shell gives **`body`** an opaque **`background-color`** (common in `public/style.css`, e.g. `#000000`).
Negative z-index fixed descendants can paint **behind the body’s own background**, so the image **never
shows**—only black appears in transparent / letterboxed regions. This looks like a missing asset or broken
viewport CSS even though the network request succeeds.

**Correct pattern** (matches **`oppals/index.html`**):

- **`.background-container { z-index: 0; }`** — sits above the body fill but below the game.
- **`#root { z-index: 1; }`** — already in shared shell CSS so React + Phaser stay on top.

Viewport sizing for that layer should still use **`var(--tb-viewport-width)` / `var(--tb-viewport-height)`**
(or `100dvw` / `100dvh` fallbacks). `MobileViewport.ts` also applies inline **`top` / `left` / width /
height** to `.background-container` on sync; that does not replace the z-index requirement above.

---

## What the manager does

- Detects visible viewport size using `window.visualViewport` with `innerWidth/innerHeight` fallback.
- Updates `--tb-viewport-*` CSS variables.
- Applies pixel dimensions to `body`, `#root`, `#app`, and `#game-container`.
- Resizes `.background-container`, `#boot-loader`, and the generated gate to the visible viewport.
- Detects phone-like devices by mobile UA, iPadOS touch behavior, or coarse pointer/no-hover dimensions.
- Shows the gate when a phone-like device is landscape.
- Blocks pointer, touch, mouse, keyboard, wheel, and context-menu input while the gate is open.
- Sets `#root.inert` while blocked where supported.
- Calls `game.scale.refresh()` immediately and after `60`, `160`, `320`, `640`, and `1000` ms.
- Emits `tb-mobile-viewport:change`.
- Emits legacy `orientation-modal:change` so older game code can keep working during migration.
- Sends `postMessage({ type: 'dijoker:game-orientation', ... })` to the parent page when embedded in an iframe (includes a `game` string — use your title slug, e.g. `'oppals'` in this project).

The iframe message matters for launchers. A game-side overlay can only cover the iframe. If a provider wants
the rotate screen to cover the whole browser viewport, the parent launcher must listen for that message and
render its own overlay.

---

## QA helpers

The manager exposes these helpers on `window`:

| Helper | Effect |
| --- | --- |
| `window.tbMobileViewport.sync()` | Re-read viewport state and refresh registered Phaser games. |
| `window.showOrientationGate()` | Force-show the generated gate. |
| `window.hideOrientationGate()` | Force-hide the generated gate. |
| `window.useAutomaticOrientationGate()` | Return to automatic phone-landscape detection. |
| `window.tbSetDesktopUi(true)` | Persistently disable phone-style blocking. |
| `window.tbSetDesktopUi(false)` | Clear the desktop override. |
| `window.tbSetPhoneUi(true)` | Persistently force phone-style blocking, useful for tablet QA. |
| `window.tbSetPhoneUi(false)` | Clear the phone override. |

Compatibility aliases also exist: `showOrientationModal()`, `hideOrientationModal()`, and
`syncOrientationModal()`.

The persistent keys are `tb_force_desktop_behavior` and `tb_force_phone_ui`.

---

## Porting checklist

1. Copy `src/bootstrap/MobileViewport.ts`. For **matching canonical visuals**, mirror **`oppals`** `ensureGate()` (SVG arc, polygon arrow `transform`, `#66D449` strokes/fills) and set iframe `game` to your slug.
2. Import it from the earliest browser entry.
3. Register the Phaser game with `registerMobileViewportGame(game, { parent })`.
4. Remove older duplicated `visualViewport`, `orientationchange`, `fullscreenTarget`, and canvas touch code
   from the game startup file.
5. Copy shell CSS + gate CSS from **`oppals/public/style.css`**: viewport chain, `.mobile-orientation-gate` green scrim, **`--gate-loop-duration`**, **`tb-gate-seq-phone`**, **`tb-gate-seq-phone-paint`**, **`tb-gate-seq-phone-detail`**, **`tb-gate-seq-phone-detail-solid`**, **`tb-gate-seq-circ-fade`**, **`tb-gate-seq-circ-spin`**, circ-wrap / icon rules, and reduced-motion overrides (motion + **static white phone colors**).
6. Update `index.html` boot loader/background sizing to use the viewport variables. If you use a `.background-container` image behind `#root`, set **`z-index: 0`** on the container (not `-1`) whenever **`body`** has an opaque background—otherwise the image paints behind the body and disappears (see **Fullscreen background image** above).
7. Keep the Phaser config as fixed portrait art size with `Phaser.Scale.FIT`.
8. Build and verify in direct URL and staging iframe.

---

## Verification checklist

- Physical iPhone: portrait loads normally; landscape shows the gate; rotating back hides it.
- Physical Android: same behavior, including Chrome/WebView dynamic toolbar changes.
- iPhone Safari: address bar/toolbars changing height do not leave the canvas cropped or offset.
- Android Chrome/WebView: rotate quickly several times; canvas returns to correct size.
- Staging launcher iframe: gate covers the iframe and the parent receives `dijoker:game-orientation`.
- While blocked, taps, keys, wheel, and context-menu do not spin or interact with the game.
- `showOrientationGate()`, `hideOrientationGate()`, and `useAutomaticOrientationGate()` work from DevTools.
- `tbSetDesktopUi(true)` disables automatic blocking until cleared.
- `tbSetPhoneUi(true)` forces blocking on tablet/devtools QA until cleared.
- Production build passes.
- **Canonical `oppals` visuals:** accent **`#66D449`** on arc + arrow + portrait-phase phone; green radial scrim + ring glow; arrow CCW sync; phone **green in portrait** / **white in landscape** with fades; one **`--gate-loop-duration`** across phone paint + ring + spin.
- **Letterbox / shell:** fullscreen **`background-container`** WebP (or equivalent) is visible in FIT letterboxing — not hidden behind **`body`** due to **`z-index: -1`** when **`body`** has a solid **`background-color`**.

