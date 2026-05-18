# OBS Effects Project Instructions

This repo is a PixiJS 8 + TypeScript multi-page collection of OBS Browser Source effects. Work from the assumption that each page is an independent visual scene with its own screen class, TS entry point, and root HTML file.

## Project Structure

- Screen classes live in `src/app/screens/`.
- Standalone page entry points live in `src/`.
- Vite HTML entries live at the repo root.
- New pages must be wired into:
  - `vite.config.ts`
  - `index.html`

The runtime foundation is:

- `src/engine/engine.ts`
- `src/app/getEngine.ts`

## Required Working Rules

- Never traverse or inspect `node_modules`.
- Always exclude `node_modules` from searches.
- Prefer `rg` for discovery.
- Keep edits narrowly scoped; this repository holds many separate effects.
- Do not revert unrelated local changes.

## Current Engineering Pattern

### Screen classes

- Extend `Container`.
- Usually keep one persistent `Graphics` object and redraw every frame.
- Implement `show()`, `resize()`, and `update(ticker)` as needed.
- Clamp large delta time jumps in animation updates.

### Entry points

- Create `CreationEngine`.
- Call `setEngine(engine)`.
- Await `engine.init(...)`.
- Show the screen via `engine.navigation.showScreen(...)`.

### OBS intent

- Use `backgroundAlpha: 0` for transparent overlays and webcam frames.
- Use an opaque `background` only when the page is meant to be a background layer.

## Visual and Performance Guidance

- Prefer typed interfaces for particles, mesh nodes, and projected geometry.
- Avoid per-frame object churn where possible.
- Use depth-aware alpha, size, and ordering for sphere/globe effects.
- Keep resize behavior explicit; most scenes should recalculate layout from the current viewport.
- Use filters and masks sparingly.

## Recent Project Context

As of `2026-04-24`, the latest effect work added and refined a new page called `wavy-planet-mesh`.

### Files added

- `src/app/screens/WavyPlanetMeshScreen.ts`
- `src/wavy-planet-mesh.ts`
- `wavy-planet-mesh.html`

### Files updated

- `vite.config.ts`
- `index.html`

### Feature summary

The user asked for a rotating dotted-grid sphere with a connected mesh and a fluid, wavy surface, effectively a planet-like globe made of linked dots.

The implementation:

- builds a latitude/longitude mesh
- projects it with perspective
- connects adjacent points with depth-aware line rendering
- draws dots at nodes
- animates the surface with wave-based displacement

### Follow-up refinement summary

The next prompt asked for:

- better wave motion
- slower planet rotation
- more realistic dot elevation

The resulting changes in `WavyPlanetMeshScreen.ts` were:

- slower rotation
- slower, broader traveling swells instead of harsher oscillation
- explicit `elevation` and `crest` values
- radius deformation from local elevation
- stronger coupling between wave relief and the mesh line rendering
- dot size/glow/lift driven by elevation so crests read as physical rise

If this page is touched again, keep that physical interpretation intact.

## How To Respond To Similar Prompts

- If the user asks for “a new page”, implement the full three-file page plus Vite/map integration.
- If the user asks for a visual refinement, patch the existing screen math rather than creating a parallel version unless requested.
- For globe, sphere, mesh, or fluid prompts, inspect nearby prior art in:
  - `ParticleGlobeScreen`
  - `DottedMeshScreen`
  - `GeodesicSphereScreen`
  - `WireframeIcosphereScreen`
  - `WireframeSphereCamScreen`

## Validation Expectations

- Preferred checks:
  - `npm run lint`
  - `npm run build`
- If dependencies are missing, report that directly.
- Do not claim visual verification you did not perform.

## Commit Guidance

Use Conventional Commits when creating commits.

Example:

```text
feat(mesh): add wavy planet sphere page
```
