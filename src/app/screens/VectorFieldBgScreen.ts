import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ─── constants ────────────────────────────────────────────────────────────────

const CRUST = 0x11111b;

const ACCENTS = [
  0xcba6f7, // mauve
  0xf38ba8, // red
  0xfab387, // peach
  0xf9e2af, // yellow
  0xa6e3a1, // green
  0x94e2d5, // teal
  0x89dceb, // sky
  0x89b4fa, // blue
  0xb4befe, // lavender
  0xf5c2e7, // pink
];

const NC = ACCENTS.length;

const PARTICLE_COUNT = 4000;
const TRAIL_LEN = 12;
const NOISE_SCALE = 0.0056;
const FIELD_DRIFT = 0.0022;
const MAX_SPEED = 1.4;
const FORCE = 0.095;
const FRICTION = 0.955;
const GRID_CELL = 40; // px per noise-grid cell

// ─── types ────────────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ci: number; // index into ACCENTS
  trail: Float32Array; // interleaved x,y ring buffer
  head: number;
  filled: number;
}

// ─── noise ────────────────────────────────────────────────────────────────────

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (d - b + a - c) * ux * uy;
}

function evalAngle(wx: number, wy: number, z: number): number {
  const n1 = vnoise(wx * NOISE_SCALE + z, wy * NOISE_SCALE + z * 0.73);
  const n2 = vnoise(
    wx * NOISE_SCALE * 2.1 + z * 1.4 + 5.2,
    wy * NOISE_SCALE * 2.1 + z * 1.1 + 3.1,
  );
  return (n1 * 0.68 + n2 * 0.32) * Math.PI * 4;
}

// ─── screen ───────────────────────────────────────────────────────────────────

export class VectorFieldBgScreen extends Container {
  public static assetBundles = ["default"];

  private gfx: Graphics;
  private particles: Particle[] = [];
  // particles bucketed by color — rebuilt once at spawn, never mutated
  private byColor: Particle[][] = Array.from({ length: NC }, () => []);
  private fieldZ = 0;
  private w = 0;
  private h = 0;

  // pre-computed angle grid — refreshed each frame, ~1450 cells vs 4000 per-particle evals
  private gW = 0;
  private gH = 0;
  private grid = new Float32Array(0);

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);
  }

  public show(): Promise<void> {
    this.spawnParticles();
    return Promise.resolve();
  }

  private spawnParticles(): void {
    for (const arr of this.byColor) arr.length = 0;
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ci = Math.floor(Math.random() * NC);
      const p: Particle = {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: 0,
        vy: 0,
        ci,
        trail: new Float32Array(TRAIL_LEN * 2),
        head: 0,
        filled: 0,
      };
      this.particles.push(p);
      this.byColor[ci].push(p);
    }
  }

  private buildGrid(): void {
    const gw = Math.ceil(this.w / GRID_CELL) + 2;
    const gh = Math.ceil(this.h / GRID_CELL) + 2;
    if (gw !== this.gW || gh !== this.gH) {
      this.gW = gw;
      this.gH = gh;
      this.grid = new Float32Array(gw * gh);
    }
    const z = this.fieldZ;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        this.grid[gy * gw + gx] = evalAngle(gx * GRID_CELL, gy * GRID_CELL, z);
      }
    }
  }

  private lookupAngle(x: number, y: number): number {
    const gx = Math.min((x / GRID_CELL) | 0, this.gW - 1);
    const gy = Math.min((y / GRID_CELL) | 0, this.gH - 1);
    return this.grid[gy * this.gW + gx];
  }

  public update(time: Ticker): void {
    const dt = Math.min(time.deltaTime, 3);
    this.fieldZ += FIELD_DRIFT * dt;
    const { w, h } = this;

    this.buildGrid();

    for (const p of this.particles) {
      const a = this.lookupAngle(p.x, p.y);

      p.vx = (p.vx + Math.cos(a) * FORCE * dt) * FRICTION;
      p.vy = (p.vy + Math.sin(a) * FORCE * dt) * FRICTION;

      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > MAX_SPEED) {
        p.vx = (p.vx / spd) * MAX_SPEED;
        p.vy = (p.vy / spd) * MAX_SPEED;
      }

      p.trail[p.head * 2] = p.x;
      p.trail[p.head * 2 + 1] = p.y;
      p.head = (p.head + 1) % TRAIL_LEN;
      if (p.filled < TRAIL_LEN) p.filled++;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Reset trail on wrap — prevents a line being drawn across the canvas edge
      if (p.x < 0) {
        p.x += w;
        p.filled = 0;
      } else if (p.x > w) {
        p.x -= w;
        p.filled = 0;
      }
      if (p.y < 0) {
        p.y += h;
        p.filled = 0;
      } else if (p.y > h) {
        p.y -= h;
        p.filled = 0;
      }
    }

    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill(CRUST);

    // Batch all segments of the same age+color into one stroke() call.
    // This reduces stroke calls from O(particles × trail) to O(trail × colors) ≈ 110/frame.
    for (let age = 1; age < TRAIL_LEN; age++) {
      const t = age / (TRAIL_LEN - 1);
      const alpha = t * t * 0.72;
      const width = 0.4 + t * 1.4;

      for (let ci = 0; ci < NC; ci++) {
        let any = false;
        for (const p of this.byColor[ci]) {
          if (p.filled <= age) continue;
          const oldest = (p.head - p.filled + TRAIL_LEN * 64) % TRAIL_LEN;
          const ai = ((oldest + age - 1) % TRAIL_LEN) * 2;
          const bi = ((oldest + age) % TRAIL_LEN) * 2;
          g.moveTo(p.trail[ai], p.trail[ai + 1]).lineTo(
            p.trail[bi],
            p.trail[bi + 1],
          );
          any = true;
        }
        if (any) g.stroke({ color: ACCENTS[ci], alpha, width });
      }
    }
  }

  public resize(width: number, height: number): void {
    if (this.w > 0) {
      const sx = width / this.w;
      const sy = height / this.h;
      for (const p of this.particles) {
        p.x *= sx;
        p.y *= sy;
        for (let i = 0; i < TRAIL_LEN; i++) {
          p.trail[i * 2] *= sx;
          p.trail[i * 2 + 1] *= sy;
        }
      }
    }
    this.w = width;
    this.h = height;
    if (!this.particles.length) this.spawnParticles();
  }
}
