import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { TAU } from "../../lib/math";

const C_BG = 0x020006;
const C_VEIN_DIM = 0x2a0060;
const C_VEIN_MID = 0x7020cc;
const C_VEIN_HOT = 0xcc44ff;
const C_NODE = 0xff88ff;
const C_TENSION = 0xffffff;

const COLS = 26;
const ROWS = 15;

// Wave layers: [amplitude_frac, freq_space, freq_time, phase_offset]
// amplitude is fraction of cell size
const LAYERS: Array<[number, number, number, number]> = [
  [0.55, 0.018, 0.28, 0.0],
  [0.3, 0.042, 0.55, 1.1],
  [0.18, 0.08, 0.9, 2.4],
  [0.1, 0.14, 1.4, 3.8],
];

interface Vert {
  bx: number;
  by: number; // base position (pixels, set at resize)
  // unique spatial phase seeds
  px: number;
  py: number;
}

export class ReactiveEnergyMembraneScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private verts: Vert[] = [];
  private w = 1920;
  private h = 1080;
  private t = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.buildGrid();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.buildGrid();
  }

  private buildGrid(): void {
    const { w, h } = this;
    const cellW = w / (COLS - 1);
    const cellH = h / (ROWS - 1);
    this.verts = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        this.verts.push({
          bx: col * cellW,
          by: row * cellH,
          px: (col / COLS) * TAU + Math.random() * 0.4,
          py: (row / ROWS) * TAU + Math.random() * 0.4,
        });
      }
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.t += dt;
    this.draw();
  }

  // Compute displaced position for a vertex
  private disp(v: Vert): [number, number] {
    const { w, h, t } = this;
    const cellW = w / (COLS - 1);
    const cellH = h / (ROWS - 1);
    let ox = 0;
    let oy = 0;
    for (const [amp, freqS, freqT, phOff] of LAYERS) {
      const sx = freqS * v.bx;
      const sy = freqS * v.by;
      ox += amp * cellW * Math.sin(sx + v.px + t * freqT + phOff);
      oy += amp * cellH * Math.cos(sy + v.py + t * freqT * 0.85 + phOff + 0.7);
    }
    return [v.bx + ox, v.by + oy];
  }

  private draw(): void {
    const { gfx, verts, t } = this;
    gfx.clear();
    gfx.rect(0, 0, this.w, this.h).fill({ color: C_BG });

    // Precompute displaced positions
    const pts: [number, number][] = verts.map((v) => this.disp(v));

    // Draw horizontal edges
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS - 1; col++) {
        const i0 = row * COLS + col;
        const i1 = i0 + 1;
        this.drawEdge(pts[i0], pts[i1], verts[i0], verts[i1]);
      }
    }

    // Draw vertical edges
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < COLS; col++) {
        const i0 = row * COLS + col;
        const i1 = i0 + COLS;
        this.drawEdge(pts[i0], pts[i1], verts[i0], verts[i1]);
      }
    }

    // Draw diagonal edges (alternating, for organic feel)
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < COLS - 1; col++) {
        if ((row + col) % 2 === 0) {
          const i0 = row * COLS + col;
          const i1 = (row + 1) * COLS + col + 1;
          this.drawEdge(pts[i0], pts[i1], verts[i0], verts[i1]);
        }
      }
    }

    // Draw nodes at high-tension points
    const cellW = this.w / (COLS - 1);
    const cellH = this.h / (ROWS - 1);
    const restLen = Math.sqrt(cellW * cellW + cellH * cellH);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        const [px, py] = pts[i];

        // Approximate local tension: deviation from base position
        const dx = px - verts[i].bx;
        const dy = py - verts[i].by;
        const tension = Math.min(
          1,
          Math.sqrt(dx * dx + dy * dy) / (restLen * 0.6),
        );

        if (tension > 0.3) {
          const pulse = 0.8 + 0.2 * Math.sin(t * 3.5 + verts[i].px);
          gfx
            .circle(px, py, 4 * tension * pulse)
            .fill({ color: C_VEIN_HOT, alpha: 0.08 * tension });
          gfx
            .circle(px, py, 1.5 * tension)
            .fill({ color: C_NODE, alpha: 0.45 * tension * pulse });
        }
      }
    }
  }

  private drawEdge(
    p0: [number, number],
    p1: [number, number],
    v0: Vert,
    v1: Vert,
  ): void {
    const [x0, y0] = p0;
    const [x1, y1] = p1;

    // Current length vs rest length → tension
    const dx = x1 - x0;
    const dy = y1 - y0;
    const curLen = Math.sqrt(dx * dx + dy * dy);

    const rdx = v1.bx - v0.bx;
    const rdy = v1.by - v0.by;
    const restLen = Math.sqrt(rdx * rdx + rdy * rdy);

    // tension: 0 = relaxed, 1 = highly deformed
    const tension = Math.min(
      1,
      Math.abs(curLen - restLen) / (restLen * 0.7 + 1),
    );
    const g = this.gfx;

    if (tension > 0.4) {
      // High tension: bright hot vein with bloom
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_VEIN_HOT, alpha: 0.04 * tension, width: 10 });
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_VEIN_HOT, alpha: 0.18 * tension, width: 2.5 });
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_TENSION, alpha: 0.55 * tension, width: 0.7 });
    } else if (tension > 0.12) {
      // Medium tension
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_VEIN_MID, alpha: 0.07 * tension, width: 5 });
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_VEIN_HOT, alpha: 0.28 * tension, width: 1 });
    } else {
      // Dim base vein
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_VEIN_DIM, alpha: 0.22, width: 0.6 });
    }
  }
}
