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

### Iteration 12 (2026-06-21): Three.js canary gate checkpoint

- [x] Removed static `OrbitControls` value import from `src/lib/createThreeScene.ts`; orbit support now loads dynamically only when `controls: "orbit"` and the context type uses a type-only import.
- [x] Moved orbit-control construction into the factory initialization `try` path.
- [x] Moved `obsAudio.connect()` until after awaited initialization succeeds, so rejecting `onInit` does not start the OBS audio side effect.
- [x] Added `onFrame` error handling: frame exceptions log `[createThreeScene] frame failed`, show a diagnostic overlay, and stop scheduling additional frames.
- [x] Converted `src/dji-fpv.ts` to `GLTFLoader.loadAsync()` inside an async `onInit`, preserving progress updates and rethrowing load failures through the factory contract.
- [x] Documented the required loader migration pattern in `AGENT.md`.
- [x] Browser-smoked the two factory canaries and recorded results in `AGENT.md`:
  - `discord-robot.html` rendered nonblank at `1280x720` and `960x540`, with the dynamic `EffectComposer` path loaded.
  - `dji-fpv.html` loaded the local GLB, rendered nonblank at `1280x720` and `960x540`, and removed its page-specific loading overlay.
- [x] Committed the checkpoint in `e962b04 refactor(three): harden canary scene contract`.
- [x] Reviewer validation passed: `npm run lint`, `npm run build`, and an independent CLI screenshot smoke of both canaries at `1280x720` and `960x540`.

### Iteration 13 (2026-06-21): Three.js lifecycle and smoke runner draft

- [x] Hardened `src/lib/createThreeScene.ts` lifecycle behavior:
  - Renderer creation/setup now runs inside the initialization `try` path.
  - Failed initialization removes the factory resize listener and factory canvas, disposes controls/composer/renderer where present, rethrows, and does not start the render loop.
  - Successful initialization returns `Promise<ThreeSceneHandle>` with `destroy(): void`.
  - Frame failures use one replaceable factory diagnostic overlay and stop future frame scheduling.
  - `loop: "clock"` is now documented and implemented as a compatibility alias for the clamped `performance.now()` path, avoiding deprecated `THREE.Clock`.
- [x] Added `scripts/smoke-three-canaries.js` plus `npm run smoke:three`.
- [x] Added deterministic smoke fixtures for rejecting `onInit`, throwing `onFrame`, and failing loader initialization.
- [x] Registered the smoke fixture HTML pages in `vite.config.ts` so Vite can serve/build them.
- [x] Updated `AGENT.md` with the stabilized factory lifecycle contract and smoke workflow.
- [x] Reviewer validation passed on the current uncommitted tree: `npm run lint`, `npm run build`, `npm run smoke:three`, and `git diff --check`.
- [!] The new smoke fixture HTML/TS/script files are still untracked at review time. Because the metadata checker only sees tracked root HTML files, the current build does not prove that committing root-level `three-factory-*.html` fixtures is metadata-safe.

---

## Current Findings

- The reusable Three.js smoke runner now exists and passes locally on the current tree. It starts Vite when `BASE_URL` is not provided, opens the two production canaries, checks nonblank canvas output at `1280x720` and `960x540`, checks canvas CSS/render-size coherence, verifies the dynamic `EffectComposer` request, verifies DJI overlay removal, and exercises three deterministic factory failure fixtures.
- The `createThreeScene()` lifecycle contract is much stronger: renderer setup is diagnosed, failed init cleans up factory-owned browser resources, `destroy()` exists for successful scenes, duplicate diagnostics are replaced instead of appended, and deprecated `THREE.Clock` is no longer used.
- High-priority checkpoint risk: `three-factory-init-fail.html`, `three-factory-frame-fail.html`, and `three-factory-loader-fail.html` are root-level HTML files but are currently untracked. `scripts/check-effects-meta.js` lists tracked root `*.html` files as effect pages, so adding these files to git as root HTML will likely make `npm run build` fail unless the fixtures are moved under a non-root test path or explicitly excluded from the metadata contract.
- The smoke runner is optional/manual through `npm run smoke:three`; it is intentionally not part of `npm run build` yet because it depends on browser availability and runtime cost.
- The smoke runner's nonblank heuristic currently uses alpha/luma standard deviation only. This works for the current canaries, but it can false-fail a legitimate mostly-uniform render; `visibleRatio`, `alphaMean`, or page-specific thresholds would make it more robust before it becomes a broader migration gate.
- The smoke runner's browser error handling throws directly from Playwright event callbacks. It worked in the reviewer run, but collecting page errors and failing at deterministic checkpoints would produce clearer diagnostics and avoid event-timing surprises.
- The factory cleanup contract covers factory-owned renderer/control/composer/canvas/listener resources. Page-owned resources created during `onInit` still need page-owned cleanup if future migrated pages allocate custom targets, DOM, or listeners before a later async failure.
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

**C0 — Make smoke fixtures metadata-safe before checkpointing**

Do not commit the current root-level `three-factory-*.html` fixture pages as-is without proving the metadata contract still passes after they are tracked. Preferred fix: move smoke-only fixture HTML under a non-root test path such as `fixtures/three-factory-*.html` or `test-pages/three-factory-*.html`, update `vite.config.ts` and `scripts/smoke-three-canaries.js`, and rerun `npm run build` after staging or otherwise simulating tracked files. Alternative: add an explicit fixture exclusion to the metadata generator/checker contract, with regression coverage so future root effect pages are not accidentally excluded.

**C1 — Checkpoint the lifecycle/smoke work cleanly**

After C0 is resolved, stage the implementation files (`src/lib/createThreeScene.ts`, `scripts/smoke-three-canaries.js`, smoke fixture entry/html files, `package.json`, `package-lock.json`, `vite.config.ts`, `AGENT.md`, and plan/log/memory updates) and commit a non-empty conventional commit. Verify the staged state with `npm run lint`, `npm run build`, `npm run smoke:three`, and `git diff --check --cached` before committing.

**C2 — Keep broad Three.js migration controlled, not frozen**

The canary gate is now close to reusable, but do not mass-migrate all remaining Three.js pages in one sweep. Migrate in small variance-grouped batches, and require standard validation plus a browser smoke result after each batch.

### High Priority

**H1 — Harden the reusable smoke runner before broad use**

Keep `npm run smoke:three` optional/manual for now, but improve it before using it as the standard migration gate:

- Make page-error and console-error collection deterministic instead of throwing directly from event callbacks.
- Improve the nonblank predicate to consider `visibleRatio` and `alphaMean` as well as variance, so uniform-but-visible scenes do not false-fail.
- Print Vite stderr/stdout on startup failure instead of discarding it.
- Add a documented `BASE_URL` example for targeting `vite preview` or an already-running dev server.

**H2 — Validate the factory cleanup contract against page-owned resources**

Before migrating loader-heavy pages, document or implement a page-owned cleanup convention for resources allocated during `onInit` before a later rejection. A minimal option is an `onDestroy(ctx)` callback or a documented local `try/catch` cleanup pattern for custom DOM overlays, render targets, listeners, and temporary geometries.

**H3 — Migrate remaining Three.js entries in small batches**

After C0-C2 and H1 are resolved, migrate remaining Three.js files by variance group:

- Procedural/no-loader pages: `hex-water-island.ts`
- GLTF + PMREM pages: `energy-orb.ts`, `ai-character-final.ts`, `ai-character-natural.ts`, `meshy-post1-avatar.ts`, `cyclops-avatar.ts`
- FBX/texture pages: `gunan-skeleton.ts`, `zombie-fbx.ts`, `city-view.ts`
- Other model/overlay pages: `drone-visualization.ts`, `jelly-blob-face.ts`

For loader pages, return/reject an async initialization Promise; do not leave callback-only loaders inside `onInit`. Run the quality gate and a visual smoke check after each batch. Watch for pages that style `<html>`, use PMREM, or implement custom camera paths.

**H4 — Clarify `createPage()` resize override semantics**

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
