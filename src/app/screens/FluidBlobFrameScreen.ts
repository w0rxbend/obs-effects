import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import { catmullClosed, catmullOpen, mulberry32 } from "./lib/spline";

// ── Fluid Blob Frame ─────────────────────────────────────────────────────────
// Colorful organic blobs clustered around the frame edges over a dark center,
// thin white squiggle lines weaving across, and floating memphis dots. Every
// shape gently morphs/drifts on a slow, seamless, endless loop.

const PINK = 0xee3d6d;
const PURPLE = 0x5b4bd6;
const PURPLE2 = 0x6f63e6;
const YELLOW = 0xf6b21b;
const PALETTE = [PINK, PINK, PURPLE, PURPLE, PURPLE2, YELLOW, YELLOW];

// [normX, normY, sizeScale]
const ANCHORS: [number, number, number][] = [
  [0.02, 0.06, 1.1],
  [0.12, 0.16, 0.9],
  [0.05, 0.34, 1.0],
  [0.18, 0.04, 0.8],
  [-0.02, 0.5, 1.0],
  [0.3, 0.03, 0.8],
  [0.43, 0.08, 0.7],
  [0.6, 0.05, 0.9],
  [0.72, 0.12, 0.8],
  [0.84, 0.04, 1.0],
  [0.95, 0.16, 0.9],
  [0.99, 0.34, 1.0],
  [0.9, 0.44, 0.8],
  [1.0, 0.56, 0.9],
  [0.99, 0.72, 1.0],
  [0.88, 0.82, 0.9],
  [0.96, 0.93, 1.0],
  [0.78, 0.8, 0.8],
  [0.7, 0.94, 0.9],
  [0.84, 0.99, 0.8],
  [0.55, 0.96, 0.8],
  [0.45, 0.9, 0.7],
  [0.06, 0.72, 1.0],
  [0.17, 0.82, 0.9],
  [0.03, 0.92, 1.0],
  [0.24, 0.95, 0.8],
  [0.1, 0.99, 0.8],
  [0.32, 0.88, 0.7],
  [0.0, 0.6, 0.9],
];

// Large soft pools behind everything for depth: [nx, ny, relR, color, alpha]
const DEPTH: [number, number, number, number, number][] = [
  [0.4, 0.4, 0.3, 0x363a55, 0.5],
  [0.62, 0.55, 0.26, 0x363a55, 0.45],
  [0.5, 0.72, 0.28, 0x24263a, 0.5],
  [0.3, 0.55, 0.24, 0x24263a, 0.45],
];

// White squiggle lines, flat normalized control points.
const LINES: number[][] = [
  [0.0, 0.2, 0.16, 0.3, 0.3, 0.14, 0.46, 0.32, 0.62, 0.12],
  [0.54, 0.05, 0.66, 0.2, 0.8, 0.1, 0.93, 0.26],
  [0.04, 0.5, 0.2, 0.62, 0.4, 0.5, 0.62, 0.66, 0.85, 0.52, 1.0, 0.62],
  [0.1, 0.86, 0.3, 0.72, 0.5, 0.88, 0.72, 0.74, 0.92, 0.9],
  [0.26, 0.42, 0.42, 0.56, 0.56, 0.46, 0.5, 0.64],
];

// [nx, ny, color, sizeScale]
const DOTS: [number, number, number, number][] = [
  [0.13, 0.13, 0xffffff, 1.0],
  [0.05, 0.5, 0xffffff, 0.7],
  [0.74, 0.1, 0xffffff, 1.0],
  [0.93, 0.3, YELLOW, 0.7],
  [0.27, 0.52, 0xffffff, 0.8],
  [0.5, 0.74, 0xffffff, 0.9],
  [0.78, 0.52, 0xffffff, 0.8],
  [0.93, 0.62, 0xffffff, 0.7],
  [0.1, 0.7, 0xffffff, 0.8],
  [0.38, 0.86, YELLOW, 0.8],
  [0.2, 0.27, 0xffffff, 0.6],
  [0.62, 0.2, 0xffffff, 0.7],
  [0.86, 0.86, 0xffffff, 0.7],
  [0.34, 0.66, PINK, 0.7],
];

interface Blob {
  nx: number;
  ny: number;
  size: number;
  cx: number;
  cy: number;
  baseR: number;
  relR: number;
  color: number;
  alpha: number;
  verts: number;
  offs: number[];
  ph1: number[];
  ph2: number[];
  f1: number;
  f2: number;
  a1: number;
  a2: number;
  rot: number;
  sx: number;
  sy: number;
  driftA: number;
  driftB: number;
  driftF: number;
  driftP: number;
}

export class FluidBlobFrameScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly depthBlobs: Blob[] = [];
  private readonly blobs: Blob[] = [];
  private time = 0;
  private viewW = 1920;
  private viewH = 1080;
  private seeded = false;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  private makeBlob(
    nx: number,
    ny: number,
    size: number,
    relRBase: number,
    color: number,
    alpha: number,
    rng: () => number,
  ): Blob {
    const verts = 7 + Math.floor(rng() * 4);
    const offs: number[] = [];
    const ph1: number[] = [];
    const ph2: number[] = [];
    for (let k = 0; k < verts; k++) {
      offs.push(0.78 + rng() * 0.5);
      ph1.push(rng() * Math.PI * 2);
      ph2.push(rng() * Math.PI * 2);
    }
    return {
      nx,
      ny,
      size,
      cx: 0,
      cy: 0,
      baseR: 0,
      relR: relRBase + rng() * 0.03,
      color,
      alpha,
      verts,
      offs,
      ph1,
      ph2,
      f1: 0.18 + rng() * 0.22,
      f2: 0.4 + rng() * 0.4,
      a1: 0.05 + rng() * 0.04,
      a2: 0.03 + rng() * 0.03,
      rot: rng() * Math.PI * 2,
      sx: 0.74 + rng() * 0.62,
      sy: 0.74 + rng() * 0.62,
      driftA: 0,
      driftB: 0,
      driftF: 0.12 + rng() * 0.2,
      driftP: rng() * Math.PI * 2,
    };
  }

  private seed(): void {
    this.blobs.length = 0;
    this.depthBlobs.length = 0;

    for (let i = 0; i < DEPTH.length; i++) {
      const [nx, ny, relR, color, alpha] = DEPTH[i];
      const rng = mulberry32(7000 + i * 131);
      const b = this.makeBlob(nx, ny, 1, relR, color, alpha, rng);
      b.f1 *= 0.5;
      b.f2 *= 0.5;
      this.depthBlobs.push(b);
    }

    for (let i = 0; i < ANCHORS.length; i++) {
      const [nx, ny, size] = ANCHORS[i];
      const rng = mulberry32(1000 + i * 97);
      const color = PALETTE[Math.floor(rng() * PALETTE.length)];
      this.blobs.push(this.makeBlob(nx, ny, size, 0.07, color, 1, rng));
    }
  }

  public resize(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    if (!this.seeded) {
      this.seed();
      this.seeded = true;
    }
    const unit = Math.min(width, height);
    for (const b of [...this.depthBlobs, ...this.blobs]) {
      b.cx = b.nx * width;
      b.cy = b.ny * height;
      b.baseR = b.relR * b.size * unit;
      b.driftA = (0.006 + (b.driftP % 1) * 0.01) * unit;
      b.driftB = (0.006 + (b.driftF % 1) * 0.008) * unit;
    }
  }

  private blobPoints(b: Blob): number[] {
    const t = this.time;
    const dx = b.driftA * Math.sin(t * b.driftF + b.driftP);
    const dy = b.driftB * Math.cos(t * b.driftF * 0.9 + b.driftP);
    const cos = Math.cos(b.rot);
    const sin = Math.sin(b.rot);
    const ctrl: number[] = [];
    for (let k = 0; k < b.verts; k++) {
      const a = (k / b.verts) * Math.PI * 2;
      const rmul =
        b.offs[k] *
        (1 +
          b.a1 * Math.sin(t * b.f1 + b.ph1[k]) +
          b.a2 * Math.sin(t * b.f2 + b.ph2[k]));
      const r = b.baseR * rmul;
      const lx = Math.cos(a) * r * b.sx;
      const ly = Math.sin(a) * r * b.sy;
      ctrl.push(
        b.cx + dx + lx * cos - ly * sin,
        b.cy + dy + lx * sin + ly * cos,
      );
    }
    return catmullClosed(ctrl, 10);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    const t = this.time;
    const unit = Math.min(this.viewW, this.viewH);
    const g = this.gfx;
    g.clear();

    for (const b of this.depthBlobs) {
      g.poly(this.blobPoints(b)).fill({ color: b.color, alpha: b.alpha });
    }
    for (const b of this.blobs) {
      g.poly(this.blobPoints(b)).fill({ color: b.color, alpha: b.alpha });
    }

    // White squiggle lines
    const lw = Math.max(1.6, unit * 0.0026);
    for (let li = 0; li < LINES.length; li++) {
      const src = LINES[li];
      const amp = unit * 0.014;
      const f = 0.3 + li * 0.07;
      const ctrl: number[] = [];
      for (let p = 0; p < src.length; p += 2) {
        const ph = li * 1.7 + p;
        ctrl.push(
          src[p] * this.viewW + amp * Math.sin(t * f + ph),
          src[p + 1] * this.viewH + amp * Math.cos(t * f * 1.1 + ph),
        );
      }
      const pts = catmullOpen(ctrl, 14);
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({
        width: lw,
        color: 0xffffff,
        alpha: 0.82,
        cap: "round",
        join: "round",
      });
    }

    // Floating dots
    for (let di = 0; di < DOTS.length; di++) {
      const [nx, ny, color, size] = DOTS[di];
      const bob = unit * 0.01 * Math.sin(t * (0.5 + di * 0.13) + di);
      const x = nx * this.viewW;
      const y = ny * this.viewH + bob;
      const r = (0.004 + 0.0045 * size) * unit;
      if (color === 0xffffff) {
        g.circle(x, y, r * 2.1).fill({ color: 0xffffff, alpha: 0.1 });
      }
      g.circle(x, y, r).fill({ color, alpha: 1 });
    }
  }
}
