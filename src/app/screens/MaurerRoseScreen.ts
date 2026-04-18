import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────

const CRUST    = 0x11111b;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;

const ACCENTS = [
  0xcba6f7, // Mauve
  0xb4befe, // Lavender
  0x89b4fa, // Blue
  0x74c7ec, // Sapphire
  0x89dceb, // Sky
  0x94e2d5, // Teal
  0xa6e3a1, // Green
  0xf5c2e7, // Pink
  0xf38ba8, // Red
  0xfab387, // Peach
  0xf9e2af, // Yellow
] as const;

// Fixed d values — each produces a fully-formed Maurer rose with n=7.
// Switching is instant (no interpolation) so the shape is always complete.
const D_TARGETS = [71, 97, 29, 113, 43, 127, 19, 151] as const;
const D_HOLD_SECS = 20; // seconds to display each shape

// ── Screen ────────────────────────────────────────────────────────────────────

export class MaurerRoseScreen extends Container {
  public static assetBundles = ["default"];

  private readonly bgGfx:   Graphics;
  private readonly glowGfx: Graphics;
  private readonly roseGfx: Graphics;

  private time = 0;
  private sw = 1920;
  private sh = 1080;

  constructor() {
    super();
    this.bgGfx   = new Graphics();
    this.glowGfx = new Graphics();
    this.roseGfx = new Graphics();
    this.addChild(this.bgGfx);
    this.addChild(this.glowGfx);
    this.addChild(this.roseGfx);
  }

  public show(): Promise<void> { return Promise.resolve(); }

  // ── Maurer rose points: k=0..360, θ=k·d°, r=sin(n·θ) ────────────────────

  private maurerPoints(cx: number, cy: number, radius: number, n: number, d: number, rot: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 360; k++) {
      const theta = (k * d * Math.PI) / 180 + rot;
      const r = Math.sin(n * theta) * radius;
      pts.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)]);
    }
    return pts;
  }

  // ── Smooth rhodonea rose for glow layers ──────────────────────────────────

  private smoothRosePoints(cx: number, cy: number, radius: number, n: number, rot: number): [number, number][] {
    const steps = 1440;
    const end = n % 2 === 0 ? Math.PI * 2 : Math.PI;
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * end * 2 + rot;
      const r = Math.sin(n * theta) * radius;
      pts.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)]);
    }
    return pts;
  }

  private strokePath(gfx: Graphics, pts: [number, number][], color: number, alpha: number, width: number): void {
    if (pts.length === 0) return;
    gfx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i][0], pts[i][1]);
    gfx.stroke({ color, alpha, width, join: "round", cap: "round" });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    this.time += ticker.deltaMS / 1000;
    this.draw();
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const { sw, sh, time } = this;
    const cx = sw / 2;
    const cy = sh / 2;
    const radius = Math.min(sw, sh) * 0.43;

    this.bgGfx.clear();
    this.glowGfx.clear();
    this.roseGfx.clear();

    this.bgGfx.rect(0, 0, sw, sh).fill({ color: CRUST });

    // Slow base rotation
    const rot = time * 0.04;

    // n=7 gives a 7-petal rose with complex Maurer polygon
    const n = 7;

    // Snap to integer d — no interpolation, shape is always fully formed
    const idx = Math.floor(time / D_HOLD_SECS) % D_TARGETS.length;
    const d   = D_TARGETS[idx];
    const idxA = idx; // used below for secondary rose

    // Color pairs cycling slowly
    const ci     = Math.floor(time / 12) % ACCENTS.length;
    const ca     = ACCENTS[ci];
    const cb     = ACCENTS[(ci + 3) % ACCENTS.length];
    const cc     = ACCENTS[(ci + 6) % ACCENTS.length];

    // ── Glow: smooth rhodonea rose ──────────────────────────────────────────

    const smoothPts  = this.smoothRosePoints(cx, cy, radius, n, rot);
    const smoothPts2 = this.smoothRosePoints(cx, cy, radius * 0.72, n, rot + 0.25);

    this.strokePath(this.glowGfx, smoothPts,  ca, 0.035, 28);
    this.strokePath(this.glowGfx, smoothPts,  ca, 0.065, 12);
    this.strokePath(this.glowGfx, smoothPts,  ca, 0.10,  4);

    this.strokePath(this.glowGfx, smoothPts2, cb, 0.025, 20);
    this.strokePath(this.glowGfx, smoothPts2, cb, 0.055, 8);

    // ── Background grid ring (SURFACE0 dots) ─────────────────────────────────

    const gridPts = this.maurerPoints(cx, cy, radius * 0.65, n, d, rot * 0.3);
    this.strokePath(this.roseGfx, gridPts, SURFACE1, 0.12, 1.0);

    // ── Main Maurer rose ──────────────────────────────────────────────────────

    const mainPts = this.maurerPoints(cx, cy, radius, n, d, rot);

    // Outer glow halo
    this.strokePath(this.roseGfx, mainPts, ca, 0.05, 14);
    this.strokePath(this.roseGfx, mainPts, ca, 0.10,  6);
    // Core line
    this.strokePath(this.roseGfx, mainPts, ca, 0.80, 1.2);
    // White shimmer
    this.strokePath(this.roseGfx, mainPts, 0xffffff, 0.08, 2.5);

    // ── Secondary offset Maurer rose ──────────────────────────────────────────

    const secD   = D_TARGETS[(idxA + 2) % D_TARGETS.length];
    const secPts = this.maurerPoints(cx, cy, radius * 0.60, n, secD, -rot * 0.7 + Math.PI / n);

    this.strokePath(this.roseGfx, secPts, cb, 0.04, 10);
    this.strokePath(this.roseGfx, secPts, cb, 0.08,  4);
    this.strokePath(this.roseGfx, secPts, cb, 0.55, 1.0);

    // ── Tertiary inner rose ───────────────────────────────────────────────────

    const terPts = this.maurerPoints(cx, cy, radius * 0.32, n, D_TARGETS[(idxA + 4) % D_TARGETS.length], rot * 1.3);

    this.strokePath(this.roseGfx, terPts, cc, 0.03, 8);
    this.strokePath(this.roseGfx, terPts, cc, 0.40, 0.8);

    // ── Center dot ───────────────────────────────────────────────────────────

    this.roseGfx.circle(cx, cy, 5).fill({ color: ca, alpha: 0.9 });
    this.roseGfx.circle(cx, cy, 12).fill({ color: ca, alpha: 0.18 });
    this.roseGfx.circle(cx, cy, 24).fill({ color: ca, alpha: 0.06 });

    // ── Vignette via SURFACE0 border ──────────────────────────────────────────

    for (let i = 0; i < 5; i++) {
      const inset = i * 40;
      this.bgGfx.rect(inset, inset, sw - inset * 2, sh - inset * 2)
        .stroke({ color: SURFACE0, alpha: 0.018 * (5 - i), width: 40 });
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.sw = width;
    this.sh = height;
  }
}
