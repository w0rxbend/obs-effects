You are refactoring an existing PixiJS-based frontend project used to generate multiple OBS browser-source pages.

Primary goal:
Improve folder structure, remove duplication, standardize page implementation, and keep each OBS page isolated.

Important constraint:
Do not merge all pages into one runtime application.
Each OBS page must remain independently loadable as its own browser-source page.
Each page should still be easy to open directly in OBS as a standalone URL or HTML entrypoint.

Current problem:

- Poor folder structure.
- Many duplicated PixiJS setup patterns.
- Repeated CSS, JS, asset loading, scene initialization, animation loops, resize handling, config parsing, and utility logic.
- Pages are isolated, which is good and must be preserved.
- The project lacks consistent conventions for page layout, naming, shared utilities, and reusable rendering primitives.

Target architecture:
Keep isolated pages, but introduce shared internal libraries.

Each page should own: - Its page-specific entrypoint. - Its local configuration. - Its local scene composition. - Its local styles if needed. - Its local assets if they are unique.

Shared code should own: - PixiJS app/bootstrap logic. - OBS/browser-source helpers. - Resize handling. - Asset loading helpers. - Animation/ticker utilities. - Common UI primitives. - Shared effects. - Shared constants. - Type definitions. - Common CSS reset/theme variables. - Logging/debug helpers.

---

## Completed

### Iteration 6 (2026-06-20): createPage() factory + mass migration
- [x] Created `src/lib/createPage.ts` — single-call PixiJS page bootstrap
- [x] Migrated 179 of ~202 PixiJS `src/*.ts` entry files to `createPage()`
- [x] Build passes (`npm run lint`, `npm run build`) with all migrated files

### Iteration 7 (2026-06-21): Extended factory + final PixiJS migration (H1+H2)
- [x] Committed iteration 6 baseline (H2) — `src/lib/createPage.ts` and 179 entries committed
- [x] Extended `CreatePageOptions` with `fonts?: string[]`, `antialias?: boolean`, `extra?: Partial<ApplicationOptions>` (H1 part A)
- [x] Migrated remaining 18 entries (17 font-preloading + `retro-screen-filter.ts`) to `createPage()` (H1 part B)
- [x] All PixiJS entry files are now on `createPage()` except intentional exclusions
- [x] Build and lint pass

---

## Known Exclusions (intentional — do not migrate without design work)

**Custom-logic entries:**
- `cubic-blob-overlay.ts` — WebSocket socket bridge, `window.obsBlobOverlay` export
- `trapnation.ts` — custom DOM container creation, `resizeTo: window` (unsupported in factory)
- `main.ts`, `main-cb3.ts`, `main-audio-activated-border.ts` — multi-screen launchers

**Non-PixiJS entries:**
- `animated-lines.ts` — GSAP/SVG
- `life-webgpu.ts` — raw WebGPU
- `plasma-wave.ts` — raw Canvas2D
- All Three.js entries (`dji-fpv.ts`, `energy-orb.ts`, `ai-character-*.ts`, `hex-water-island.ts`, `discord-robot.ts`, `drone-visualization.ts`, `gunan-skeleton.ts`, `meshy-post1-avatar.ts`, `city-view.ts`) — separate stack

---

## Known Factory Design Notes

- **`undefined` override risk**: In `createPage()`, `engine.init()` receives `background: opts.background` even when undefined. This silently overrides any `extra.background` value. In practice harmless since `extra` is for options not already covered, but callers should never duplicate named fields in `extra`.
- **`fonts` vs `waitForFonts`**: These are independent branches in the factory. Entries that combined `document.fonts.load()` + `document.fonts.ready` defensively are correctly migrated with `fonts` alone (the `.load()` promise already resolves when the font is ready).
- **`resizeOptions` default is always applied**: `opts.resizeOptions ?? { minWidth: 1920, minHeight: 1080, letterbox: false }` — there is no way to opt out of `resizeOptions` via `extra`; the 1920×1080 default is always applied.

---

## Pending Tasks

### High priority

**H1 — `createThreeScene()` factory for Three.js entries** _(formerly M1)_

Analogous to `createPage()` but for Three.js pages. Target files:
`dji-fpv.ts`, `energy-orb.ts`, `ai-character-*.ts`, `hex-water-island.ts`, `discord-robot.ts`, `drone-visualization.ts`, `gunan-skeleton.ts`, `meshy-post1-avatar.ts`, `city-view.ts`.

Before designing, audit all Three.js entries to enumerate their unique init patterns (renderer options, camera setup, resize behavior) so the factory interface covers all cases on the first pass.

### Medium priority

**M1 — `src/lib/index.ts` barrel export** _(formerly M3)_

Add `src/lib/index.ts` re-exporting `createPage` (and future utilities) so imports are `from "../lib"` not `from "../lib/createPage"`.

**M2 — Shared HTML boilerplate** _(formerly M2)_

All `*.html` Vite entrypoints share an identical 8-line shell. Consider a Vite plugin or HTML template to eliminate repetition. Defer until Two.js factory is done.

**M3 — Handle `trapnation.ts` custom DOM pattern** _(formerly M4)_

`trapnation.ts` creates `#pixi-container` dynamically. Either add the div to the HTML or handle the missing container in the engine. Investigate before migrating.

### Low priority

**L1 — CSS reset / theme variables deduplication**

Many HTMLs embed identical `<style>` blocks. Extract to a shared CSS file.

**L2 — Metadata coverage and taxonomy**

227 of 251 generated records still have empty descriptions. Consider a batch-fill pass.

### Medium priority

**M1 — createThreeScene() factory for Three.js entries**

Analogous to `createPage()` but for Three.js pages (`dji-fpv.ts`, `energy-orb.ts`, `ai-character-*.ts`, `hex-water-island.ts`, `discord-robot.ts`, `drone-visualization.ts`, `gunan-skeleton.ts`, `meshy-post1-avatar.ts`, `city-view.ts`). Deferred per plan — address after H1 closes.

**M2 — Shared HTML boilerplate**

All `*.html` Vite entrypoints share an identical 8-line shell (body, pixi-container div, script module). Consider a Vite plugin or HTML template to eliminate this repetition. Low risk but deferred until entry-TS standardization is complete.

**M3 — `src/lib/index.ts` barrel export**

Once more shared utilities land in `src/lib/`, add an index barrel so imports are `from "../lib"` not `from "../lib/createPage"`.

**M4 — Handle `trapnation.ts` custom DOM pattern**

`trapnation.ts` creates `#pixi-container` dynamically if it doesn't exist. Either the HTML for trapnation should include the div, or the engine should handle the missing container gracefully. Investigate before migrating.

### Low priority

**L1 — CSS reset / theme variables deduplication**

Many HTMLs embed identical `<style>` blocks (body reset, `#pixi-container` fill). Extract to a shared CSS file referenced from each HTML.

**L2 — Metadata coverage and taxonomy**

227 of 251 generated records still have empty descriptions. Consider a batch-fill pass or tooling to surface coverage gaps more visibly.
