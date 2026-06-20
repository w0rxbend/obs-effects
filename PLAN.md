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

---

## Known Exclusions (not migrated — intentional)

The following entries still use `CreationEngine` directly:

**Custom-logic entries (do NOT migrate without design work):**
- `cubic-blob-overlay.ts` — WebSocket socket bridge, `window.obsBlobOverlay` export
- `trapnation.ts` — custom DOM container creation, `resizeTo: window` (unsupported in factory)
- `main.ts`, `main-cb3.ts`, `main-audio-activated-border.ts` — multi-screen launchers

**Font-preloading entries (blocked by factory gap — see next task):**
- `break.ts`, `background.ts`, `confidential.ts`, `starting-soon.ts`, `logo.ts`,
  `handwritten-notebook.ts`, `worxbend-fluid.ts`, `topography.ts`, `procedural-logo.ts`,
  `music-break.ts`, `starting-soon-fluid.ts`, `stream-ended-particle-mesh.ts`,
  `starting-soon-particle-mesh.ts`, `worxbend-molecular.ts`, `starting-soon-jelly.ts`,
  `title-powerline.ts`, `worxbend-text.ts`
  All use `document.fonts.load("1em 'FontName'")` before init — factory only supports `waitForFonts: true` → `document.fonts.ready`.

**Other unsupported option entries:**
- `retro-screen-filter.ts` — uses `antialias: false`, not in `CreatePageOptions`

**Non-PixiJS entries (correct to never migrate):**
- `animated-lines.ts` — GSAP/SVG
- `life-webgpu.ts` — raw WebGPU
- `plasma-wave.ts` — raw Canvas2D
- All Three.js entries (`dji-fpv.ts`, `energy-orb.ts`, etc.) — separate stack

---

## Pending Tasks

### High priority

**H1 — Extend `CreatePageOptions` to cover remaining entries**

`src/lib/createPage.ts` must accept:
- `fonts?: string[]` — array of `document.fonts.load()` spec strings, loaded with `Promise.all()` before `engine.init()`
- `antialias?: boolean` — forwarded to `engine.init()`
- Consider: pass `extra?: Partial<ApplicationOptions>` as an escape hatch for all remaining PixiJS init options

After the extension, migrate the 17 font-loading entries and `retro-screen-filter.ts`.

**H2 — Commit the iteration 6 changes**

`src/lib/createPage.ts` is currently **untracked**. All 179 modified `src/*.ts` entries are **uncommitted**. These must be committed before the next iteration can build on them safely.

Suggested commit message:
```
refactor(entries): extract createPage() factory and migrate 179 PixiJS entry files
```

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
