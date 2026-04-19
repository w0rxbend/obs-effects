import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Catppuccin Mocha
const CRUST    = 0x11111b;
const MAUVE    = 0xcba6f7;
const RED      = 0xf38ba8;
const PEACH    = 0xfab387;
const YELLOW   = 0xf9e2af;
const GREEN    = 0xa6e3a1;
const TEAL     = 0x94e2d5;
const SKY      = 0x89dceb;
const SAPPHIRE = 0x74c7ec;
const BLUE     = 0x89b4fa;
const LAVENDER = 0xb4befe;
const PINK     = 0xf5c2e7;

const PALETTE = [MAUVE, RED, PEACH, YELLOW, GREEN, TEAL, SKY, SAPPHIRE, BLUE, LAVENDER, PINK] as const;

const TAU       = Math.PI * 2;
const PHI       = (1 + Math.sqrt(5)) / 2;
const TILT      = 0.38;
const ROT_SPEED = 0.14;
const FOCAL     = 2200;

type Vec3 = [number, number, number];

const BASE_VERTS: Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const BASE_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

function norm(v: Vec3): Vec3 {
  const l = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function buildIcosphere(subs: number): { verts: Vec3[]; edges: [number, number][] } {
  let verts = BASE_VERTS.map(norm);
  let faces: [number, number, number][] = [...BASE_FACES];

  for (let s = 0; s < subs; s++) {
    const cache = new Map<string, number>();
    const next: [number, number, number][] = [];
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = cache.get(k);
      if (i !== undefined) return i;
      i = verts.length;
      const va = verts[a], vb = verts[b];
      verts.push(norm([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
      cache.set(k, i);
      return i;
    };
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of faces) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (!seen.has(k)) { seen.add(k); edges.push([i, j]); }
    }
  }

  return { verts, edges };
}

// Precompute at load time — subdivision 2 gives 162 verts, 480 edges
const ICOSPHERE = buildIcosphere(2);

function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

interface StarParticle {
  x: number; y: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: number;
}

interface SurfaceParticle {
  ux: number; uy: number; uz: number;
  color: number;
  size: number;
  phase: number;
  pulseSpeed: number;
}

interface FloatParticle {
  x: number; y: number;
  vx: number; vy: number;
  color: number;
  size: number;
  alpha: number;
  alphaDir: number;
}

const STAR_COUNT    = 260;
const SURFACE_COUNT = 85;
const FLOAT_COUNT   = 48;

export class WireframeIcosphereScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private stars: StarParticle[] = [];
  private surface: SurfaceParticle[] = [];
  private floaters: FloatParticle[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  private get R(): number { return Math.min(this.w, this.h) * 0.36; }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.spawn();
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.spawn();
  }

  private spawn(): void {
    const { w, h } = this;

    this.stars = Array.from({ length: STAR_COUNT }, () => {
      const ba = rand(0.15, 0.95);
      return {
        x: rand(0, w),
        y: rand(0, h),
        size: rand(0.5, 2.6),
        baseAlpha: ba,
        alpha: ba,
        twinkleSpeed: rand(0.4, 2.2),
        twinklePhase: rand(0, TAU),
        color: Math.random() < 0.3 ? pick(PALETTE) : 0xcdd6f4,
      };
    });

    // Uniform distribution on sphere via spherical coords
    this.surface = Array.from({ length: SURFACE_COUNT }, () => {
      const u = rand(0, 1);
      const v = rand(0, 1);
      const lat = Math.acos(2 * u - 1) - Math.PI / 2;
      const lon = TAU * v;
      return {
        ux: Math.cos(lat) * Math.cos(lon),
        uy: Math.sin(lat),
        uz: Math.cos(lat) * Math.sin(lon),
        color: pick(PALETTE),
        size: rand(2.4, 5.8),
        phase: rand(0, TAU),
        pulseSpeed: rand(0.02, 0.07),
      };
    });

    const cx = w / 2, cy = h / 2, R = this.R;
    this.floaters = Array.from({ length: FLOAT_COUNT }, () => {
      const a = rand(0, TAU);
      const d = rand(R * 1.12, R * 2.3);
      return {
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        vx: rand(-0.22, 0.22),
        vy: rand(-0.22, 0.22),
        color: pick(PALETTE),
        size: rand(1.5, 4.0),
        alpha: rand(0.3, 0.88),
        alphaDir: Math.random() < 0.5 ? 1 : -1,
      };
    });
  }

  private project(v: Vec3, rot: number): { x: number; y: number; z: number } {
    const [sx, sy, sz] = v;
    const R = this.R;

    // Y-axis rotation
    const rx = sx * Math.cos(rot) - sz * Math.sin(rot);
    const ry = sy;
    const rz = sx * Math.sin(rot) + sz * Math.cos(rot);

    // X-axis tilt
    const ty = ry * Math.cos(TILT) - rz * Math.sin(TILT);
    const tz = ry * Math.sin(TILT) + rz * Math.cos(TILT);

    const scale = FOCAL / (FOCAL - tz * R);
    return {
      x: this.w / 2 + rx * R * scale,
      y: this.h / 2 + ty * R * scale,
      z: tz,
    };
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    const rot = this.time * ROT_SPEED;

    // Update twinkle phases
    for (const s of this.stars) {
      s.twinklePhase += s.twinkleSpeed * dt;
      s.alpha = s.baseAlpha * (0.45 + 0.55 * Math.sin(s.twinklePhase));
    }

    // Update surface pulse phases
    for (const sp of this.surface) {
      sp.phase += sp.pulseSpeed;
    }

    // Update floaters
    const cx = this.w / 2, cy = this.h / 2, R = this.R;
    for (const fp of this.floaters) {
      fp.x += fp.vx;
      fp.y += fp.vy;
      fp.alpha += fp.alphaDir * 0.004;
      if (fp.alpha >= 0.92) fp.alphaDir = -1;
      if (fp.alpha <= 0.1)  fp.alphaDir =  1;

      const dx = fp.x - cx, dy = fp.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const pull = (dist - R * 1.45) * 0.00006;
      fp.vx -= (dx / dist) * pull;
      fp.vy -= (dy / dist) * pull;

      const spd = Math.sqrt(fp.vx * fp.vx + fp.vy * fp.vy);
      if (spd > 0.35) { fp.vx = (fp.vx / spd) * 0.35; fp.vy = (fp.vy / spd) * 0.35; }

      if (dist > R * 3.5) {
        const a = rand(0, TAU), d = rand(R * 1.1, R * 2.1);
        fp.x = cx + Math.cos(a) * d;
        fp.y = cy + Math.sin(a) * d;
      }
    }

    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: CRUST });

    this.drawStars(g);
    this.drawIcosphereEdges(g, rot);
    this.drawVertexDots(g, rot);
    this.drawSurface(g, rot);
    this.drawFloaters(g);
  }

  private drawStars(g: Graphics): void {
    for (const s of this.stars) {
      if (s.size > 1.6 && s.color !== 0xcdd6f4) {
        g.circle(s.x, s.y, s.size * 3.2).fill({ color: s.color, alpha: s.alpha * 0.1 });
      }
      g.circle(s.x, s.y, s.size).fill({ color: s.color, alpha: s.alpha });
    }
  }

  private drawIcosphereEdges(g: Graphics, rot: number): void {
    const { verts, edges } = ICOSPHERE;
    const projected = verts.map(v => this.project(v, rot));

    for (let ei = 0; ei < edges.length; ei++) {
      const [ai, bi] = edges[ei];
      const pa = projected[ai];
      const pb = projected[bi];

      const avgZ = (pa.z + pb.z) * 0.5;
      const depth = (avgZ + 1) * 0.5;
      const alpha = Math.max(0.04, depth * 0.72 + 0.05);
      const color = PALETTE[ei % PALETTE.length];

      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const edgeLen = Math.sqrt(dx * dx + dy * dy);
      const dotCount = Math.max(1, Math.floor(edgeLen / 11));
      const dotSize = 0.8 + depth * 0.9;

      for (let d = 1; d < dotCount; d++) {
        const t = d / dotCount;
        g.circle(pa.x + dx * t, pa.y + dy * t, dotSize).fill({ color, alpha });
      }
    }
  }

  private drawVertexDots(g: Graphics, rot: number): void {
    const { verts } = ICOSPHERE;
    for (let vi = 0; vi < verts.length; vi++) {
      const { x, y, z } = this.project(verts[vi], rot);
      const depth = (z + 1) * 0.5;
      const alpha = Math.max(0.08, depth * 0.92 + 0.06);
      const color = PALETTE[vi % PALETTE.length];
      const r = 1.4 + depth * 2.2;

      g.circle(x, y, r * 3.2).fill({ color, alpha: alpha * 0.18 });
      g.circle(x, y, r).fill({ color, alpha });
    }
  }

  private drawSurface(g: Graphics, rot: number): void {
    for (const sp of this.surface) {
      const { x, y, z } = this.project([sp.ux, sp.uy, sp.uz], rot);
      const depth = (z + 1) * 0.5;
      const alpha = Math.max(0.07, depth * 0.88 + 0.1);
      const pulse = 0.7 + 0.3 * Math.sin(sp.phase);
      const size = sp.size * pulse * (0.5 + depth * 0.5);

      g.circle(x, y, size * 3).fill({ color: sp.color, alpha: alpha * 0.14 });
      g.circle(x, y, size).fill({ color: sp.color, alpha });
    }
  }

  private drawFloaters(g: Graphics): void {
    for (const fp of this.floaters) {
      g.circle(fp.x, fp.y, fp.size * 3.2).fill({ color: fp.color, alpha: fp.alpha * 0.12 });
      g.circle(fp.x, fp.y, fp.size).fill({ color: fp.color, alpha: fp.alpha });
    }
  }
}
