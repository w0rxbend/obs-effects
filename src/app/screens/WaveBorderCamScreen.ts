import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const W = 1280;
const H = 720;
const INSET = 22;
const RX = INSET;
const RY = INSET;
const RW = W - INSET * 2;
const RH = H - INSET * 2;

const LINE_STEPS = 480;
const MESH_COUNT = 32;
const FLOAT_COUNT = 50;
const MESH_DIST = 70;
const OUTER_REACH = 18;
const INNER_REACH = 58;

interface WaveComp {
  amp: number;
  freq: number; // integer for seamless loop
  speed: number;
  phase: number;
}

interface BorderLine {
  offset: number;
  waves: WaveComp[];
  alpha: number;
  width: number;
}

interface MeshParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  r: number;
  alpha: number;
}

interface FloatParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  phase: number;
  age: number;
  maxAge: number;
}

interface DotCluster {
  cx: number;
  cy: number;
  cols: number;
  rows: number;
  spacing: number;
  phase: number;
  pulseSpeed: number;
}

export class WaveBorderCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly lines: BorderLine[] = [];
  private readonly mesh: MeshParticle[] = [];
  private readonly floats: FloatParticle[] = [];
  private readonly clusters: DotCluster[] = [];
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildLines();
    this.buildMesh();
    this.buildFloats();
    this.buildClusters();
  }

  // ── Border wave lines ────────────────────────────────────────────────────

  private buildLines(): void {
    const rnd = () => Math.random() * Math.PI * 2;

    const pairDefs = [
      {
        offsets: [5, 10] as [number, number],
        alphas: [0.88, 0.7] as [number, number],
        widths: [11.0, 7.5] as [number, number],
        waves: [
          { amp: 3, freq: 3, speed: 0.5 },
          { amp: 2, freq: 7, speed: 1.1 },
          { amp: 1, freq: 1, speed: 0.18 },
        ],
      },
      {
        offsets: [19, 24] as [number, number],
        alphas: [0.6, 0.45] as [number, number],
        widths: [3.5, 2.5] as [number, number],
        waves: [
          { amp: 7, freq: 4, speed: 0.65 },
          { amp: 3, freq: 9, speed: 1.25 },
          { amp: 2, freq: 2, speed: 0.3 },
        ],
      },
      {
        offsets: [34, 40] as [number, number],
        alphas: [0.36, 0.24] as [number, number],
        widths: [2.8, 2.2] as [number, number],
        waves: [
          { amp: 11, freq: 2, speed: 0.38 },
          { amp: 5, freq: 5, speed: 0.88 },
          { amp: 2, freq: 11, speed: 1.55 },
        ],
      },
      {
        offsets: [52, 58] as [number, number],
        alphas: [0.15, 0.09] as [number, number],
        widths: [2.2, 1.6] as [number, number],
        waves: [
          { amp: 14, freq: 2, speed: 0.3 },
          { amp: 6, freq: 6, speed: 0.95 },
          { amp: 3, freq: 10, speed: 1.7 },
        ],
      },
    ];

    for (const def of pairDefs) {
      for (let i = 0; i < 2; i++) {
        this.lines.push({
          offset: def.offsets[i],
          alpha: def.alphas[i],
          width: def.widths[i],
          waves: def.waves.map((w) => ({ ...w, phase: rnd() })),
        });
      }
    }
  }

  // ── Mesh (plexus) particles ──────────────────────────────────────────────

  private buildMesh(): void {
    for (let i = 0; i < MESH_COUNT; i++) {
      const [bx, by] = this.borderPoint();
      this.mesh.push({
        x: bx,
        y: by,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        baseX: bx,
        baseY: by,
        r: 1.2 + Math.random() * 2.2,
        alpha: 0.35 + Math.random() * 0.45,
      });
    }
  }

  // ── Floating ambient particles ───────────────────────────────────────────

  private buildFloats(): void {
    for (let i = 0; i < FLOAT_COUNT; i++) {
      const p = this.spawnFloat();
      p.age = Math.random() * p.maxAge;
      this.floats.push(p);
    }
  }

  private spawnFloat(): FloatParticle {
    const [x, y] = this.borderPoint();
    const maxAge = 5 + Math.random() * 9;
    return {
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: 0.6 + Math.random() * 2.4,
      alpha: 0.12 + Math.random() * 0.38,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      maxAge,
    };
  }

  // ── Dot clusters (corners + edge midpoints) ──────────────────────────────

  private buildClusters(): void {
    // corners — denser 6×6 grid
    const corners = [
      { cx: RX, cy: RY },
      { cx: RX + RW, cy: RY },
      { cx: RX, cy: RY + RH },
      { cx: RX + RW, cy: RY + RH },
    ];
    for (const c of corners) {
      this.clusters.push({
        ...c,
        cols: 6,
        rows: 6,
        spacing: 9,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.5 + Math.random() * 0.5,
      });
    }

    // edge midpoints — wider, thinner clusters
    const mids = [
      { cx: RX + RW / 2, cy: RY },
      { cx: RX + RW / 2, cy: RY + RH },
      { cx: RX, cy: RY + RH / 2 },
      { cx: RX + RW, cy: RY + RH / 2 },
    ];
    for (const m of mids) {
      this.clusters.push({
        ...m,
        cols: 7,
        rows: 4,
        spacing: 8,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.4 + Math.random() * 0.4,
      });
    }

    // additional scattered clusters along edges
    const extras: Array<{ cx: number; cy: number }> = [];
    const edgePts = 3;
    for (let i = 1; i <= edgePts; i++) {
      const frac = i / (edgePts + 1);
      extras.push(
        { cx: RX + frac * RW, cy: RY },
        { cx: RX + frac * RW, cy: RY + RH },
        { cx: RX, cy: RY + frac * RH },
        { cx: RX + RW, cy: RY + frac * RH },
      );
    }
    for (const e of extras) {
      this.clusters.push({
        ...e,
        cols: 4,
        rows: 3,
        spacing: 7,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.6 + Math.random() * 0.6,
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private borderPoint(): [number, number] {
    // Random point in the border zone (OUTER_REACH outside to INNER_REACH inside the rect)
    const side = Math.floor(Math.random() * 4);
    const depth = -INNER_REACH + Math.random() * (INNER_REACH + OUTER_REACH);
    switch (side) {
      case 0:
        return [RX + Math.random() * RW, RY - depth];
      case 1:
        return [RX + RW + depth, RY + Math.random() * RH];
      case 2:
        return [RX + Math.random() * RW, RY + RH + depth];
      default:
        return [RX - depth, RY + Math.random() * RH];
    }
  }

  private perimPoint(t: number, outOffset: number): [number, number] {
    const perim = 2 * (RW + RH);
    const d = t * perim;
    if (d <= RW) return [RX + d, RY - outOffset];
    if (d <= RW + RH) return [RX + RW + outOffset, RY + (d - RW)];
    if (d <= 2 * RW + RH) return [RX + RW - (d - RW - RH), RY + RH + outOffset];
    return [RX - outOffset, RY + RH - (d - 2 * RW - RH)];
  }

  // ── Update ───────────────────────────────────────────────────────────────

  public async show(): Promise<void> {}

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;
    this.tickMesh();
    this.tickFloats(dt);
    this.redraw();
  }

  private tickMesh(): void {
    for (const p of this.mesh) {
      p.vx += (p.baseX - p.x) * 0.018 + (Math.random() - 0.5) * 0.04;
      p.vy += (p.baseY - p.y) * 0.018 + (Math.random() - 0.5) * 0.04;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  private tickFloats(dt: number): void {
    for (let i = 0; i < this.floats.length; i++) {
      const p = this.floats[i];
      p.age += dt;
      if (p.age > p.maxAge) {
        this.floats[i] = this.spawnFloat();
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx += (Math.random() - 0.5) * 0.04;
      p.vy += (Math.random() - 0.5) * 0.04;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  private redraw(): void {
    const g = this.gfx;
    g.clear();

    // Irregular breathing modulator — drives "elevating" feel
    const breathe =
      0.72 +
      0.28 * Math.sin(this.time * 0.38 + 0.5 * Math.sin(this.time * 0.11));

    this.drawClusters(g, breathe);
    this.drawMesh(g);
    this.drawFloats(g);
    this.drawLines(g, breathe);
  }

  private drawClusters(g: Graphics, breathe: number): void {
    for (const cl of this.clusters) {
      const halfW = ((cl.cols - 1) * cl.spacing) / 2;
      const halfH = ((cl.rows - 1) * cl.spacing) / 2;
      const n = cl.cols * cl.rows;

      for (let row = 0; row < cl.rows; row++) {
        for (let col = 0; col < cl.cols; col++) {
          const bx = cl.cx - halfW + col * cl.spacing;
          const by = cl.cy - halfH + row * cl.spacing;
          const t = (row * cl.cols + col) / n;

          const pulse = Math.sin(
            cl.phase + t * Math.PI * 2.5 + this.time * cl.pulseSpeed,
          );
          const r = 0.9 + 0.5 * breathe + 0.4 * Math.abs(pulse);
          const alpha = 0.2 + 0.2 * (0.5 + 0.5 * pulse) + 0.1 * breathe;

          // slight position wobble
          const wobX = 0.8 * Math.sin(cl.phase + t * 1.7 + this.time * 0.5);
          const wobY = 0.8 * Math.cos(cl.phase + t * 2.1 + this.time * 0.45);

          g.circle(bx + wobX, by + wobY, r).fill({
            color: 0x000000,
            alpha: Math.max(0.06, alpha),
          });
        }
      }
    }
  }

  private drawMesh(g: Graphics): void {
    // connections
    for (let i = 0; i < this.mesh.length; i++) {
      for (let j = i + 1; j < this.mesh.length; j++) {
        const a = this.mesh[i];
        const b = this.mesh[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < MESH_DIST * MESH_DIST) {
          const t = 1 - Math.sqrt(dist2) / MESH_DIST;
          g.moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({ color: 0x000000, alpha: t * 0.22, width: 0.6 });
        }
      }
    }
    // dots
    for (const p of this.mesh) {
      g.circle(p.x, p.y, p.r).fill({ color: 0x000000, alpha: p.alpha });
    }
  }

  private drawFloats(g: Graphics): void {
    for (const p of this.floats) {
      const fadeIn = Math.min(1, p.age * 0.6);
      const fadeOut = Math.min(1, (p.maxAge - p.age) * 0.6);
      const alpha = p.alpha * fadeIn * fadeOut;
      if (alpha < 0.02) continue;
      const pulse = 0.85 + 0.15 * Math.sin(p.phase + this.time * 1.8);
      g.circle(p.x, p.y, p.r * pulse).fill({ color: 0x000000, alpha });
    }
  }

  private drawLines(g: Graphics, breathe: number): void {
    for (const line of this.lines) {
      const pts: number[] = [];

      for (let i = 0; i < LINE_STEPS; i++) {
        const t = i / LINE_STEPS;
        const s = t * Math.PI * 2;

        let wave = 0;
        for (const c of line.waves) {
          wave +=
            c.amp *
            breathe *
            Math.sin(c.freq * s + c.speed * this.time + c.phase);
        }

        const [x, y] = this.perimPoint(t, line.offset + wave);
        pts.push(x, y);
      }

      g.poly(pts, true).stroke({
        color: 0x000000,
        alpha: line.alpha,
        width: line.width,
        cap: "round",
        join: "round",
      });
    }
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width - W) / 2);
    this.y = Math.round((height - H) / 2);
  }
}
