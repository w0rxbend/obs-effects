# OBS Effects: PixiJS Overlay Project

This project is a collection of high-performance, GPU-accelerated visual overlays and backgrounds designed for use as OBS Browser Sources. It leverages **PixiJS 8** and **TypeScript** to create dynamic, transparent, and responsive visuals.

## Core Technologies

- **PixiJS 8:** Used for WebGL/WebGPU rendering. We utilize the Ticker for delta-time based animations, Graphics for procedural shapes, and Containers for scene management.
- **Vite:** Multi-page application (MPA) build system. Each effect has its own `.html` entry point.
- **TypeScript:** Strict typing for all simulation logic and engine components.
- **AssetPack:** Optimized asset processing for textures and fonts.

## Overlay Categories

The project distinguishes between three primary use cases for OBS:

1.  **Webcam Borders:** Animated frames designed to wrap around a camera feed (often circular or rounded). Examples: `hexcam.html`, `wavecam.html`, `main-web-cam-border.html`.
2.  **Full Screen Overlays:** Transparent layers that sit _above_ content, providing HUD elements, ambient particles, or interactive effects. Examples: `atom.html` (when used as an overlay), `matrix-dots.html`, `rain.html`.
3.  **Full Screen Backgrounds:** Opaque or dense simulations intended to serve as the bottom-most layer of a scene. Examples: `background.html`, `topo-landscape.html`, `galaxy-bg.html`, `voronoi-stippling.html` (Digital Organism).

## Color Palette: Catppuccin Mocha

We strictly adhere to the **Catppuccin Mocha** palette for a consistent, professional "hacker" aesthetic across all screens.

| Label        | Hex        | Use Case                       |
| :----------- | :--------- | :----------------------------- |
| **Base**     | `0x1e1e2e` | Primary background color       |
| **Surface0** | `0x313244` | Grid lines, subtle UI elements |
| **Text**     | `0xcdd6f4` | Primary labels                 |
| **Subtext**  | `0xa6adc8` | Secondary info labels          |
| **Mauve**    | `0xcba6f7` | Primary accent / magic         |
| **Blue**     | `0x89b4fa` | Tech / electricity             |
| **Sapphire** | `0x74c7ec` | Water / cold                   |
| **Sky**      | `0x89dceb` | Highlights                     |
| **Teal**     | `0x94e2d5` | Active states                  |
| **Green**    | `0xa6e3a1` | Success / nature               |
| **Yellow**   | `0xf9e2af` | Warnings / energy              |
| **Peach**    | `0xfab387` | Warm accents                   |
| **Red**      | `0xf38ba8` | Danger / hot                   |

## Development Workflow

To add a new screen:

1.  **Screen Logic:** Create a class extending `Container` in `src/app/screens/`.
2.  **Entry Point:** Create a `.ts` file in `src/` to initialize the engine and show the screen.
3.  **HTML:** Create a `.html` file in the root linking to the `.ts` entry point.
4.  **Vite Config:** Register the new `.html` file in the `input` section of `vite.config.ts`.

## Webcam Border Architecture (Circular)

Circular webcam borders (e.g., `CameraScreen.ts`) follow a layered design pattern to ensure transparency and dynamic visuals:

1.  **Screen Class:** Extends `Container` and manages the `CameraBorder` instance. Defines `static assetBundles = ["main"]` to ensure core assets like logos are preloaded.
2.  **Layered Stack:** Visuals are split into multiple `Graphics` or `Container` layers (bottom to top):
    - **Base Ring:** Solid anchor ring (e.g., Catppuccin Mocha Base).
    - **Dynamic Waves:** Animated `Graphics` using wave functions.
    - **VFX:** Sparkles, sparks, and lightning arcs.
    - **Particles:** GPU-accelerated orbiting dots.
3.  **Animation Lifecycle:** 
    - `update(time)`: Uses delta-time for movement and "heartbeat" kicks. 
    - `drawFrame()`: Clears and redraws dynamic `Graphics` layers each frame.
4.  **OBS Integration:** Always set `backgroundAlpha: 0` in the engine init to ensure the center of the circle is transparent for the camera feed.

## Full Screen Background Architecture (Opaque)

Full screen backgrounds (e.g., `GenerativeScreen.ts`) are intended as the bottom layer of an OBS scene and are typically opaque.

1.  **Engine Initialization:** In the entry point (e.g., `src/generative.ts`), set a specific `background` color (e.g., `0x11111b`) and omit `backgroundAlpha: 0` to ensure an opaque fill.
2.  **Procedural Drawing:**
    - Use a single `Graphics` object (e.g., `this.gfx`) added to the screen container.
    - In `update(ticker)`, call `this.gfx.clear()` and redraw the entire simulation state.
    - Utilize PixiJS 8's `stroke()` and `fill()` API for drawing primitives.
3.  **State Management:**
    - Maintain a collection of entities (e.g., `dots: Dot[]`) with properties like `history`, `angle`, `speed`, and `color`.
    - Handle edge logic (e.g., spawning at random margins or wrapping) to ensure the background feels "alive" and continuous.
4.  **Responsiveness:**
    - Implement `resize(w, h)` to update internal width/height variables.
    - Often re-initializes the simulation state (e.g., `_initDots()`) to ensure the distribution matches the new aspect ratio/resolution without stretching.

## Engineering Standards

- **Performance:** Avoid object allocation in `update()` loops. Reuse `Graphics` objects or use `ParticleContainer` for large counts.
- **Transparency:** All screens should default to `backgroundAlpha: 0` unless specifically intended as an opaque background.
- **Responsiveness:** Implement the `resize(w, h)` method to ensure visuals scale correctly to OBS canvas resolutions.
- **Lifecycle Simulations:** For "living" backgrounds (e.g., Voronoi Stippling), use staggered initial ages and long lifespans (30s+) to avoid synchronized "mass death" events and maintain a calm ambient flow.
