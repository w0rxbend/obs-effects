You are refactoring an existing PixiJS/Three.js frontend project used to generate many independent OBS browser-source pages.

Primary goal:
Improve folder structure, remove duplication, standardize page implementation, and keep each OBS page isolated.

Important constraint:
Do not merge all pages into one runtime application. Each OBS page must remain independently loadable as its own browser-source page, URL, or HTML entrypoint.

Target architecture:
Keep isolated pages, but introduce shared internal libraries.

Each page should own:
- Its page-specific entrypoint.
- Its local configuration.
- Its local scene composition.
- Its local styles if needed.
- Its unique assets.

Shared code should own:
- PixiJS app/bootstrap logic.
- Three.js renderer/bootstrap logic.
- OBS/browser-source helpers.
- Resize handling.
- Asset loading helpers.
- Animation/ticker utilities.
- Shared constants, types, logging, and reusable rendering primitives.

---

## Completed

### Iteration 6 (2026-06-20): `createPage()` factory + mass PixiJS migration
- [x] Created `src/lib/createPage.ts` as the shared PixiJS page bootstrap.
- [x] Migrated 179 PixiJS `src/*.ts` entry files to `createPage()`.
- [x] Preserved standalone per-page HTML/Vite entrypoints.
- [x] `npm run lint` and `npm run build` passed.

### Iteration 7 (2026-06-21): Extended factory + final PixiJS migration
- [x] Committed the iteration 6 baseline.
- [x] Extended `CreatePageOptions` with `fonts?: string[]`, `antialias?: boolean`, and `extra?: Partial<ApplicationOptions>`.
- [x] Migrated the remaining 18 PixiJS entries requiring specific font preloads or `antialias: false`.
- [x] All PixiJS entry files are now on `createPage()` except intentional exclusions.
- [x] `npm run lint` and `npm run build` passed.

### Iteration 8 (2026-06-21): Barrel export, Three.js audit, and shared OBS audio
- [x] Created `src/lib/index.ts`.
- [x] Created `src/lib/obsAudio.ts` as the shared OBS WebSocket v5 audio bridge.
- [x] Migrated 14 PixiJS screens and 5 Three.js entries from direct mic/analyser code to `obsAudio`.
- [x] Updated 7 HTML-only audio-reactive pages with inline OBS WebSocket v5 protocol handling.
- [x] Added `obs-websocket-js`.
- [x] Wrote the Three.js variance audit and preliminary factory interface in `AGENT.md`.
- [x] Added mandatory quality-gate guidance to `CLAUDE.md`.

### Iteration 9 (2026-06-21): Shared contract cleanup
- [x] Fixed `createPage()` named option merge so `undefined` `background`, `backgroundAlpha`, and `antialias` no longer overwrite values supplied through `extra`.
- [x] Migrated all `createPage` and `obsAudio` consumers to the `src/lib` barrel import.
- [x] Confirmed no remaining deep `createPage` or `obsAudio` consumer imports under `src`.
- [x] `npm run lint`, `npm run build`, and `git diff --check HEAD~1..HEAD` passed.
- [~] The intended audio baseline commit `b3c99e4` is empty; the actual audio/factory work already lives in earlier autonomous checkpoint commits. This is not a runtime bug, but it makes the history less clear than the plan intended.

### Iteration 10 (2026-06-21): Three.js factory contract hardening
- [x] Updated `AGENT.md` so PixiJS screens and root entry files import shared helpers through the `src/lib` barrel.
- [x] Corrected the Three.js audit audio count from 4 to 5.
- [x] Migrated `src/discord-robot.ts` and `src/dji-fpv.ts` to import `createThreeScene` from `"./lib"`.
- [x] Hardened `src/lib/createThreeScene.ts`:
  - Post-processing helpers (`EffectComposer`, `RenderPass`, `OutputPass`) are dynamically imported only when `postProcessing: true`.
  - `RoomEnvironment` is dynamically imported only when `ibl: true`.
  - Body style setup now assigns `margin` and `overflow` properties instead of replacing `document.body.style.cssText`.
  - Factory-owned resize registration now happens before async initialization, while page-owned `onResize` is gated until initialization succeeds.
  - Failed `postProcessing`, `ibl`, or rejecting `onInit` setup logs `[createThreeScene] initialization failed`, shows a diagnostic overlay, rethrows, and does not start the render loop.
  - The audio and resize responsibilities are documented in the factory options and `AGENT.md`.
- [x] Reviewer validation passed: `npm run lint`, `npm run build`, and `git diff --check`.

### Iteration 11 (2026-06-21): Contract checkpoint review
- [x] Preserved the Iteration 10 contract work in non-empty commit `a04e682 refactor(three): harden scene factory contract`.
- [x] Verified the commit includes `AGENT.md`, `src/lib/createThreeScene.ts`, `src/discord-robot.ts`, and `src/dji-fpv.ts`.
- [~] No new Three.js factory behavior was implemented beyond checkpointing the prior contract hardening.
- [~] Fresh review confirmed the canary gate is still incomplete: static `OrbitControls`, callback-style DJI GLTF loading, and missing browser smoke coverage remain unresolved.

---

## Current Findings

- The shared-library guidance drift and `createThreeScene` pilot barrel imports are fixed.
- The Iteration 10 changes are now committed in `a04e682`; the old "uncommitted contract work" blocker is resolved.
- `createThreeScene()` now avoids static post-processing and IBL imports, but it still statically imports `OrbitControls` as both a value and context type. Future no-controls migrations would still pay that module cost unless controls creation moves to a dynamic option boundary and context typing becomes type-only.
- The factory only catches async setup that is actually returned from `onInit`. The current `dji-fpv.ts` pilot still uses callback-style `GLTFLoader.load()`, so model-load failures update the DJI overlay but do not reject `createThreeScene()` and do not exercise the new factory diagnostic path. Because `onInit` returns immediately, the render loop starts before the DJI model has loaded.
- `createThreeScene()` starts `obsAudio.connect()` before `onInit` resolves. If a future `onInit` rejects, the render loop is skipped but the OBS audio connection attempt may already have started.
- `createThreeScene()` catches rejecting initialization, but renderer creation, orbit-control construction, and frame-loop exceptions remain outside the diagnostic overlay path. This is acceptable for the pilot but should be decided before broad migration.
- `createThreeScene()` has not been visually smoke-tested in browser after the dynamic-import/error-path refactor. `npm run build` proves bundling, not canvas correctness.
- `createPage()` now handles the original undefined-named-field bug, but `resizeOptions` is still always passed after `extra`, so `extra.resizeOptions` cannot opt out of the 1920x1080 default.

---

## Known Exclusions

**Custom-logic PixiJS entries:**
- `cubic-blob-overlay.ts` — WebSocket socket bridge and `window.obsBlobOverlay` export.
- `trapnation.ts` — custom DOM container creation and `resizeTo: window`.
- `main.ts`, `main-cb3.ts`, `main-audio-activated-border.ts` — multi-screen launchers.

**Non-PixiJS entries:**
- `animated-lines.ts` — GSAP/SVG.
- `life-webgpu.ts` — raw WebGPU.
- `plasma-wave.ts` — raw Canvas2D.

**Three.js entries not yet migrated to `createThreeScene()`:**
- `energy-orb.ts`
- `ai-character-final.ts`
- `ai-character-natural.ts`
- `hex-water-island.ts`
- `drone-visualization.ts`
- `gunan-skeleton.ts`
- `zombie-fbx.ts`
- `jelly-blob-face.ts`
- `cyclops-avatar.ts`
- `meshy-post1-avatar.ts`
- `city-view.ts`

---

## Pending Tasks

### Critical

**C1 — Keep the Three.js migration freeze until the canary gate passes**

Do not migrate additional Three.js pages until H1-H3 are complete or their remaining risks are explicitly documented. The current factory has only two pilots, neither has been browser-smoked after the dynamic-import refactor, and the loader failure path is not yet participating in the factory contract.

### High Priority

**H1 — Remove static `OrbitControls` cost from `createThreeScene()`**

Convert `OrbitControls` to a dynamic import when `controls: "orbit"` or split orbit support into a separate helper. Keep `ThreeSceneContext.controls` typed via a type-only import so no-controls pages can use the factory without pulling the controls implementation. Re-run the build and inspect output chunks if practical.

**H2 — Make model-loader failures participate in the factory contract**

Update the `dji-fpv.ts` pilot to return a Promise from `onInit` by using `GLTFLoader.loadAsync(MODEL_URL, onProgress)` or an explicit `new Promise` wrapper around `loader.load()`. Preserve progress updates and the page-specific failure label, but reject on load failure so `createThreeScene()` can show the standardized diagnostic and skip the render loop. Document this as the required migration pattern for GLTF/FBX pages.

**H3 — Browser-smoke the two `createThreeScene()` pilots**

Run the local Vite server and inspect `dji-fpv.html` and `discord-robot.html` with a browser/Playwright smoke check:
- canvas is nonblank after initialization
- `discord-robot` renders through the dynamic composer path
- `dji-fpv` loads or shows a clear failure overlay
- resize keeps camera/composer sizing coherent

Do not migrate more Three.js pages until this passes or the remaining issues are captured.

**H4 — Tighten `createThreeScene()` side-effect and error boundaries**

Decide and implement the desired contract for:
- `obsAudio.connect()` timing when `onInit` later rejects.
- early setup failures before the current `try` block, especially orbit-control construction.
- `onFrame` exceptions, which currently occur after the next animation frame has already been scheduled.

Keep the behavior simple, but make it explicit before migrating more pages.

**H5 — Migrate remaining Three.js entries in small batches**

After H1-H4 and browser smoke confidence, migrate remaining Three.js files by variance group:
- Procedural/no-loader pages: `hex-water-island.ts`
- GLTF + PMREM pages: `energy-orb.ts`, `ai-character-final.ts`, `ai-character-natural.ts`, `meshy-post1-avatar.ts`, `cyclops-avatar.ts`
- FBX/texture pages: `gunan-skeleton.ts`, `zombie-fbx.ts`, `city-view.ts`
- Other model/overlay pages: `drone-visualization.ts`, `jelly-blob-face.ts`

For loader pages, return/reject an async initialization Promise; do not leave callback-only loaders inside `onInit`. Run the quality gate and a visual smoke check after each batch.

**H6 — Clarify `createPage()` resize override semantics**

Decide whether the 1920x1080 default is mandatory or overridable:
- If mandatory, document that `extra.resizeOptions` is intentionally ignored.
- If overridable, add an explicit option such as `resizeOptions?: ... | false` and tests/spot checks for transparent OBS overlays.

### Medium Priority

**M1 — Handle `trapnation.ts` custom DOM pattern**

Investigate whether `trapnation.html` can provide the standard `#pixi-container`, or whether `CreationEngine` should tolerate missing containers. Do not migrate until the custom resize and DOM behavior are understood.

**M2 — Shared HTML boilerplate**

Most root `*.html` Vite entrypoints share the same shell. Consider a low-risk template or generator only after the Three.js factory migration is stable.

**M3 — Static directory direct-file decision**

The metadata-backed `index.html` still has degraded `file://` behavior. Decide whether to generate a full embedded fallback or document that the complete directory requires Vite/static hosting.

### Low Priority

**L1 — CSS reset/theme variable deduplication**

Many HTML files embed repeated reset and layout CSS. Extract only after page bootstrap work stabilizes.

**L2 — Metadata coverage and taxonomy**

`public/effects-meta.json` now covers 275 records. Improve empty descriptions and weak categories/tags in batches, guarded by the existing metadata tests.
