# OBS Effects Improvement Plan

## Goal

Turn this repo from a large collection of good standalone OBS visuals into a stronger shader/effects library: more distinctive looks, fewer duplicated patterns, safer integration steps, and predictable validation for every new effect.

## Current Shape

- The project is a Vite + PixiJS 8 multi-page app for OBS Browser Sources.
- Modern effects live mostly in `src/app/screens/*Screen.ts` with small root HTML entry files and `src/*.ts` bootstraps.
- Several older or experimental effects are still large single-file HTML/WebGL pages.
- Shader-heavy Pixi screens already share a repeated pattern: `FILTER_VERT`, full-screen `Sprite(Texture.WHITE)`, `GlProgram`, `UniformGroup`, and `uTime` / `uResolution`.
- New pages must stay wired through `vite.config.ts`, `index.html`, `scripts/effects-catalog.json`, and generated `public/effects-meta.json`.
- There are known catalog hygiene issues worth cleaning later, such as copied filenames with `(1)` and diagnostic fixtures appearing in the public catalog.

## Principles

- Keep effects OBS-ready: responsive, transparent when meant as overlays, and readable at 1920x1080.
- Favor shader depth over simple opacity animation: displacement, domain warping, light response, normals, parallax, and audio-reactive modulation where useful.
- Keep the center of webcam-border effects clean unless the concept intentionally frames a non-camera target.
- Use Pixi screens for new production effects. Legacy single-file WebGL pages can be migrated or kept only when they provide a unique experiment.
- Validate every added page with `npm run lint`, `npm run check:effects-meta`, and `npm run build`.

## Track 1: Shader Foundation

1. Add a shared Pixi shader helper module.
   - Extract the repeated filter vertex shader into `src/lib/shaders/filterVertex.ts`.
   - Add a small helper for full-screen shader quads that owns `Texture.WHITE`, resolution uniforms, and resize behavior.
   - Keep the API thin so existing screens can migrate incrementally.

2. Build a shader screen template.
   - Provide a minimal `ShaderBackgroundScreen` pattern for opaque full-screen backgrounds.
   - Provide a `ShaderOverlayScreen` pattern for alpha-premultiplied webcam borders and overlays.
   - Document required uniforms: `uTime`, `uResolution`, optional `uAudio`, optional `uPointer`.

3. Add visual smoke testing for shader pages.
   - Reuse the Playwright/canvas-pixel approach from `scripts/smoke-three-canaries.js`.
   - Check selected shader pages for a nonblank canvas, viewport-sized rendering, and stable resize.
   - Include transparent overlays by checking alpha distribution, not only RGB variance.

4. Define performance budgets.
   - Target 60 FPS at 1920x1080 on a midrange GPU.
   - Avoid more than 6 FBM octaves in fragment shaders unless the effect is intentionally premium and documented.
   - Prefer low-resolution internal buffers only when blur/refraction can hide the scale.

## Track 2: New Creative Shader Effects

Prioritize these as new production pages. Each should include a screen file, bootstrap file, root HTML file, Vite entry, index entry, catalog metadata, and generated metadata update.

1. `spectral-caustic-cathedral.html`
   - Full-screen background.
   - Raymarched glass/caustic arches with slow chromatic refraction and dust motes.
   - Mood: dark cinematic glass, cyan/gold/white spectral highlights.

2. `ferrofluid-crown-cam.html`
   - Webcam border.
   - Magnetic ferrofluid spikes orbiting a clean center hole, with glossy black liquid, thin neon rim lighting, and audio-reactive spike height.
   - Keep the interior transparent and circular.

3. `reaction-diffusion-coral.html`
   - Full-screen background.
   - GPU-inspired Gray-Scott look using fragment-domain approximation or ping-pong WebGL if needed.
   - Mood: living coral, electric teal, magenta, sulfur yellow accents.

4. `prismatic-glass-frame.html`
   - Webcam border.
   - Layered translucent glass plates, beveled refraction, chromatic edge splitting, and sparse scanning glints.
   - Should look usable over bright or dark camera footage.

5. `volumetric-aurora-tunnel.html`
   - Full-screen background.
   - Deep tunnel with layered aurora curtains, pseudo-volumetric fog, star particles, and subtle camera drift.
   - Distinct from existing `aurora-borealis` by adding depth and forward motion.

6. `solar-corona-ring-cam.html`
   - Webcam border.
   - Transparent central camera hole surrounded by turbulent plasma loops, small prominences, and a rim-lit eclipse edge.
   - Use alpha carefully so it does not become a solid blob.

7. `moire-signal-field.html`
   - Full-screen background or overlay.
   - Interference bands, recursive contour lines, subtle glitch bursts, and signal-lock pulses.
   - Useful for coding/tech stream scenes without being another matrix rain.

8. `liquid-metal-topography.html`
   - Full-screen background.
   - Height-field contours over brushed liquid metal, with specular wave lighting and slow terrain drift.
   - Reuse ideas from topography/marble screens but make it feel physically shaded.

## Track 3: Improve Existing Effects

1. `AetherDriftScreen`
   - Add variant uniforms instead of string replacement for the Razer variant.
   - Improve highlight normals and reduce grain on low-DPI browser captures.
   - Add a third palette that is not purple/green dominated.

2. `WaterSplashRingCamScreen`
   - Add configurable palette variants: clean water, toxic green, molten gold.
   - Improve droplets with velocity trails and asymmetric splash decay.
   - Add a soft inner refraction shimmer while preserving the clean webcam hole.

3. `WavyPlanetMeshScreen`
   - Add optional atmospheric rim and terminator lighting.
   - Make wave elevation visibly affect connection geometry and dot parallax.
   - Add a second mode that feels like data-topography rather than ocean waves.

4. Marble and fluid shader family
   - Consolidate common FBM/noise helpers.
   - Give each marble a stronger identity rather than palette-only variants.
   - Add one high-quality shared lighting model: normals from height, specular, vignette, grain.

5. Audio waveform Razer family
   - Move duplicated audio sampling and waveform shaping into a shared module.
   - Keep variants visually distinct: prism, oscilloscope, blade, ridge, helix, radial, ribbons.
   - Add a no-mic simulation mode that is clearly deterministic and pleasing in OBS preview.

6. Legacy single-file WebGL pages
   - Triage which are worth migrating to Pixi screens.
   - Start with high-value pages: `rain-on-glass.html`, `magma-core.html`, `sequin-wave.html`, `neon-drip.html`, `shifting-veils.html`.
   - Archive or demote duplicates such as `(1)` copies once the better version is confirmed.

## Track 4: Catalog and Integration Hygiene

1. Make catalog data the source of truth.
   - Reduce manual duplication between `vite.config.ts`, `index.html`, and `scripts/effects-catalog.json`.
   - Prefer generated directory data over hand-maintained entries where practical.

2. Clean public metadata.
   - Remove accidental duplicate titles/slugs from copied files like `magma-core(1).html`.
   - Keep diagnostic fixture pages out of the public showcase unless they are explicitly documented as tests.
   - Require every production effect to have category, tags, and a useful description.

3. Add an effect quality checklist.
   - Correct transparency mode.
   - Responsive at 1280x720, 1920x1080, and 2560x1440.
   - No text overflow in directory UI.
   - Canvas is nonblank after 2 seconds.
   - Reduced-motion behavior is acceptable when the page supports it.

4. Improve discovery.
   - Add filters for Shader, Webcam Border, Audio-Reactive, 3D, Background, Transparent, and Experimental.
   - Add optional preview thumbnails later, generated from Playwright screenshots.

## Track 5: Suggested First Sprint

1. Add shared shader helper module and migrate one low-risk shader screen to prove the API.
2. Add `ferrofluid-crown-cam` as the first new webcam-border shader.
3. Add `spectral-caustic-cathedral` as the first new full-screen background shader.
4. Harden metadata checks around duplicate copied pages and public diagnostic fixtures.
5. Run `npm run lint`, `npm run check:effects-meta`, and `npm run build`.
6. Capture Playwright screenshots for the two new effects at desktop and mobile-ish viewports.

## Definition of Done for a New Shader Effect

- It has a production name and root HTML URL.
- It uses the modern Pixi screen pattern unless there is a specific technical reason not to.
- It appears in the local directory and generated metadata.
- It has no hard-coded 1920x1080 assumptions except defaults before first resize.
- It renders correctly with OBS transparency expectations.
- It avoids obvious visual duplication with existing effects.
- It passes lint, metadata checks, TypeScript, and Vite build.
- It has a short note in this plan or README if it introduces a reusable shader technique.

## Backlog Ideas

- WebGPU experiments for ping-pong simulations: reaction diffusion, fluid advection, particle fields.
- Audio bridge presets for subtle, medium, and aggressive reactivity.
- Screenshot-based visual regression for a small curated set of flagship effects.
- Quality badges in the directory: Transparent, Audio, Shader, 3D, Experimental.
- A "showcase" route containing only polished, production-ready OBS sources.
- Parameterized URL query controls, for example `?palette=toxic&speed=0.7&alpha=0.85`.
- Shared palette registry with non-monochrome palettes to keep new effects from collapsing into the same purple/green/dark-blue look.
