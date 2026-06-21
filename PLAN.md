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
- [x] Committed iteration 6 baseline — `src/lib/createPage.ts` and 179 entries committed
- [x] Extended `CreatePageOptions` with `fonts?: string[]`, `antialias?: boolean`, `extra?: Partial<ApplicationOptions>`
- [x] Migrated remaining 18 entries (17 font-preloading + `retro-screen-filter.ts`) to `createPage()`
- [x] All PixiJS entry files are now on `createPage()` except intentional exclusions
- [x] Build and lint pass

### Iteration 8 (2026-06-21): Barrel export + Three.js audit + obsAudio migration
- [x] Created `src/lib/index.ts` barrel re-exporting `createPage` and `obsAudio`
- [x] Created `src/lib/obsAudio.ts` — shared OBS WebSocket v5 audio bridge (singleton)
- [x] Audited all 13 Three.js entries; variance matrix and factory interface written to `AGENT.md`
- [x] Migrated 14 PixiJS screens from getUserMedia/AudioContext to `obsAudio`
- [x] Migrated 5 Three.js entries (dji-fpv, gunan-skeleton, zombie-fbx, jelly-blob-face, cyclops-avatar) to `obsAudio`
- [x] Updated 7 HTML-only files (cyberpunk-spectrum, 6 ink-dissolve-\*) with OBS WebSocket v5 inline protocol
- [x] Added `obs-websocket-js` package dependency
- [x] CLAUDE.md: added mandatory quality gate section
- [~] **All changes are uncommitted — must be committed before next iteration**

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
- All Three.js entries — separate stack (no `createPage()` migration; factory deferred)

---

## Known Design Notes

- **`undefined` override risk**: In `createPage()`, `engine.init()` receives `background: opts.background` and `antialias: opts.antialias` even when undefined. This silently overrides any `extra.background` or `extra.antialias` value. Use `Object.fromEntries(…filter(([,v]) => v !== undefined))` to fix.
- **`fonts` vs `waitForFonts`**: Independent sequential branches; `fonts?: string[]` is sufficient for font-preloading entries.
- **`resizeOptions` default always applied**: No way to opt out of the 1920×1080 default via `extra`.
- **Barrel import not yet adopted**: All 19+ obsAudio consumers still use deep imports (`from "../../lib/obsAudio"`). The barrel provides zero benefit until callers migrate to `from "../../lib"`.

---

## Pending Tasks

### Critical (blocker for next iteration)

**C1 — Commit iteration 8 work**

All iter 8 changes are uncommitted. Stage and commit:
- `src/lib/index.ts`, `src/lib/obsAudio.ts` (new untracked files)
- `AGENT.md` (new untracked file — Three.js audit matrix)
- 14 PixiJS screen files (audio migration, modified)
- 5 Three.js entry files (audio migration, modified)
- 7 HTML files (OBS WebSocket inline protocol, modified)
- `CLAUDE.md`, `package.json`, `package-lock.json`

Use conventional commit: `refactor(audio): migrate all screens to obsAudio shared bridge`

### High priority

**H1 — `createThreeScene()` factory for Three.js entries**

Audit matrix is in `AGENT.md` — factory interface already designed. Target files:
`dji-fpv.ts`, `energy-orb.ts`, `ai-character-*.ts`, `hex-water-island.ts`, `discord-robot.ts`, `drone-visualization.ts`, `gunan-skeleton.ts`, `meshy-post1-avatar.ts`, `city-view.ts`.

Factory interface (from audit):
- `shadowMap?: false | "PCF" | "PCFSoft"` (default: PCFSoft)
- `toneMapping?: THREE.ToneMapping` + `toneMappingExposure?: number`
- `outputColorSpace?: THREE.ColorSpace`
- `premultipliedAlpha?: boolean`
- `camera: { fov, near, far }`
- `controls?: "orbit" | "none"` + orbit sub-options
- `onResize?: (renderer, camera, composer?) => void`
- `loop?: "performance" | "clock"`
- `postProcessing?: boolean`
- `ibl?: boolean`
- `audio?: boolean`

Note: `discord-robot` needs `onResize` to also resize the EffectComposer RT.

**H2 — Fix `undefined` override in `createPage()`**

Filter out `undefined` named fields before spreading so `extra` can override named factory options:

```typescript
const named = Object.fromEntries(
  Object.entries({
    background: opts.background,
    backgroundAlpha: opts.backgroundAlpha,
    antialias: opts.antialias,
  }).filter(([, v]) => v !== undefined)
);
await engine.init({ ...opts.extra, resizeOptions: ..., ...named });
```

**H3 — Migrate existing imports to barrel (`from "../../lib"`)**

19+ files import `from "../../lib/obsAudio"` or `from "../../lib/createPage"` directly. Migrate all to `from "../../lib"` so the barrel is the single entry point and deep paths are never referenced by consumers.

### Medium priority

**M1 — Handle `trapnation.ts` custom DOM pattern**

`trapnation.ts` creates `#pixi-container` dynamically. Either add the div to the HTML or handle the missing container in the engine. Investigate before migrating.

**M2 — Shared HTML boilerplate**

All `*.html` Vite entrypoints share an identical 8-line shell. Consider a Vite plugin or HTML template to eliminate repetition. Defer until Three.js factory is done.

### Low priority

**L1 — CSS reset / theme variables deduplication**

Many HTMLs embed identical `<style>` blocks. Extract to a shared CSS file.

**L2 — Metadata coverage and taxonomy**

227 of 251 generated records still have empty descriptions. Consider a batch-fill pass.
