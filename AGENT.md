# Agent Instructions

Instructions for AI agents (Claude Code subagents, autonomous loops, etc.) working in this repository.

## Mandatory Quality Gate

**After every implementation task — no exceptions — run these three commands and fix all issues:**

```bash
# 1. Format code
npx prettier --write "src/**/*.ts" "*.html"

# 2. Lint and auto-fix
npx eslint --fix .

# 3. Type-check
npx tsc --noEmit
```

- All three must pass with zero errors before reporting the task complete.
- If `tsc` or `eslint` surface errors you cannot fix automatically, report them explicitly rather than ignoring them.
- `noUnusedLocals` and `noUnusedParameters` are enforced — remove or use every declared symbol.

## Scope Rules

- Do not touch `node_modules`.
- Do not modify files unrelated to the requested change.
- When adding a new page: add the screen `.ts`, the entry `.ts`, the `.html`, register in `vite.config.ts`, and add to `index.html`.
- For refactors touching multiple files: make all changes, then run the quality gate once at the end.

## Audio

All audio reactivity in this project uses the OBS WebSocket bridge (`src/lib/obsAudio.ts`).

- Do **not** use `navigator.mediaDevices.getUserMedia` or `AudioContext` / `AnalyserNode`.
- In PixiJS screens: import `{ obsAudio }` from `"../../lib"`, call `void obsAudio.connect()` in `show()`, call `obsAudio.update(ticker.deltaMS * 0.001)` in `update()`.
- In nested PixiJS screens: import `{ obsAudio }` from `"../../../lib"`.
- In root `src/*.ts` entry files: import shared helpers from `"./lib"` instead of deep `./lib/*` paths.
- In HTML-only files: implement the OBS WebSocket v5 protocol inline (see `cyberpunk-spectrum.html` or `ink-dissolve-razer.html` as reference).

## Commit Style

Use Conventional Commits:

```text
feat(screen): add new effect page
fix(audio): correct band smoothing coefficients
refactor(obs): migrate remaining screens to obsAudio
```

## Three.js Entry Audit

Recorded 2026-06-21. Each row covers the init pattern for one Three.js entry file in `src/`.

**Legend**

- Renderer opts: `α` = alpha, `aa` = antialias, `pα` = premultipliedAlpha:false
- shadowMap: `PCF` = PCFShadowMap, `PCFs` = PCFSoftShadowMap, `—` = disabled
- Tone/exp: tone-mapping algorithm × exposure value (`ACESf` = ACESFilmicToneMapping)
- ColorSpace: `SRGB` = SRGBColorSpace, `—` = not set
- Camera: `Persp(fov, near, far)`; `★` = near/far adjusted post-load from bounding box
- Controls: `Orbit(d=damping)` = OrbitControls, `—` = none
- Resize: `win` = window "resize" event listener (all files use this)
- Loop: `rAF+perf` = requestAnimationFrame with performance.now() delta (clamped 0.05s); `rAF+Clock` = legacy requestAnimationFrame with THREE.Clock in unmigrated entries. In `createThreeScene()`, `loop: "clock"` is only a compatibility alias for the clamped `performance.now()` path.
- Post: `EC(RP+OP)` = EffectComposer → RenderPass → OutputPass; `—` = none
- Assets: loader abbreviations (GLTF/FBX/Tex), `PMREM` = PMREMGenerator+RoomEnvironment, `proc` = procedural only

| File                      | Renderer opts | shadowMap | Tone / exp   | ColorSpace | Camera                          | Controls                                                           | Resize         | Loop      | Post      | Assets                                                        | Extra DOM                                                            |
| ------------------------- | ------------- | --------- | ------------ | ---------- | ------------------------------- | ------------------------------------------------------------------ | -------------- | --------- | --------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `dji-fpv.ts`              | α, aa         | PCF       | ACESf × 1.15 | SRGB       | Persp(38, 0.001, 500) ★         | Orbit(d=0.07, no pan, polar clamped)                               | win            | rAF+perf  | —         | GLTFLoader, obsAudio                                          | Loading overlay + progress bar; cursor grab/grabbing                 |
| `gunan-skeleton.ts`       | α, aa         | PCFs      | ACESf × 1.08 | SRGB       | Persp(34, 0.01, 2000) ★         | Orbit(d=0.08, no pan, polar clamped)                               | win            | rAF+Clock | —         | FBXLoader, TextureLoader (8 tex), obsAudio                    | Loading overlay + progress bar; cursor grab/grabbing; SkeletonHelper |
| `zombie-fbx.ts`           | α, aa         | PCFs      | ACESf × 1.08 | SRGB       | Persp(34, 0.01, 3000) ★         | Orbit(d=0.08, no pan, polar clamped)                               | win            | rAF+perf  | —         | FBXLoader (body + walk anim), TextureLoader (4 tex), obsAudio | Loading overlay + progress bar; cursor grab/grabbing; SkeletonHelper |
| `jelly-blob-face.ts`      | α, aa         | —         | —            | —          | Persp(48, 0.1, 100) fixed z=6.2 | —                                                                  | win            | rAF+Clock | —         | proc (no loader), obsAudio                                    | body margin/overflow only                                            |
| `cyclops-avatar.ts`       | α, aa         | —         | ACESf × 0.3  | SRGB       | Persp(38, 0.01, 1000) ★         | —                                                                  | win            | rAF+Clock | —         | GLTFLoader, PMREM, obsAudio                                   | Simple text overlay; no cursor changes                               |
| `energy-orb.ts`           | α, aa, pα     | —         | ACESf × 1.25 | SRGB       | Persp(38, 0.01, 1000) ★         | Orbit(d=0.06, autoRotate, no pan)                                  | win            | rAF+perf  | —         | GLTFLoader, PMREM                                             | Text overlay; `<html>` element also styled                           |
| `city-view.ts`            | α, aa         | —         | —            | —          | Persp(72, 0.1, 100000) ★        | — (drone fly-path)                                                 | win            | rAF+Clock | —         | FBXLoader                                                     | Text overlay; HemisphereLight (unique)                               |
| `discord-robot.ts`        | aa, α         | —         | ACESf × 1.1  | SRGB       | Persp(54, 0.1, 200) fixed pos   | Orbit(d=0.06, min/maxDist, no autoRotate)                          | win + composer | rAF+Clock | EC(RP+OP) | proc (no loader)                                              | body only                                                            |
| `drone-visualization.ts`  | aa, α         | PCFs      | ACESf × 1.15 | SRGB       | Persp(38, 0.01, 500) ★          | — (fixed camera path)                                              | win            | rAF+perf  | —         | GLTFLoader                                                    | Text + progress overlay                                              |
| `hex-water-island.ts`     | α, aa         | —         | ACESf × 1.1  | —          | Persp(50, 0.1, 150) loop-orbit  | — (programmatic orbit)                                             | win            | rAF+Clock | —         | proc (no loader)                                              | body only                                                            |
| `meshy-post1-avatar.ts`   | α, aa         | PCFs      | ACESf × 1.15 | SRGB       | Persp(38, 0.01, 2000) ★         | Orbit(d=0.08, no pan) — disabled after load, auto-orbit cam        | win            | rAF+perf  | —         | GLTFLoader, PMREM                                             | Loading overlay + progress bar; cursor grab/grabbing                 |
| `ai-character-final.ts`   | α, aa         | PCFs      | ACESf × 1.25 | SRGB       | Persp(38, 0.01, 2000) ★         | Orbit(d=0.08, no pan) — user/auto handoff on mousedown/wheel/touch | win            | rAF+perf  | —         | GLTFLoader, PMREM                                             | Loading overlay + progress bar; mousedown/wheel/touchstart handlers  |
| `ai-character-natural.ts` | α, aa         | PCFs      | ACESf × 1.2  | SRGB       | Persp(38, 0.01, 2000) ★         | Orbit(d=0.08, no pan) — disabled after load, auto-orbit cam        | win            | rAF+perf  | —         | GLTFLoader, PMREM                                             | Loading overlay + progress bar                                       |

### Key Variances

1. **shadowMap**: 8 of 13 files enable shadows (PCFSoft preferred; `dji-fpv` uses plain PCF). 5 files disable shadows entirely.
2. **toneMapping**: All files except `jelly-blob-face`, `city-view`, and `hex-water-island` use ACESFilmicToneMapping. Exposures range 0.3–1.25.
3. **outputColorSpace**: 9 of 13 set SRGBColorSpace; 4 omit it entirely.
4. **premultipliedAlpha**: Only `energy-orb` sets this to `false`.
5. **Controls**: 7 files use OrbitControls; 6 use no controls (autonomous camera path or fixed position). Where OrbitControls is present, damping is always enabled (0.06–0.08) and pan is always disabled (except `discord-robot` which doesn't set `enablePan`).
6. **Loop timing**: `rAF+perf` (performance.now delta, clamped 0.05s) is used by files with model loading and complex rigs; legacy `rAF+Clock` was used by simpler or baked-animation files. Migrated `createThreeScene()` pages may keep `loop: "clock"` for compatibility, but the factory no longer uses deprecated `THREE.Clock`.
7. **Post-processing**: Only `discord-robot` uses EffectComposer (RenderPass + OutputPass). Resize handler must also resize the composer RT.
8. **Asset loaders**: GLTFLoader (7 files), FBXLoader (3 files — gunan, zombie, city), procedural only (3 files — jelly-blob, hex-water, discord-robot). 4 files additionally use PMREMGenerator + RoomEnvironment for IBL.
9. **Extra DOM**: 10 of 13 inject a loading overlay. 7 inject a progress bar inside the overlay. Only 4 (dji-fpv, gunan, zombie, meshy-post1) add cursor grab/grabbing handlers.
10. **Audio**: 5 files integrate `obsAudio` (dji-fpv, gunan-skeleton, zombie-fbx, jelly-blob-face, cyclops-avatar). `city-view`, `discord-robot`, `drone-visualization`, `hex-water-island`, `meshy-post1-avatar`, `ai-character-final`, `ai-character-natural` have no audio.

### `createThreeScene()` Contract

`src/lib/createThreeScene.ts` is the shared Three.js bootstrap for future migrations. It preserves isolated per-page entrypoints: root `src/*.ts` files call `createThreeScene()` from `"./lib"`, while page-specific model loading, scene composition, overlays, and animation logic stay in the entry file.

- The factory creates one transparent antialiased `WebGLRenderer`, appends its canvas to `document.body`, sets pixel ratio and viewport size, and applies only `document.body.style.margin = "0"` and `document.body.style.overflow = "hidden"`. It must not replace `document.body.style.cssText` or wipe page-owned body styles.
- `camera: { fov, near, far }` is required. The factory exposes the live `camera` through `ThreeSceneContext` because many model pages adjust position, near, or far after asset bounds are known.
- Renderer variants remain explicit options: `shadowMap?: false | "PCF" | "PCFSoft"`, `toneMapping`, `toneMappingExposure`, `outputColorSpace`, and `premultipliedAlpha`.
- `controls: "orbit"` creates `OrbitControls` with damping enabled and applies only provided `orbitOptions`. `controls: "none"` or omission leaves camera movement entirely page-owned.
- `loop?: "performance" | "clock"` preserves the public option shape, but `"clock"` is now only a compatibility alias. The factory always uses the clamped `performance.now()` delta path and no longer uses deprecated `THREE.Clock`.
- `postProcessing: true` dynamically imports `EffectComposer`, `RenderPass`, and `OutputPass`, creates the default `RenderPass -> OutputPass` chain, stores it as `ctx.composer`, and uses `composer.render()` in the loop. Pages needing custom passes can mutate `ctx.composer` in `onInit`; do not statically import post-processing helpers for pages that do not opt in.
- `ibl: true` dynamically imports `RoomEnvironment`, builds a temporary `PMREMGenerator`, assigns `scene.environment`, and disposes the PMREM generator. Keep this optional so non-IBL pages do not pay the extra module cost.
- `audio: true` is a convenience only: after successful initialization it calls `obsAudio.connect()` and updates the shared singleton each frame. `obsAudio` is not included in `ThreeSceneContext`; pages that read `level`, `bass`, `mid`, or `treble` import `{ obsAudio }` from `"./lib"`.
- Default resize handling always updates the renderer size, camera aspect/projection, and default composer size. `onResize(renderer, camera, composer)` runs only after successful initialization and should resize page-owned render targets, overlays, or custom passes only.
- `createThreeScene()` returns a `Promise<ThreeSceneHandle>` with `destroy(): void`. Destroying stops the render loop, removes the factory resize listener, disposes orbit controls, composer, and renderer when present, removes the factory canvas, and removes the factory diagnostic overlay owned by that scene.
- Initialization failures are explicit. Renderer creation/setup, dynamic optional imports, and `onInit` all run inside factory error handling. On failure the factory logs `[createThreeScene] initialization failed`, shows one replaceable factory diagnostic overlay, removes the resize listener, disposes controls/composer/renderer where present, removes the factory canvas if appended, rethrows, and does not connect audio or start the render loop.
- Frame failures are contained. If `onFrame` throws, the factory logs `[createThreeScene] frame failed`, shows the same single replaceable diagnostic overlay with frame-failure text, and stops scheduling additional animation frames.
- Three.js migrations that use `GLTFLoader`, `FBXLoader`, `TextureLoader`, or similar asset loaders must return or await the loader Promise from `onInit` by using `loadAsync()` or an explicit Promise wrapper around callback-only loaders. Do not leave callback-only loader work inside `onInit`; it bypasses factory diagnostics and starts the render loop before assets have either loaded or failed.

### Three.js Factory Smoke Workflow

Run the manual Three.js browser smoke with:

```bash
npm run smoke:three
```

The script uses `BASE_URL` when provided; otherwise it starts a local Vite server. It is optional/manual and is not part of `npm run build`.

- Canary pages: opens `discord-robot.html` and `dji-fpv.html`, verifies each page has a nonblank canvas at `1280x720` and `960x540`, checks canvas CSS/render-size coherence, confirms `discord-robot.html` requests the dynamic `EffectComposer` resource, and confirms `dji-fpv.html` reaches loaded state with its page-specific loading overlay removed.
- Failure fixtures: opens `three-factory-init-fail.html`, `three-factory-frame-fail.html`, and `three-factory-loader-fail.html`. These verify initialization diagnostics without render-loop start, frame diagnostics with stopped scheduling, loader failure diagnostics, canvas cleanup after initialization failure, and preservation of the loader fixture's page-specific failure label.
