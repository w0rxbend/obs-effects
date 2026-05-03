import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const NUM_RINGS = 26;
const SPOKES = 42;
const FOCAL = 480;
const Z_FAR = 1300;
const TUBE_RADIUS = 500;
const DIVE_SPEED = 200;
const WAVE_AMP = 0.09;
const TAU = Math.PI * 2;
const NEAR_ROT_SPEED = 0.07;
const FAR_ROT_SPEED = 0.44;

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function lerpColor(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
  t: number,
): number {
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8) |
    Math.round(b1 + (b2 - b1) * t)
  );
}

function depthColor(t: number): number {
  if (t < 0.5) return lerpColor(0x08, 0x14, 0x2c, 0x00, 0x8c, 0xc8, t * 2);
  return lerpColor(0x00, 0x8c, 0xc8, 0xb0, 0xec, 0xff, (t - 0.5) * 2);
}

interface Ring {
  z: number;
  phase: number;
  rotOffset: number;
}

interface RingData {
  verts: { x: number; y: number }[];
  t: number;
  alpha: number;
  color: number;
  lineW: number;
}

export class WormholeDiveScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly rings: Ring[] = [];
  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    for (let i = 0; i < NUM_RINGS; i++) {
      this.rings.push({
        z: ((i + 0.5) / NUM_RINGS) * Z_FAR,
        phase: (i * 5.17) % TAU,
        rotOffset: (i * 0.23) % TAU,
      });
    }
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
    for (const ring of this.rings) {
      ring.z -= DIVE_SPEED * dt;
      if (ring.z < -80) ring.z += Z_FAR;
      const df = Math.max(0, ring.z / Z_FAR);
      ring.rotOffset +=
        (NEAR_ROT_SPEED + (FAR_ROT_SPEED - NEAR_ROT_SPEED) * df) * dt;
    }
    this.draw();
  }

  private buildRingData(): RingData[] {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const sorted = [...this.rings].sort((a, b) => b.z - a.z);

    return sorted.map((ring) => {
      const t = 1 - Math.min(1, Math.max(0, ring.z / Z_FAR));
      const alpha = Math.min(
        1,
        Math.max(
          0,
          smoothstep(0, 0.1, t) *
            smoothstep(1, 0.82, t) *
            (0.4 + Math.sqrt(t) * 0.6),
        ),
      );
      const scale = FOCAL / (FOCAL + Math.max(1, ring.z));
      const projR = TUBE_RADIUS * scale;
      const color = depthColor(t);

      const verts: { x: number; y: number }[] = [];
      for (let si = 0; si < SPOKES; si++) {
        const angle = (si / SPOKES) * TAU + ring.rotOffset;
        const w1 =
          Math.sin(angle * 3 + this.time * 1.3 + ring.phase) * WAVE_AMP;
        const w2 =
          Math.cos(angle * 5 - this.time * 0.8 + ring.phase * 0.73) *
          WAVE_AMP *
          0.45;
        const r = projR * (1 + w1 + w2);
        verts.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }

      return { verts, t, alpha, color, lineW: 0.5 + t * 1.6 };
    });
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const data = this.buildRingData();

    // Singularity glow at vanishing point
    g.circle(cx, cy, 160).fill({ color: 0x00aad4, alpha: 0.05 });
    g.circle(cx, cy, 70).fill({ color: 0x00ccff, alpha: 0.1 });
    g.circle(cx, cy, 28).fill({ color: 0x88eeff, alpha: 0.22 });
    g.circle(cx, cy, 9).fill({ color: 0xccf6ff, alpha: 0.55 });
    g.circle(cx, cy, 3).fill({ color: 0xffffff, alpha: 0.95 });

    // Longitudinal spoke lines connecting adjacent rings
    for (let ri = 0; ri < data.length - 1; ri++) {
      const far = data[ri];
      const near = data[ri + 1];
      if (far.alpha + near.alpha < 0.04) continue;
      const avgAlpha = (far.alpha + near.alpha) * 0.5;
      const avgT = (far.t + near.t) * 0.5;
      const color = depthColor(avgT);
      const lw = 0.4 + avgT * 0.8;
      for (let si = 0; si < SPOKES; si += 3) {
        g.moveTo(far.verts[si].x, far.verts[si].y)
          .lineTo(near.verts[si].x, near.verts[si].y)
          .stroke({ color, width: lw, alpha: avgAlpha * 0.5 });
      }
    }

    // Rings and glow dots (back-to-front)
    for (const rd of data) {
      if (rd.alpha < 0.005) continue;

      for (let si = 0; si < SPOKES; si++) {
        const pa = rd.verts[si];
        const pb = rd.verts[(si + 1) % SPOKES];
        g.moveTo(pa.x, pa.y)
          .lineTo(pb.x, pb.y)
          .stroke({ color: rd.color, width: rd.lineW, alpha: rd.alpha });
      }

      if (rd.t < 0.22) continue;
      const step = rd.t > 0.58 ? 2 : 4;
      for (let si = 0; si < SPOKES; si += step) {
        const v = rd.verts[si];
        const dr = 0.9 + rd.t * 2.8;
        g.circle(v.x, v.y, dr * 2.8).fill({
          color: rd.color,
          alpha: rd.alpha * 0.13,
        });
        g.circle(v.x, v.y, dr).fill({
          color: 0xffffff,
          alpha: Math.min(0.9, rd.alpha),
        });
      }
    }
  }
}
