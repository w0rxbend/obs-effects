// Plasma Wave — pure Canvas2D, no PixiJS
// Rendered at 1/4 resolution and CSS-upscaled for smooth "oil on water" look.

const SCALE = 4;  // downscale factor: renders at 1/4 width & height

// ── Color palette: deep violet → magenta → teal → back ───────────────────────
const PALETTE: [number, number, number][] = [
  [30,  10,  80],   // deep violet
  [90,  10, 140],   // purple
  [180, 30, 200],   // magenta
  [20, 180, 180],   // teal
  [10, 120, 160],   // dark teal / cyan
  [30,  10,  80],   // back to deep violet
];

function paletteColor(t: number): [number, number, number] {
  const tt = ((t % 1) + 1) % 1;  // wrap to [0,1]
  const n  = PALETTE.length - 1;
  const s  = tt * n;
  const i  = Math.floor(s);
  const f  = s - i;
  const a  = PALETTE[i];
  const b  = PALETTE[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx    = canvas.getContext("2d")!;

let rw = 0, rh = 0;   // render (downscaled) dimensions
let pixels: ImageData;

function resize(): void {
  rw = Math.ceil(window.innerWidth  / SCALE);
  rh = Math.ceil(window.innerHeight / SCALE);
  canvas.width  = rw;
  canvas.height = rh;
  pixels = ctx.createImageData(rw, rh);
}

resize();
window.addEventListener("resize", resize);

// ── Animation loop ────────────────────────────────────────────────────────────
let t        = 0;
let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;
  t        += dt;

  const data = pixels.data;
  const cxPx = (rw * SCALE) / 2;  // screen-space centre
  const cyPx = (rh * SCALE) / 2;

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      // Work in screen-space pixels for consistent feel at any resolution
      const px = x * SCALE;
      const py = y * SCALE;
      const dx = px - cxPx;
      const dy = py - cyPx;
      const d  = Math.sqrt(dx * dx + dy * dy);

      // Layered sine field — four independent waves produce interference bands
      const v =
        Math.sin(px / 90 + t * 0.55) +
        Math.sin(py / 70 - t * 0.40) +
        Math.sin((px * 0.7 + py * 0.7) / 80 + t * 0.30) +
        Math.sin(d  / 90 - t * 0.70);

      // v ∈ [-4, 4]; normalise to [0, 1] and rotate palette slowly
      const norm        = (v + 4) / 8;
      const [r, g, b]   = paletteColor(norm + t * 0.04);

      const idx         = (y * rw + x) * 4;
      data[idx]         = r;
      data[idx + 1]     = g;
      data[idx + 2]     = b;
      data[idx + 3]     = 255;
    }
  }

  ctx.putImageData(pixels, 0, 0);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
