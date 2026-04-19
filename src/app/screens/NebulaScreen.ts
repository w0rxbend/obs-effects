import type { Ticker } from "pixi.js";
import { Container, Sprite, Texture } from "pixi.js";

// ── Permutation table (seeded deterministic shuffle) ─────────────────────────
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0xfa7e1337;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();

// 12 gradient directions for 3-D Perlin noise
const G3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function fade(t: number) { return t * t * t * (t * (6 * t - 15) + 10); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix,        fy = y - iy,        fz = z - iz;
  const X  = ix & 255,      Y  = iy & 255,      Z  = iz & 255;
  const u  = fade(fx),      v  = fade(fy),       w = fade(fz);

  const dot = (gi: number, dx: number, dy: number, dz: number) => {
    const g = G3[gi % 12];
    return g[0] * dx + g[1] * dy + g[2] * dz;
  };

  return lerp(
    lerp(
      lerp(dot(PERM[X   + PERM[Y   + PERM[Z  ]]], fx,   fy,   fz  ),
           dot(PERM[X+1 + PERM[Y   + PERM[Z  ]]], fx-1, fy,   fz  ), u),
      lerp(dot(PERM[X   + PERM[Y+1 + PERM[Z  ]]], fx,   fy-1, fz  ),
           dot(PERM[X+1 + PERM[Y+1 + PERM[Z  ]]], fx-1, fy-1, fz  ), u), v),
    lerp(
      lerp(dot(PERM[X   + PERM[Y   + PERM[Z+1]]], fx,   fy,   fz-1),
           dot(PERM[X+1 + PERM[Y   + PERM[Z+1]]], fx-1, fy,   fz-1), u),
      lerp(dot(PERM[X   + PERM[Y+1 + PERM[Z+1]]], fx,   fy-1, fz-1),
           dot(PERM[X+1 + PERM[Y+1 + PERM[Z+1]]], fx-1, fy-1, fz-1), u), v),
    w);
}

// Fractional Brownian motion — 5 octaves.
// z is the time axis; each octave gets an offset so it evolves independently.
function fbm(x: number, y: number, z: number): number {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 5; i++) {
    val += noise3(x * freq, y * freq, z) * amp;
    amp  *= 0.5;
    freq *= 2.1;
    z    += 4.73; // distinct time slice per octave
  }
  return val; // ≈ [-0.68, 0.68] in practice
}

// ── Catppuccin Mocha color stops ─────────────────────────────────────────────
// [threshold, [R, G, B]] — sorted ascending
const STOPS: Array<[number, [number, number, number]]> = [
  [0.00, [0x11, 0x11, 0x1b]], // Crust  — void
  [0.18, [0x11, 0x11, 0x1b]], // deep void
  [0.30, [0xcb, 0xa6, 0xf7]], // Mauve  — thin outer wisps
  [0.46, [0xf5, 0xc2, 0xe7]], // Pink
  [0.61, [0xfa, 0xb3, 0x87]], // Peach
  [0.76, [0x89, 0xb4, 0xfa]], // Blue
  [0.89, [0xc6, 0xda, 0xff]], // pale blue
  [1.00, [0xee, 0xf0, 0xff]], // near-white dense core
];

function colorAt(v: number): [number, number, number] {
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const t = (v - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]);
      const a = STOPS[i - 1][1], b = STOPS[i][1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// ── Grid dimensions (160×90 → stretched to full screen via Sprite) ────────────
const GW = 160;
const GH = 90;

export class NebulaScreen extends Container {
  public static assetBundles: string[] = [];

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private imgData!: ImageData;
  private sprite!: Sprite;
  private texture!: Texture;

  private w = 1920;
  private h = 1080;
  private time = 0;

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;

    this.canvas        = document.createElement("canvas");
    this.canvas.width  = GW;
    this.canvas.height = GH;
    this.ctx     = this.canvas.getContext("2d")!;
    this.imgData = this.ctx.createImageData(GW, GH);
    for (let i = 3; i < this.imgData.data.length; i += 4) this.imgData.data[i] = 255;

    this.texture = Texture.from(this.canvas);
    this.sprite  = new Sprite(this.texture);
    this.sprite.anchor.set(0, 0);
    this.addChild(this.sprite);
    this._applySize();
  }

  public async hide(): Promise<void> {
    this.sprite?.destroy();
    this.texture?.destroy();
  }

  public resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this._applySize();
  }

  private _applySize(): void {
    if (!this.sprite) return;
    this.sprite.width  = this.w;
    this.sprite.height = this.h;
  }

  public update(ticker: Ticker): void {
    this.time += Math.min(ticker.deltaMS / 1000, 0.033);
    this._render();
  }

  private _render(): void {
    const t  = this.time;
    const px = this.imgData.data;

    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        // Noise-space coords — scale 3.2 gives broad cloud features
        const nx = (i / GW) * 3.2;
        const ny = (j / GH) * 3.2;

        // ── Domain warp (single level): offset sample coords with slow noise ──
        const wx = noise3(nx + 1.7,  ny + 0.0, t * 0.05) * 1.05;
        const wy = noise3(nx + 0.0,  ny + 5.3, t * 0.045) * 1.05;

        // ── fBm sampled at warped coords — produces wispy tendril shapes ──────
        const raw = fbm(nx + wx, ny + wy, t * 0.025);

        // Map ≈ [-0.68, 0.68] → [0, 1]; multiply by 0.72 rescales practical range
        let v = raw * 0.72 + 0.5;
        v = Math.max(0, Math.min(1, v));

        // Non-linear density curve: flattens low values (dark void), preserves peaks
        v = Math.pow(v, 1.6);

        // Subtle vignette — edges gently fade to void without a visible circle
        const cx = (i / GW) - 0.5;
        const cy = (j / GH) - 0.5;
        const d2 = cx * cx + cy * cy;
        v *= Math.max(0, 1 - d2 * 1.8);

        const [r, g, b] = colorAt(v);
        const p4 = (j * GW + i) * 4;
        px[p4]     = r + 0.5 | 0;
        px[p4 + 1] = g + 0.5 | 0;
        px[p4 + 2] = b + 0.5 | 0;
      }
    }

    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.source.update();
  }
}
