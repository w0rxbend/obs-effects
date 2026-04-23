# Conventional Commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

## Format

```
<type>(<scope>): <subject>

<body>
```

## Types

- **feat**: A new feature
- **fix**: A bug fix
- **chore**: Build process, dependencies, tooling
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests

## Examples

```
feat(canvas): add sprite rendering support

Implemented WebGL sprite rendering with batch optimization.
```

```
chore(deps): update pixi.js to v8.0.0
```

```
fix(physics): resolve collision detection bug

Fixes #123
```

## Scope (Optional)

Specify the module or component affected (e.g., `canvas`, `loader`, `physics`).

## Body (Optional)

Provide detailed explanation of changes and motivation.

## Scope Notes

- Never analyze or traverse `node_modules` directory
- Always ignore and skip `node_modules` when gathering context
- Exclude `node_modules` from all file scanning operations

## PixiJS Best Practices

- Use **typed containers** for better performance and maintainability
- Leverage **display lists** efficiently; batch similar objects together
- Implement **object pooling** for frequently created/destroyed entities
- Use **masks and filters** sparingly; they impact performance
- Optimize **texture atlases** to reduce draw calls
- Enable **antialiasing** only when necessary
- Use **PIXI.Container** for grouping related sprites
- Cache **static graphics** as textures to improve rendering speed
- Profile with DevTools to identify bottlenecks

## TypeScript Guidelines

- Define types for custom sprites and containers
- Use strict mode (`"strict": true` in `tsconfig.json`)
- Leverage generics for reusable component patterns

## How to build a Camera Circle Overlay

Follow these steps to create a new animated circular camera overlay (Webcam Border):

1.  **Skeleton Setup:**
    - Create `src/app/screens/YourCamScreen.ts`.
    - Extend `Container` and include `static assetBundles = ["main"]`.
    - Create a specialized `YourCamBorder` class in `src/app/screens/main/` or a dedicated folder.
2.  **Visual Layering:**
    - Define a `baseRadius` (usually ~200px) and use it for all radial calculations.
    - In the border's constructor, initialize multiple `Graphics` objects for specific effects (waves, glow, particles).
    - Use `Container` for elements that require grouping (e.g., orbiting text or sprites).
3.  **Animation Logic:**
    - Implement an `update()` method in the border class that accepts `Ticker` or delta time.
    - Use a global `time` accumulator for phase-based animations (sin/cos).
    - Implement a "beat" system using a decay variable (e.g., `beatAmplitude`) that spikes on a timer and decays back to 1.0.
    - Redraw dynamic shapes in a `drawFrame()` method called by `update()`.
4.  **Assets & Sprites:**
    - Use `Sprite` for complex elements from the `sprite.png` sheet.
    - Use `Texture.from()` in the screen's `show()` method to safely load textures after the bundle is ready.
    - Use `Text` with custom fonts (preloaded in HTML) for tags.
5.  **OBS Optimization:**
    - Ensure the central area remains empty/transparent.
    - In the entry point (`src/yourcam.ts`), initialize the engine with `backgroundAlpha: 0`.
6.  **Integration:**
    - Create `yourcam.html` in the root.
    - Register `yourcam` in `vite.config.ts` under `build.rollupOptions.input`.
    - Add the new page to `map.html` for previewing.

## How to build a Full Screen Background Overlay

Follow these steps to create a new opaque procedural background for OBS scenes:

1.  **Skeleton Setup:**
    - Create `src/app/screens/YourBgScreen.ts` extending `Container`.
    - Initialize a primary `Graphics` object in the constructor.
    - Set `static assetBundles: string[] = []` if no external textures are needed.
2.  **Simulation State:**
    - Define interfaces for your simulation entities (e.g., `Particle`, `Wave`, `Agent`).
    - Store entities in an array within the screen class.
    - Implement an `_initEntities()` method to populate the initial state.
3.  **Animation Loop (PixiJS 8 API):**
    - In `update(ticker: Ticker)`, clear the graphics using `this.gfx.clear()`.
    - Iterate through entities, update their positions using `ticker.deltaTime`.
    - Draw entities using the `Graphics` context: `moveTo()`, `lineTo()`, `stroke({ color, width, alpha })`, `circle()`, `fill({ color, alpha })`.
4.  **Responsiveness:**
    - Implement `resize(w, h)` to capture current dimensions.
    - Call `_initEntities()` inside `resize` to redistribute elements for the new resolution.
5.  **Entry Point & Engine:**
    - Create `src/yourbg.ts`.
    - Initialize `CreationEngine` with an opaque background: `background: 0x11111b` (Catppuccin Crust) and **do not** set `backgroundAlpha: 0`.
6.  **Integration:**
    - Create `yourbg.html` in the root.
    - Register in `vite.config.ts` and add to `map.html`.
