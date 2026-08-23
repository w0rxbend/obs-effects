import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { TAU } from "../../lib/math";

// ── Liquid Paper Frame ───────────────────────────────────────────────────────
// Layered paper-cut wave bands flowing in from the top and bottom in purple /
// orange / yellow / cream, framing a clean white center textured with a beige
// halftone screen and floating memphis dots. Edges undulate on an endless loop.

const AMP = 0.028;
const AMP2 = 0.014;
const AMP3 = 0.022;
const K = 2.2;
const K2 = 4.3;
const SPEED = 0.5;

interface Layer {
  fromTop: boolean;
  baseY: number;
  color: number;
  slope: number;
  phase: number;
}

// Drawn in array order; within each band the inner (center-facing) color is
// listed first so later, more-extreme layers leave a strip of each behind.
const LAYERS: Layer[] = [
  { fromTop: true, baseY: 0.3, color: 0xfde6cf, slope: -0.12, phase: 0.0 },
  { fromTop: true, baseY: 0.255, color: 0xf6b21b, slope: -0.12, phase: 0.7 },
  { fromTop: true, baseY: 0.205, color: 0xf2922a, slope: -0.13, phase: 1.5 },
  { fromTop: true, baseY: 0.15, color: 0x7b4aa8, slope: -0.14, phase: 2.3 },
  { fromTop: true, baseY: 0.085, color: 0x4a2a7a, slope: -0.15, phase: 3.0 },
  { fromTop: false, baseY: 0.72, color: 0xfde6cf, slope: 0.1, phase: 1.2 },
  { fromTop: false, baseY: 0.765, color: 0xf6b21b, slope: 0.11, phase: 2.0 },
  { fromTop: false, baseY: 0.81, color: 0xff7a1a, slope: 0.12, phase: 2.8 },
  { fromTop: false, baseY: 0.865, color: 0x7b4aa8, slope: 0.13, phase: 3.6 },
  { fromTop: false, baseY: 0.925, color: 0x6a3f9a, slope: 0.14, phase: 4.4 },
];

// [nx, ny, color, sizeScale]
const CIRCLES: [number, number, number, number][] = [
  [0.12, 0.09, 0xf6b21b, 1.1],
  [0.34, 0.31, 0x6a3f9a, 1.0],
  [0.22, 0.27, 0xfde6cf, 0.7],
  [0.46, 0.2, 0xff7a1a, 0.9],
  [0.6, 0.26, 0xff7a1a, 0.6],
  [0.9, 0.34, 0x6a3f9a, 1.3],
  [0.05, 0.83, 0xff7a1a, 0.9],
  [0.46, 0.78, 0xf6b21b, 0.8],
  [0.6, 0.82, 0xfde6cf, 1.0],
  [0.74, 0.73, 0xfde6cf, 0.8],
  [0.8, 0.69, 0x6a3f9a, 0.6],
];

export class LiquidPaperFrameScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly halftone = new Graphics();
  private readonly gfx = new Graphics();
  private time = 0;
  private viewW = 1920;
  private viewH = 1080;

  constructor() {
    super();
    this.addChild(this.halftone);
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.drawHalftone();
  }

  private drawHalftone(): void {
    const g = this.halftone;
    g.clear();
    const unit = Math.min(this.viewW, this.viewH);
    const step = unit * 0.03;
    const r = step * 0.16;
    for (let y = step * 0.5; y < this.viewH; y += step) {
      for (let x = step * 0.5; x < this.viewW; x += step) {
        g.circle(x, y, r);
      }
    }
    g.fill({ color: 0xf3d8c0, alpha: 0.55 });
  }

  private lineY(xN: number, L: Layer, flow: number): number {
    const wave =
      AMP * Math.sin(K * xN * TAU + L.phase + flow * SPEED) +
      AMP2 * Math.sin(K2 * xN * TAU - L.phase + flow * SPEED * 1.2) +
      AMP3 * Math.sin(xN * TAU + L.phase * 0.5 + flow * SPEED * 0.7);
    return (L.baseY + L.slope * (xN - 0.5) + wave) * this.viewH;
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

    const steps = 60;
    for (const L of LAYERS) {
      const pts: number[] = [];
      pts.push(0, L.fromTop ? 0 : H);
      for (let i = 0; i <= steps; i++) {
        const xN = i / steps;
        pts.push(xN * W, this.lineY(xN, L, t));
      }
      pts.push(W, L.fromTop ? 0 : H);
      g.poly(pts).fill({ color: L.color, alpha: 1 });
    }

    // Floating memphis circles
    for (let ci = 0; ci < CIRCLES.length; ci++) {
      const [nx, ny, color, size] = CIRCLES[ci];
      const bob = unit * 0.01 * Math.sin(t * (0.5 + ci * 0.12) + ci);
      g.circle(nx * W, ny * H + bob, unit * (0.008 + 0.008 * size)).fill({
        color,
        alpha: 1,
      });
    }
  }
}
