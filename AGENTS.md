# OBS Effects Agent Guide

This repository is a multi-page PixiJS 8 + TypeScript project for OBS Browser Source visuals. Treat it as a library of standalone procedural screens, not a single app surface.

## Core Project Model

- Every effect is usually made of three pieces:
  - `src/app/screens/*Screen.ts`: the Pixi scene class.
  - `src/*.ts`: the entry point that creates `CreationEngine`, calls `setEngine`, runs `engine.init(...)`, and shows the screen through `engine.navigation.showScreen(...)`.
  - `*.html` in the repo root: the Vite entry page that mounts `#pixi-container` and imports the entry TS file.
- New pages must also be registered in:
  - `vite.config.ts` under `build.rollupOptions.input`
  - `index.html` so the effect appears in the local preview directory
- The engine bootstrap lives in:
  - `src/engine/engine.ts`
  - `src/app/getEngine.ts`

## Operating Assumptions

- Never analyze, traverse, or scan `node_modules`.
- Always exclude `node_modules` from searches and context gathering.
- Prefer `rg` / `rg --files` for discovery.
- Expect a dirty worktree. Do not revert unrelated changes.
- This repo often contains many independent effects. Scope edits tightly to the requested screen unless the request explicitly asks for shared-system changes.

## Conventional Commits

Use Conventional Commits for any commit you create.

Format:

```text
<type>(<scope>): <subject>

<body>
```

Types:

- `feat`
- `fix`
- `chore`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`

Example:

```text
feat(globe): add rotating wavy planet mesh page

Adds a new standalone Pixi screen, Vite entry, and map listing.
```

## Architecture Notes

### Engine and Page Bootstrapping

- `CreationEngine` extends `Application` and mounts the canvas into `#pixi-container`.
- Assets are initialized through AssetPack in `engine.init()`.
- Most procedural screens with no external assets should use `static assetBundles: string[] = []`.
- Entry points usually look like:
  - create `new CreationEngine()`
  - call `setEngine(engine)`
  - await `engine.init({ ... })`
  - await `engine.navigation.showScreen(ScreenClass)`

### Screen Lifecycle Pattern

- Screen classes extend `Container`.
- Common methods:
  - `show()`
  - `hide()` when needed
  - `resize(width, height)`
  - `update(ticker)`
- For procedural drawing, use a persistent `Graphics` instance and redraw each frame instead of reallocating display objects.
- Use `ticker.deltaMS` or `ticker.deltaTime` and clamp large deltas to avoid unstable animation after tab switching.

### OBS Rendering Intent

- Webcam borders and transparent overlays should generally initialize the engine with `backgroundAlpha: 0`.
- Full-screen backgrounds can use an opaque `background` color.
- Preserve responsiveness: most screens compute their visual radius or layout from `Math.min(width, height)`.
- Effects should read well at OBS-style resolutions such as `1920x1080`.

## PixiJS and TypeScript Guidelines

- Use typed data structures for simulation nodes, particles, and segments.
- Avoid avoidable allocation in frame loops.
- Reuse `Graphics` and long-lived arrays where practical.
- Use masks and filters sparingly.
- Favor clear math helpers and explicit interfaces for geometry-heavy effects.
- Keep TypeScript strict-friendly.

## Implementation Playbooks

### Adding a New Screen

1. Create `src/app/screens/YourScreen.ts`.
2. Create `src/your-screen.ts`.
3. Create `your-screen.html`.
4. Register the HTML file in `vite.config.ts`.
5. Add the page to `index.html`.
6. If the effect is asset-free, set `static assetBundles: string[] = []`.

### Adding a Webcam Border

1. Extend `Container`.
2. Keep the center visually open and transparent for camera feed usage.
3. Use layered `Graphics` and `Container` instances for ring, accents, glow, and particles.
4. Initialize the engine with `backgroundAlpha: 0`.

### Adding a Full-Screen Background

1. Extend `Container`.
2. Keep a primary `Graphics` instance for redraw-based rendering.
3. Rebuild or redistribute simulation state in `resize`.
4. Initialize the engine with an opaque `background` color when the page is intended as a background layer.

## Visual Direction

- The repo already contains many globe, mesh, and field effects such as:
  - `ParticleGlobeScreen`
  - `DottedMeshScreen`
  - `GeodesicSphereScreen`
  - `WireframeIcosphereScreen`
  - `WireframeSphereCamScreen`
- For globe-like effects, prefer depth-aware rendering:
  - sort lines/dots by depth
  - vary alpha and size by depth
  - use perspective scaling rather than flat orthographic placement
- For “fluid” requests, do more than animate opacity:
  - deform positions
  - vary local elevation
  - let connection lines react to neighboring relief

## Recent Context: Last Run

The most recent feature work added a new standalone page named `wavy-planet-mesh`.

Files added:

- `src/app/screens/WavyPlanetMeshScreen.ts`
- `src/wavy-planet-mesh.ts`
- `wavy-planet-mesh.html`

Files updated:

- `vite.config.ts`
- `index.html`

### What The User Asked For

The original prompt was a terse visual request: a dotted grid and mesh rotating sphere, imitating planet rotation, with all dots connected and a fluid, wavy surface.

Interpretation that worked:

- treat the request as a new full-screen procedural page
- build a sphere from latitude/longitude nodes
- connect neighboring nodes into a mesh
- render dots at intersections
- animate surface displacement so the sphere feels alive rather than rigid

### What Was Implemented

- A rotating lat/lon sphere with connected mesh lines and depth-sorted dots.
- A dark full-screen background with layered aura behind the globe.
- A dedicated Vite/html entry so it behaves like every other standalone effect in the repo.

### Follow-Up Tuning From The Next Prompt

The next user request asked to:

- improve the wave effect
- slow the planet rotation
- improve dot elevation so the wave looks more realistic

That refinement changed `src/app/screens/WavyPlanetMeshScreen.ts` by:

- slowing `ROTATION_SPEED` to `0.16`
- replacing faster mixed oscillation with slower traveling swells
- separating `wave`, `elevation`, and `crest`
- making radius displacement depend on local elevation
- making dots visually lift based on positive elevation instead of only brightness
- making mesh segment width/alpha respond to local relief between connected nodes

When extending or refining this screen, preserve that intent: calm rotation, readable swells, and visible topography across both dots and mesh lines.

## Prompt Handling Guidance

- Users in this repo often phrase visual requests informally and tersely.
- Default interpretation should be implementation, not discussion, unless they explicitly ask for ideas first.
- For effect refinements, inspect the current screen and patch the math directly instead of proposing general art-direction advice.
- When a user asks for a new page, make the full integration change set, not just the screen file.

## Verification Guidance

- Preferred validation flow:
  - `npm run lint`
  - `npm run build`
- If dependencies are unavailable in the workspace, state that clearly instead of implying verification passed.
- Do not fabricate runtime validation for visual work. Say exactly what was and was not checked.

## File-Specific Guidance

- `vite.config.ts`: keep keys descriptive and consistent with existing camelCase entry names.
- `index.html`: add human-readable labels that describe the visual identity of the page.
- `src/app/screens/*`: keep render math self-contained and readable; small helper interfaces are preferred over untyped objects.
- Root `*.html` files: keep them minimal and consistent with existing pages.
