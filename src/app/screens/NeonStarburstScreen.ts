import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;

const COLORS_A = [0x99ff00, 0x66ff00, 0xaaff11]; // lime greens
const COLORS_B = [0xff0077, 0xff0099, 0xff00bb]; // magentas
const COLOR_CYAN = 0x00eeff;
const COLOR_BLUE = 0x0044ff;

const RAY_COUNT = 28;
const EDGE_SEGMENTS = 32; // subdivisions per ray edge for jaggedness
const BASE_ROTATION_SPEED = 0.08; // radians/s

interface RayDef {
  angle: number;
  halfWidth: number;
  color: number;
  jitterScale: number;
  lengthFactor: number;
  phaseA: number;
  phaseB: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export class NeonStarburstScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly rays: RayDef[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildRays();
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.draw();
  }

  private buildRays(): void {
    const rng = seededRandom(0xdeadbeef);

    // Alternate between lime groups and magenta groups
    const slice = TAU / RAY_COUNT;

    for (let i = 0; i < RAY_COUNT; i++) {
      const baseAngle = i * slice;
      const jitterAngle = (rng() - 0.5) * slice * 0.3;
      const isLime = i % 3 !== 2; // 2 lime : 1 magenta roughly
      const colA = isLime
        ? COLORS_A[Math.floor(rng() * COLORS_A.length)]
        : COLORS_B[Math.floor(rng() * COLORS_B.length)];

      this.rays.push({
        angle: baseAngle + jitterAngle,
        halfWidth: (0.025 + rng() * 0.055) * TAU * 0.5,
        color: colA,
        jitterScale: 0.04 + rng() * 0.1,
        lengthFactor: 0.75 + rng() * 0.55,
        phaseA: rng() * TAU,
        phaseB: rng() * TAU,
      });
    }
  }

  private buildRayPath(
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    ray: RayDef,
    rotation: number,
    g: Graphics,
  ): void {
    const angle = ray.angle + rotation;
    const hw = ray.halfWidth;
    const N = EDGE_SEGMENTS;
    const rOuter = outerR * ray.lengthFactor;

    // Left and right edge points from innerR to rOuter
    const pts: { x: number; y: number }[] = [];

    // Left edge: innerR → rOuter (angle - hw side)
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      const r = innerR + (rOuter - innerR) * t;
      // Jaggedness increases toward middle then tapers at tip
      const jitterAmp =
        ray.jitterScale * r * Math.sin(t * Math.PI) * (0.5 + t * 0.5);
      const noise =
        Math.sin(t * 7.3 + this.time * 0.7 + ray.phaseA) * 0.6 +
        Math.sin(t * 13.1 - this.time * 1.1 + ray.phaseB) * 0.4;
      const edgeAngle = angle - hw + noise * jitterAmp * (1 / r);
      pts.push({
        x: cx + Math.cos(edgeAngle) * r,
        y: cy + Math.sin(edgeAngle) * r,
      });
    }

    // Right edge: rOuter → innerR (angle + hw side, reversed)
    for (let s = N; s >= 0; s--) {
      const t = s / N;
      const r = innerR + (rOuter - innerR) * t;
      const jitterAmp =
        ray.jitterScale * r * Math.sin(t * Math.PI) * (0.5 + t * 0.5);
      const noise =
        Math.sin(t * 6.7 + this.time * 0.65 + ray.phaseB) * 0.6 +
        Math.sin(t * 11.9 - this.time * 0.9 + ray.phaseA) * 0.4;
      const edgeAngle = angle + hw + noise * jitterAmp * (1 / r);
      pts.push({
        x: cx + Math.cos(edgeAngle) * r,
        y: cy + Math.sin(edgeAngle) * r,
      });
    }

    if (pts.length === 0) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.closePath();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const outerR = Math.sqrt(cx * cx + cy * cy) * 1.1;
    const innerR = Math.min(this.w, this.h) * 0.07;
    const coreR = Math.min(this.w, this.h) * 0.11;

    // Black background
    g.rect(0, 0, this.w, this.h).fill({ color: 0x000000 });

    const rotation = this.time * BASE_ROTATION_SPEED;

    // Draw rays back-to-front
    for (const ray of this.rays) {
      this.buildRayPath(cx, cy, outerR, innerR, ray, rotation, g);
      g.fill({ color: ray.color, alpha: 0.92 });
    }

    // Accent thin blue slivers on a few rays
    const accentCount = 4;
    for (let i = 0; i < accentCount; i++) {
      const accentRay: RayDef = {
        angle: (i / accentCount) * TAU + rotation * 0.3 + 1.1,
        halfWidth: 0.004,
        color: COLOR_BLUE,
        jitterScale: 0.06,
        lengthFactor: 0.9 + (i % 2) * 0.2,
        phaseA: i * 1.7,
        phaseB: i * 2.3,
      };
      this.buildRayPath(cx, cy, outerR, innerR * 1.2, accentRay, 0, g);
      g.fill({ color: COLOR_BLUE, alpha: 0.7 });
    }

    // Center core glow layers
    const pulse = 1 + Math.sin(this.time * 1.8) * 0.08;

    // Outer soft glow
    g.circle(cx, cy, coreR * 1.9 * pulse).fill({
      color: COLOR_CYAN,
      alpha: 0.08,
    });
    g.circle(cx, cy, coreR * 1.4 * pulse).fill({
      color: COLOR_CYAN,
      alpha: 0.15,
    });

    // Jagged blob edge — render as irregular polygon
    this.drawCyanBlob(g, cx, cy, coreR * pulse);

    // Bright core center
    g.circle(cx, cy, coreR * 0.38 * pulse).fill({
      color: 0xffffff,
      alpha: 0.55,
    });
    g.circle(cx, cy, coreR * 0.22 * pulse).fill({
      color: 0xffffff,
      alpha: 0.85,
    });
  }

  private drawCyanBlob(g: Graphics, cx: number, cy: number, r: number): void {
    const N = 80;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const noise =
        Math.sin(a * 3.7 + this.time * 0.9) * 0.14 +
        Math.sin(a * 5.1 - this.time * 1.4) * 0.09 +
        Math.sin(a * 8.3 + this.time * 0.5) * 0.05;
      const rad = r * (1 + noise);
      pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
    }

    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < N; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fill({ color: COLOR_CYAN, alpha: 0.95 });
  }
}
