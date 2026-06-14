import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Color Wave Ribbons ───────────────────────────────────────────────────────
// A flowing multicolor "river" of overlapping wave ribbons across a soft peach
// field, dressed with memphis-style dots, pill outlines and hatch decorations.
// Each ribbon is a localized horizontal bump that undulates endlessly.

const TAU = Math.PI * 2;

interface Ribbon {
  cx: number; // horizontal center of the bump (0..1)
  span: number; // half-width of the bump (0..1)
  cy: number; // vertical center (0..1)
  amp: number; // primary wave amplitude (0..1 of height)
  amp2: number;
  k: number; // primary wave frequency
  k2: number;
  thick: number; // band thickness (0..1 of height)
  color: number;
  alpha: number;
  speed: number;
  phase: number;
}

// Broad colored bands first (drawn back→front), thin accents last.
const RIBBONS: Ribbon[] = [
  {
    cx: 0.12,
    span: 0.36,
    cy: 0.55,
    amp: 0.04,
    amp2: 0.018,
    k: 1.6,
    k2: 3.1,
    thick: 0.22,
    color: 0x2f86e0,
    alpha: 1,
    speed: 0.5,
    phase: 0.0,
  },
  {
    cx: 0.08,
    span: 0.28,
    cy: 0.62,
    amp: 0.04,
    amp2: 0.02,
    k: 1.8,
    k2: 3.4,
    thick: 0.12,
    color: 0x5ab0ff,
    alpha: 1,
    speed: 0.6,
    phase: 1.1,
  },
  {
    cx: 0.82,
    span: 0.34,
    cy: 0.52,
    amp: 0.045,
    amp2: 0.02,
    k: 1.5,
    k2: 3.0,
    thick: 0.23,
    color: 0x8a3fd6,
    alpha: 1,
    speed: 0.45,
    phase: 2.0,
  },
  {
    cx: 0.9,
    span: 0.28,
    cy: 0.59,
    amp: 0.04,
    amp2: 0.02,
    k: 1.7,
    k2: 3.3,
    thick: 0.13,
    color: 0xb45ce0,
    alpha: 1,
    speed: 0.55,
    phase: 3.2,
  },
  {
    cx: 0.42,
    span: 0.36,
    cy: 0.47,
    amp: 0.05,
    amp2: 0.022,
    k: 1.5,
    k2: 2.9,
    thick: 0.2,
    color: 0xe5356b,
    alpha: 1,
    speed: 0.5,
    phase: 0.6,
  },
  {
    cx: 0.5,
    span: 0.32,
    cy: 0.52,
    amp: 0.05,
    amp2: 0.022,
    k: 1.6,
    k2: 3.1,
    thick: 0.12,
    color: 0xf0545a,
    alpha: 1,
    speed: 0.6,
    phase: 4.0,
  },
  {
    cx: 0.8,
    span: 0.3,
    cy: 0.42,
    amp: 0.05,
    amp2: 0.02,
    k: 1.6,
    k2: 3.2,
    thick: 0.17,
    color: 0xff7b2c,
    alpha: 1,
    speed: 0.55,
    phase: 2.6,
  },
  {
    cx: 0.88,
    span: 0.24,
    cy: 0.47,
    amp: 0.045,
    amp2: 0.02,
    k: 1.8,
    k2: 3.5,
    thick: 0.1,
    color: 0xffa23a,
    alpha: 1,
    speed: 0.65,
    phase: 5.0,
  },
  {
    cx: 0.38,
    span: 0.26,
    cy: 0.44,
    amp: 0.05,
    amp2: 0.02,
    k: 1.7,
    k2: 3.2,
    thick: 0.07,
    color: 0xff5e8a,
    alpha: 0.92,
    speed: 0.62,
    phase: 1.7,
  },
  {
    cx: 0.5,
    span: 0.62,
    cy: 0.53,
    amp: 0.06,
    amp2: 0.024,
    k: 1.4,
    k2: 2.8,
    thick: 0.035,
    color: 0x18215e,
    alpha: 1,
    speed: 0.48,
    phase: 3.7,
  },
  {
    cx: 0.5,
    span: 0.7,
    cy: 0.4,
    amp: 0.055,
    amp2: 0.022,
    k: 1.5,
    k2: 3.0,
    thick: 0.016,
    color: 0xffffff,
    alpha: 0.85,
    speed: 0.52,
    phase: 0.3,
  },
];

// Memphis dots: [nx, ny, color, sizeScale]
const DOTS: [number, number, number, number][] = [
  [0.14, 0.32, 0x2f86e0, 1.0],
  [0.1, 0.46, 0xff7b2c, 0.7],
  [0.32, 0.58, 0xff7b2c, 0.9],
  [0.4, 0.78, 0xf0545a, 1.0],
  [0.63, 0.18, 0x3a9aff, 1.0],
  [0.72, 0.6, 0xf6b21b, 1.0],
  [0.86, 0.52, 0x8a3fd6, 0.8],
  [0.9, 0.34, 0xf0545a, 0.7],
  [0.22, 0.2, 0xf6b21b, 0.8],
  [0.55, 0.66, 0xff7b2c, 0.7],
];

// Pill outlines: [nx, ny, wScale, color]
const PILLS: [number, number, number, number][] = [
  [0.4, 0.3, 1.0, 0xffffff],
  [0.78, 0.72, 0.9, 0xffffff],
  [0.6, 0.62, 0.7, 0xffffff],
];

// 3x3 dot grids: [nx, ny, color]
const GRIDS: [number, number, number][] = [
  [0.12, 0.42, 0xffffff],
  [0.74, 0.66, 0xffffff],
];

// Diagonal hatch clusters: [nx, ny, color]
const HATCHES: [number, number, number][] = [
  [0.08, 0.66, 0xf6b21b],
  [0.48, 0.7, 0xffffff],
];

export class ColorWaveRibbonsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private time = 0;
  private viewW = 1920;
  private viewH = 1080;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
  }

  private ribbonPoints(r: Ribbon, flow: number): number[] {
    const W = this.viewW;
    const H = this.viewH;
    const steps = 56;
    const tops: number[] = [];
    const bots: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const xN = i / steps;
      const x = xN * W;
      const u = (xN - r.cx) / r.span;
      const bump = u <= -1 || u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(u * Math.PI);
      const mid =
        r.cy +
        r.amp * Math.sin(r.k * xN * TAU + r.phase + flow * r.speed) +
        r.amp2 * Math.sin(r.k2 * xN * TAU - r.phase + flow * r.speed * 1.3);
      const half = 0.5 * r.thick * bump;
      tops.push(x, (mid - half) * H);
      bots.push(x, (mid + half) * H);
    }
    const pts: number[] = [];
    for (let i = 0; i < tops.length; i += 2) pts.push(tops[i], tops[i + 1]);
    for (let i = bots.length - 2; i >= 0; i -= 2)
      pts.push(bots[i], bots[i + 1]);
    return pts;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    const t = this.time;
    const W = this.viewW;
    const H = this.viewH;
    const unit = Math.min(W, H);
    const g = this.gfx;
    g.clear();

    // Faint background pools
    g.ellipse(W * 0.3, H * 0.4, unit * 0.34, unit * 0.22).fill({
      color: 0xffffff,
      alpha: 0.16,
    });
    g.ellipse(W * 0.72, H * 0.6, unit * 0.3, unit * 0.2).fill({
      color: 0xffffff,
      alpha: 0.12,
    });

    // Flowing ribbons
    for (const r of RIBBONS) {
      g.poly(this.ribbonPoints(r, t)).fill({ color: r.color, alpha: r.alpha });
    }

    // Dotted 3x3 grids
    const gd = unit * 0.018;
    const gr = unit * 0.006;
    for (const [nx, ny, color] of GRIDS) {
      const bx = nx * W;
      const by = ny * H + unit * 0.006 * Math.sin(t * 0.6 + nx * 10);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          g.circle(bx + c * gd, by + r * gd, gr).fill({ color, alpha: 0.9 });
    }

    // Diagonal hatch clusters
    const hl = unit * 0.055;
    for (const [nx, ny, color] of HATCHES) {
      const bx = nx * W;
      const by = ny * H;
      for (let i = 0; i < 5; i++) {
        const ox = bx + i * unit * 0.016;
        g.moveTo(ox, by).lineTo(ox - hl * 0.55, by + hl);
        g.stroke({ width: unit * 0.004, color, alpha: 0.85, cap: "round" });
      }
    }

    // Pill outlines
    for (const [nx, ny, wScale, color] of PILLS) {
      const pw = unit * 0.07 * wScale;
      const ph = unit * 0.026;
      const bob = unit * 0.006 * Math.sin(t * 0.7 + nx * 8);
      g.roundRect(
        nx * W - pw / 2,
        ny * H - ph / 2 + bob,
        pw,
        ph,
        ph / 2,
      ).stroke({
        width: unit * 0.0035,
        color,
        alpha: 0.9,
      });
    }

    // Memphis dots
    for (let di = 0; di < DOTS.length; di++) {
      const [nx, ny, color, size] = DOTS[di];
      const bob = unit * 0.012 * Math.sin(t * (0.5 + di * 0.11) + di);
      g.circle(nx * W, ny * H + bob, unit * (0.006 + 0.006 * size)).fill({
        color,
        alpha: 1,
      });
    }
  }
}
