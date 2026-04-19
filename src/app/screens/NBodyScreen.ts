import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG        = 0x11111b;
const G_CONST   = 85;
const SOFTENING = 18;
const N         = 180;
const BOUNDARY  = 0.82;

// Speed → color: slow=deep red, fast=white/blue
const SPEED_STOPS: [number, number, number][] = [
  [243, 139, 168],  // red   (slow)
  [250, 179, 135],  // peach
  [249, 226, 175],  // yellow
  [166, 227, 161],  // green
  [148, 226, 213],  // teal
  [137, 180, 250],  // blue  (fast)
  [255, 255, 255],  // white (very fast)
];

interface Body {
  x: number; y: number;
  vx: number; vy: number;
  ax: number; ay: number;
  mass: number;
  radius: number;
}

export class NBodyScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private bodies: Body[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void { this.w = w; this.h = h; }

  private init(): void {
    this.bodies = [];
    const cx    = this.w / 2;
    const cy    = this.h / 2;
    const diskR = Math.min(this.w, this.h) * 0.34;

    for (let i = 0; i < N; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const r      = diskR * Math.sqrt(Math.random() * 0.9 + 0.05);
      const x      = cx + r * Math.cos(angle);
      const y      = cy + r * Math.sin(angle);
      const heavy  = Math.random() < 0.08;
      const mass   = heavy ? 4 + Math.random() * 8 : 0.6 + Math.random() * 1.4;

      // Approximate circular velocity plus noise
      const vCirc  = Math.sqrt(G_CONST * (N * 0.5) / (r + 5)) * 0.7;
      const vx     = -Math.sin(angle) * vCirc + (Math.random() - 0.5) * 18;
      const vy     =  Math.cos(angle) * vCirc + (Math.random() - 0.5) * 18;

      this.bodies.push({ x, y, vx, vy, ax: 0, ay: 0, mass, radius: heavy ? 3 + mass * 0.5 : 1.5 });
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.033);

    // Reset accelerations
    for (const b of this.bodies) { b.ax = 0; b.ay = 0; }

    // Pairwise gravity O(n²)
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a  = this.bodies[i];
        const b  = this.bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
        const r  = Math.sqrt(r2);
        const f  = G_CONST / r2;
        const fx = f * dx / r;
        const fy = f * dy / r;
        a.ax += fx * b.mass;
        a.ay += fy * b.mass;
        b.ax -= fx * a.mass;
        b.ay -= fy * a.mass;
      }
    }

    // Integrate + soft boundary
    const cx     = this.w / 2;
    const cy     = this.h / 2;
    const boundR = Math.min(this.w, this.h) * BOUNDARY;

    for (const b of this.bodies) {
      b.vx += b.ax * dt;
      b.vy += b.ay * dt;
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;

      const dx   = b.x - cx;
      const dy   = b.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > boundR) {
        const excess = (dist - boundR) / boundR;
        b.vx -= (dx / dist) * excess * 35 * dt;
        b.vy -= (dy / dist) * excess * 35 * dt;
      }
    }

    // Draw
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    for (const b of this.bodies) {
      const spd   = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const t     = Math.min(spd / 140, 1);
      const color = gradColor(SPEED_STOPS, t);
      const r     = b.radius;

      if (b.mass > 4) g.circle(b.x, b.y, r * 4).fill({ color, alpha: 0.06 });
      g.circle(b.x, b.y, r * 2).fill({ color, alpha: 0.14 });
      g.circle(b.x, b.y, r    ).fill({ color, alpha: 0.95 });
    }
  }
}

function gradColor(stops: [number, number, number][], t: number): number {
  const n = stops.length - 1;
  const s = Math.max(0, Math.min(0.9999, t)) * n;
  const i = Math.floor(s);
  const f = s - i;
  const a = stops[i]; const b = stops[i + 1];
  return (Math.round(a[0] + (b[0] - a[0]) * f) << 16)
       | (Math.round(a[1] + (b[1] - a[1]) * f) << 8)
       |  Math.round(a[2] + (b[2] - a[2]) * f);
}
