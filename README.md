# PixiJS Playground — OBS Stream Overlays

A collection of GPU-accelerated PixiJS 8 overlays and animated screens for use as OBS Browser Sources. All screens render with a transparent background and are designed to layer over your stream.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm (comes with Node)

### Install & Run

```bash
npm install
npm run dev
```

The dev server starts at **http://localhost:8080**

Each screen has its own URL — navigate to one directly:

```
http://localhost:8080/webcam-border-1.html
http://localhost:8080/planet.html
http://localhost:8080/rain.html
# etc.
```

### Build for Production

```bash
npm run build
```

Output goes to `dist/`. You can then serve it with any static file server and point OBS to those URLs.

---

## Screens Overview

### Camera Borders (Webcam Overlays)

| URL | Description |
|-----|-------------|
| `/webcam-border-1.html` | Animated border with logo, graffiti splatters, and decorative geometry |
| `/wavecam.html` | Wave/ripple distortion flowing around the webcam frame |
| `/hexcam.html` | Hexagonal cells forming concentric rings around the camera |
| `/hexgridcam.html` | Dense hex grid tessellation with animated color cycling |
| `/hexlayercam.html` | Multi-layer independently-rotating hex rings |
| `/trapcam.html` | Trapezoidal geometric frame with warping distortion |

### Background / Full-Scene Overlays

| URL | Description |
|-----|-------------|
| `/background.html` | Tech-symbol boids flocking with comets and ambient particles |
| `/matrix-dots.html` | Catppuccin grid dots repelled by particles, with connection lines |
| `/generative.html` | Sinusoidal phase-trail dots drawing colorful procedural paths |
| `/triangulation.html` | Delaunay-style triangulation network with flowing geometry |
| `/rain.html` | Water ripple/splash effects with expanding circles |
| `/atom.html` | Atomic model — nucleus, electron orbits, quantum particle effects |
| `/planet.html` | Planetary orbital simulation with gravitational dynamics |
| `/aquarium.html` | Ambient aquarium-style particle visualization |

### Branding / Transition Screens

| URL | Description |
|-----|-------------|
| `/logo.html` | Heartbeat ECG + orbiting dots + LIVE indicator |
| `/break.html` | "Breaking news"-style overlay with animated symbol glyphs |
| `/music-break.html` | Music visualizer / audio-reactive break screen |
| `/confidential.html` | Classified / redacted information display |
| `/title-powerline.html` | Scrolling news ticker with green band and audio symbols |
| `/placeholder-1.html` | Generic placeholder for layout testing |

---

## Adding a Screen to OBS as a Browser Source

### Step 1 — Add a Browser Source

1. In OBS, click **+** in the **Sources** panel.
2. Select **Browser**.
3. Give it a name (e.g. `Webcam Border`).

### Step 2 — Configure the Browser Source

| Setting | Value |
|---------|-------|
| **URL** | `http://localhost:8080/webcam-border-1.html` (or whichever screen) |
| **Width** | Match your canvas resolution (e.g. `1920`) |
| **Height** | Match your canvas resolution (e.g. `1080`) |
| **Custom CSS** | Leave blank — transparency is built in |
| **Shutdown source when not visible** | Optional — saves GPU when scene is hidden |
| **Refresh browser when scene becomes active** | Recommended for animated screens |

> All screens already set `background: transparent` and `backgroundAlpha: 0` in PixiJS, so you do **not** need to enable "Allow transparency" separately in OBS — it works automatically with browser sources.

### Step 3 — Layer It Correctly

- Place the browser source **above** your Webcam/Video Capture source in the sources list.
- Use OBS **Filters** on your webcam source if you need to crop or color-correct it independently.

---

## Making Your Webcam Feed Circular (Image Mask)

Camera border screens are designed to frame a circular or rounded webcam feed. To make the webcam itself circular in OBS:

### Method A — Image Mask Filter (Recommended)

1. Select your **Video Capture Device** (webcam) source.
2. Click the **Filters** button (or right-click → Filters).
3. Click **+** → **Image Mask/Blend**.
4. Set **Type** to `Alpha Mask (Alpha Channel)`.
5. Click **Browse** and select a circular mask PNG.

**The mask PNG** should be a white-filled circle on a transparent (or black) background, sized to match your webcam crop. A 1000×1000 or 512×512 white circle on transparency works well.

You can create one quickly in any image editor (GIMP, Photoshop, Figma) — draw a circle, fill white, export as PNG with transparency. Free ones are also available by searching "OBS circular webcam mask PNG".

### Method B — Crop + Corner Rounding (OBS 30+)

1. Select your webcam source.
2. Right-click → **Filters** → **+** → **Crop/Pad**.
3. Crop to a square (equal width/height).
4. Add another filter: **Round Corners** (available in OBS 30+).
5. Set radius to `50%` for a perfect circle.

### Aligning the Circular Feed with a Camera Border Screen

- Use the **Edit Transform** dialog (right-click → Transform → Edit Transform) to position and scale the webcam source.
- The camera border screens (e.g. `webcam-border-1.html`, `hexcam.html`) are centered and sized relative to the full canvas — position your circular webcam in the center of the scene at roughly `400×400` to `600×600` px depending on the border design.
- Toggle the browser source visibility while adjusting to see the frame alignment.

---

## Dev Notes

- **Tech stack:** PixiJS 8, TypeScript, Vite, Motion, Pixi Sound
- **Color theme:** Catppuccin Mocha throughout
- **All screens** are transparent-background by default — no chroma key needed
- Adding a new screen: create `src/MyScreen.ts` + `my-screen.html`, register the HTML entry in `vite.config.ts`
