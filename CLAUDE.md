# OBS Effects Project Instructions

This repository is a PixiJS 8 / TypeScript multi-page OBS effects collection. Each effect is typically a standalone screen with a matching TS bootstrap file and a root HTML entry consumed by Vite.

## Repo Model

- `src/app/screens/*Screen.ts`: scene implementations.
- `src/*.ts`: page bootstraps that create `CreationEngine`, call `setEngine`, initialize the renderer, and navigate to the screen.
- `*.html` at repo root: per-page Vite entries.
- `vite.config.ts`: defines all page inputs.
- `index.html`: local directory page for browsing effects.

Core runtime files:

- `src/engine/engine.ts`
- `src/app/getEngine.ts`

## Working Rules

- Never inspect `node_modules`.
- Always exclude `node_modules` from file scanning.
- Prefer `rg` for search.
- Assume unrelated local changes may exist and must be preserved.
- Keep changes focused on the requested effect or integration point.

## Implementation Standards

### Pixi screen pattern

- Extend `Container`.
- Keep long-lived `Graphics` instances instead of recreating scene objects every frame.
- Use `update(ticker)` for time-based animation.
- Clamp delta time spikes for stable visuals.
- Recompute geometry/state in `resize(width, height)` when the layout depends on viewport size.

### Entry-point pattern

- `const engine = new CreationEngine()`
- `setEngine(engine)`
- `await engine.init({ ... })`
- `await engine.navigation.showScreen(ScreenClass)`

### OBS usage

- Transparent overlays and webcam borders should usually use `backgroundAlpha: 0`.
- Dense or opaque backgrounds should use a fixed `background` color instead.

## Visual Guidance

- The repo already includes several sphere and mesh references:
  - `ParticleGlobeScreen`
  - `DottedMeshScreen`
  - `GeodesicSphereScreen`
  - `WireframeIcosphereScreen`
  - `WireframeSphereCamScreen`
- Depth should usually affect ordering, alpha, and scale.
- “Fluid” motion should deform geometry, not only pulse color.
- For connected-dot meshes, let neighboring relief influence line treatment when appropriate.

## Latest Relevant Change Set

Recent work introduced a new effect page, `wavy-planet-mesh`.

Added:

- `src/app/screens/WavyPlanetMeshScreen.ts`
- `src/wavy-planet-mesh.ts`
- `wavy-planet-mesh.html`

Updated:

- `vite.config.ts`
- `index.html`

### Intent of the original prompt

The request described a rotating planet-like sphere made from dots and mesh connections, with a wavy, fluid surface. The correct interpretation was to create a full standalone page rather than only a reusable component.

### What the implementation does

- Generates a latitude/longitude mesh.
- Projects it with perspective.
- Connects adjacent nodes with depth-aware mesh lines.
- Draws dots at node positions.
- Adds layered wave displacement so the sphere surface feels alive.

### What changed in the follow-up refinement

The next prompt asked for a slower planet rotation, improved waves, and more realistic dot elevation.

That led to:

- slower rotation speed
- calmer, broader swell motion
- explicit elevation and crest calculations
- radius displacement driven by elevation
- dot lift and highlight responding to elevation
- mesh line alpha/width reacting to local relief

If continuing this effect, preserve the slower and more physical motion profile.

## Request Interpretation

- For terse visual prompts, default to building the thing unless the user explicitly asks for a plan first.
- For “new page” requests, include screen, TS entry, HTML, Vite registration, and `index.html` registration.
- For refinements, update the existing effect directly unless versioning was requested.

## Verification

- Preferred validation is `npm run lint` and `npm run build`.
- If dependencies or tools are unavailable, say so explicitly.
- Do not overstate verification for rendering-heavy changes.

## Quality Gate — Run After Every Implementation

After any code change (screen, entry, shader, config), **always run these three commands in order and fix all reported issues before reporting the task as done**:

```bash
# 1. Format — auto-fixes whitespace / style
npx prettier --write "src/**/*.ts" "*.html"

# 2. Lint — auto-fixes ESLint issues, surfaces remaining errors
npx eslint --fix .

# 3. Type-check — catches unused vars, wrong types, missing imports
npx tsc --noEmit
```

All three must exit cleanly (zero errors, zero warnings) before the implementation is considered complete. Do not skip these for "minor" edits — strict TypeScript (`noUnusedLocals`, `noUnusedParameters`) and Prettier formatting are enforced in CI.

## Commit Guidance

Use Conventional Commits for any commit, for example:

```text
feat(globe): add wavy planet mesh screen
```
