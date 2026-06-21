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

---

## Current Findings

- The shared-library guidance drift and `createThreeScene` pilot barrel imports are fixed.
- The Iteration 10 and 12 Three.js contract changes are committed in `a04e682` and `e962b04`; the old "uncommitted contract work" blocker is resolved.
- The original canary gate is substantially complete: optional post-processing, IBL, and orbit controls are dynamically imported; DJI model loading now participates in async factory initialization; `obsAudio.connect()` waits until successful init; frame exceptions are caught; and the two pilot pages have browser-smoke evidence.
- The browser smoke is still a one-off process documented in `AGENT.md`, not a reusable checked-in script. This makes future migration batches vulnerable to unrepeatable or forgotten visual checks.
- The factory still creates the renderer and registers the resize listener before the initialization `try` block. WebGL renderer creation failures would not get the factory diagnostic overlay, and failed initialization leaves the canvas and resize listener in place.
- The factory has no lifecycle/dispose contract. This is acceptable for one page load, but it makes failure cleanup, future hot-reload behavior, and automated smoke tests messier than they need to be.
- Diagnostic overlays are simple and useful, but repeated init/frame failures can append multiple overlays. A single replaceable factory diagnostic element would be cleaner.
- Browser smoke surfaced a runtime warning from the installed Three.js version: `THREE.Clock` is deprecated in favor of `THREE.Timer`. `loop: "clock"` still works, but broad migration should avoid copying a deprecated timing path.
- The DJI failure path now rethrows from `loadAsync()`, but it has not been browser-smoked with an intentionally missing/rejecting model URL. The contract is code-reviewed, not yet failure-path smoke-tested.
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

**C1 — Keep broad Three.js migration controlled, not frozen**

The initial canary gate has passed for the two pilots. Do not mass-migrate all remaining Three.js pages in one sweep. Migrate in small variance-grouped batches, and require standard validation plus a browser smoke result after each batch.

### High Priority

**H1 — Add a reusable Three.js canary smoke runner**

Turn the one-off Playwright smoke into a checked-in script, for example `scripts/smoke-three-canaries.js`, that:
- Starts or targets a local Vite server.
- Opens `discord-robot.html` and `dji-fpv.html`.
- Verifies a canvas exists and is nonblank.
- Verifies resize coherence at `1280x720` and `960x540`.
- Verifies `discord-robot` requests the dynamic composer resource.
- Verifies `dji-fpv` reaches the loaded state and removes the loading overlay.

Keep it optional/manual at first or wire it to a dedicated `npm run smoke:three` script; do not put it in `npm run build` until runtime cost and browser availability are acceptable.

**H2 — Smoke-test factory failure paths**

Add targeted browser checks for negative paths before broad loader migration:
- A rejecting `onInit` page or test fixture shows the initialization diagnostic and does not start the render loop.
- A missing DJI/model-loader URL preserves the page-specific failure label and also trips the factory diagnostic.
- A throwing `onFrame` shows the frame diagnostic and stops future frame scheduling.

Prefer a small fixture entry over mutating production URLs at runtime if that keeps the tests deterministic.

**H3 — Tighten `createThreeScene()` lifecycle and cleanup**

Decide and implement the desired contract for:
- Renderer creation failures before the current `try` block.
- Resize listener cleanup when initialization rejects.
- Optional renderer/control/composer disposal after initialization or frame failure.
- A single replaceable diagnostic overlay instead of appending duplicates.
- Whether `createThreeScene()` should return a small handle such as `{ destroy(): void }` for tests and future hot reload scenarios.

Keep the behavior simple; this project mostly uses one standalone page per browser source, so cleanup should be pragmatic rather than framework-like.

**H4 — Replace deprecated Three.js clock timing**

The installed Three.js version warns that `THREE.Clock` is deprecated. Replace `loop: "clock"` internals with `THREE.Timer` if it fits the current version, or collapse the factory to the existing `performance.now()` delta path while preserving the `"clock"` option as a compatibility alias. Browser-smoke `discord-robot.html` after this change because it currently uses `loop: "clock"`.

**H5 — Migrate remaining Three.js entries in small batches**

After H1-H4, migrate remaining Three.js files by variance group:
- Procedural/no-loader pages: `hex-water-island.ts`
- GLTF + PMREM pages: `energy-orb.ts`, `ai-character-final.ts`, `ai-character-natural.ts`, `meshy-post1-avatar.ts`, `cyclops-avatar.ts`
- FBX/texture pages: `gunan-skeleton.ts`, `zombie-fbx.ts`, `city-view.ts`
- Other model/overlay pages: `drone-visualization.ts`, `jelly-blob-face.ts`

For loader pages, return/reject an async initialization Promise; do not leave callback-only loaders inside `onInit`. Run the quality gate and a visual smoke check after each batch. Watch for pages that style `<html>`, use PMREM, or implement custom camera paths.

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
