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
- In PixiJS screens: import `{ obsAudio }` from `"../../lib/obsAudio"`, call `void obsAudio.connect()` in `show()`, call `obsAudio.update(ticker.deltaMS * 0.001)` in `update()`.
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
- Loop: `rAF+perf` = requestAnimationFrame with performance.now() delta (clamped 0.05s); `rAF+Clock` = requestAnimationFrame with THREE.Clock
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
6. **Loop timing**: `rAF+perf` (performance.now delta, clamped 0.05s) is used by files with model loading and complex rigs; `rAF+Clock` (THREE.Clock) is used by simpler or baked-animation files.
7. **Post-processing**: Only `discord-robot` uses EffectComposer (RenderPass + OutputPass). Resize handler must also resize the composer RT.
8. **Asset loaders**: GLTFLoader (7 files), FBXLoader (3 files — gunan, zombie, city), procedural only (3 files — jelly-blob, hex-water, discord-robot). 4 files additionally use PMREMGenerator + RoomEnvironment for IBL.
9. **Extra DOM**: 10 of 13 inject a loading overlay. 7 inject a progress bar inside the overlay. Only 4 (dji-fpv, gunan, zombie, meshy-post1) add cursor grab/grabbing handlers.
10. **Audio**: 4 files integrate `obsAudio` (dji-fpv, gunan-skeleton, zombie-fbx, jelly-blob-face, cyclops-avatar). `city-view`, `discord-robot`, `drone-visualization`, `hex-water-island`, `meshy-post1-avatar`, `ai-character-final`, `ai-character-natural` have no audio.

### Factory Interface Implications

A `createThreeScene()` factory would need to expose at minimum:

- `shadowMap?: false | "PCF" | "PCFSoft"` (default PCFSoft)
- `toneMapping?: THREE.ToneMapping` + `toneMappingExposure?: number`
- `outputColorSpace?: THREE.ColorSpace`
- `premultipliedAlpha?: boolean`
- `camera: { fov, near, far }` — near/far often overridden post-load, so factory should expose the camera object
- `controls?: "orbit" | "none"` + orbit sub-options (damping, autoRotate, polarClamp, minDist, maxDist)
- `onResize?: (renderer, camera) => void` — needed for composer resize in discord-robot
- `loop?: "performance" | "clock"` (or expose both clock and dt)
- `postProcessing?: boolean` — to opt into EffectComposer path
- `ibl?: boolean` — to enable PMREMGenerator + RoomEnvironment
- `audio?: boolean` — to call obsAudio.connect() and update()
