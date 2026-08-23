import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerp } from "../../lib/math";

const BG = 0x11111b;

const COUNT = 2000;
const GM = 900_000; // G × M_central
const SOFTENING = 25; // prevents singularity
const FOCAL = 700; // perspective focal length

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export class GravitySphereScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;

  private particles: Particle[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {
    /* nothing to clean up */
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.init();
  }

  private init(): void {
    this.particles = [];
    const maxR = Math.min(this.w, this.h) * 0.42;
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = maxR * (0.05 + Math.random() * 0.95);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      const rXZ = Math.sqrt(x * x + z * z) + 1e-6;
      const v0 = Math.sqrt(GM / Math.max(r, 10));
      this.particles.push({
        x,
        y,
        z,
        vx: (-z / rXZ) * v0 * (0.7 + Math.random() * 0.6),
        vy: (Math.random() - 0.5) * v0 * 0.25,
        vz: (x / rXZ) * v0 * (0.7 + Math.random() * 0.6),
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    const g = this.gfx;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const maxR = Math.min(this.w, this.h) * 0.55;

    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    for (const p of this.particles) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      const rSft = Math.max(r, SOFTENING);
      const fMag = GM / (rSft * rSft);

      p.vx -= (p.x / rSft) * fMag * dt;
      p.vy -= (p.y / rSft) * fMag * dt;
      p.vz -= (p.z / rSft) * fMag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (r > maxR) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const nr = maxR * 0.35 * (0.2 + Math.random() * 0.8);
        p.x = nr * Math.sin(phi) * Math.cos(theta);
        p.y = nr * Math.sin(phi) * Math.sin(theta);
        p.z = nr * Math.cos(phi);
        const rXZ = Math.sqrt(p.x * p.x + p.z * p.z) + 1e-6;
        const v0 = Math.sqrt(GM / Math.max(nr, 10));
        p.vx = (-p.z / rXZ) * v0;
        p.vy = (Math.random() - 0.5) * v0 * 0.2;
        p.vz = (p.x / rXZ) * v0;
      }
    }

    // Painter's order: back → front
    const sorted = this.particles.slice().sort((a, b) => a.z - b.z);
    const maxSpd = Math.sqrt(GM / SOFTENING) * 1.5;

    for (const p of sorted) {
      const scale = FOCAL / (FOCAL + p.z + FOCAL * 0.5);
      const sx = cx + p.x * scale;
      const sy = cy + p.y * scale;

      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
      const t = Math.min(spd / maxSpd, 1);
      const color = speedColor(t);

      const radius = Math.max(0.4, 1.8 * scale);
      const alpha = Math.min(0.9, 0.25 + 0.75 * scale) * (0.35 + 0.65 * t);

      g.circle(sx, sy, radius).fill({ color, alpha });
      if (t > 0.6) {
        g.circle(sx, sy, radius * 3).fill({
          color,
          alpha: (t - 0.6) * 0.3 * alpha,
        });
      }
    }

    // Central star
    for (let i = 5; i >= 1; i--) {
      g.circle(cx, cy, i * 14).fill({ color: 0xfdf4d3, alpha: 0.045 / i });
    }
    g.circle(cx, cy, 10).fill({ color: 0xfdf4d3, alpha: 1.0 });
    g.circle(cx, cy, 5).fill({ color: 0xffffff, alpha: 1.0 });
  }
}

// t=0: deep red  t=0.5: sapphire blue  t=1: white
function speedColor(t: number): number {
  let r: number, gr: number, b: number;
  if (t < 0.5) {
    const s = t * 2;
    r = lerp(0xf3, 0x74, s);
    gr = lerp(0x8b, 0xc7, s);
    b = lerp(0xa8, 0xec, s);
  } else {
    const s = (t - 0.5) * 2;
    r = lerp(0x74, 0xff, s);
    gr = lerp(0xc7, 0xff, s);
    b = lerp(0xec, 0xff, s);
  }
  return (Math.round(r) << 16) | (Math.round(gr) << 8) | Math.round(b);
}
