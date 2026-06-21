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

---

## Current Findings

- `AGENT.md` is stale: the Audio section still instructs PixiJS screens to import `obsAudio` from `"../../lib/obsAudio"` even though consumers now use the barrel (`"../../lib"`).
- `AGENT.md` still says 4 Three.js files integrate `obsAudio` while listing 5 files.
- `src/discord-robot.ts` and `src/dji-fpv.ts` still import `createThreeScene` from `"./lib/createThreeScene"` even though the barrel exports it. The barrel migration covered `createPage` and `obsAudio`, but not this newer shared helper.
- `createPage()` now handles the original undefined-named-field bug, but `resizeOptions` is still always passed after `extra`, so `extra.resizeOptions` cannot opt out of the 1920x1080 default.
- `createThreeScene()` exists with two pilot migrations (`discord-robot`, `dji-fpv`), but it should be reviewed and hardened before migrating the remaining Three.js pages.

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

**C1 — Fix shared-library guidance drift**

Update `AGENT.md` so future work follows the current shared-library contract:
- PixiJS screens import `obsAudio` from `"../../lib"`.
- Nested PixiJS screens import `obsAudio` from `"../../../lib"`.
- Entry files import shared helpers from `"./lib"`.
- Correct the Three.js audit audio count from 4 to 5.

**C2 — Finish barrel adoption for `createThreeScene()` consumers**

Update:
- `src/discord-robot.ts`
- `src/dji-fpv.ts`

Both should import `createThreeScene` from `"./lib"` instead of `"./lib/createThreeScene"`.

### High Priority

**H1 — Harden `createThreeScene()` before broad migration**

Review and refine `src/lib/createThreeScene.ts` around these specific risks:
- Optional feature imports: `EffectComposer`, `RenderPass`, `OutputPass`, and `RoomEnvironment` are statically imported for every consumer; consider dynamic imports or separate helpers if migrated pages pay avoidable bundle cost.
- Body style handling: `document.body.style.cssText = "margin:0;overflow:hidden;"` clobbers any page-level body styles. Prefer minimal property assignment or an option hook.
- Error handling: failed async `onInit` work can prevent resize registration and the render loop from starting. Add a clear failure path.
- Runtime contract: decide whether `audio` should expose `obsAudio` through context or remain a separate barrel import for consumers that read `level`, `bass`, `mid`, etc.
- Resize hooks: keep the default renderer/camera/composer resize behavior, but make custom `onResize` responsibilities explicit.

**H2 — Migrate remaining Three.js entries in small batches**

After H1, migrate remaining Three.js files by variance group:
- Procedural/no-loader pages: `hex-water-island.ts`
- GLTF + PMREM pages: `energy-orb.ts`, `ai-character-final.ts`, `ai-character-natural.ts`, `meshy-post1-avatar.ts`, `cyclops-avatar.ts`
- FBX/texture pages: `gunan-skeleton.ts`, `zombie-fbx.ts`, `city-view.ts`
- Other model/overlay pages: `drone-visualization.ts`, `jelly-blob-face.ts`

Run the quality gate after each batch.

**H3 — Clarify `createPage()` resize override semantics**

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
