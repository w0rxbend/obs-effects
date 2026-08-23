import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerpHex } from "../../lib/color";
import { TAU } from "../../lib/math";

// Topographic contour lines in neon red→pink on black
// Uses marching squares to extract iso-contours from a domain-warped field

const CELL = 11; // grid resolution in px
const LEVELS = 20; // number of contour lines
const RED = 0xff2200;
const PINK = 0xff1188;
const BG = 0x050005;

// Marching squares edge pairs for each of 16 cases
// Corners: TL=8, TR=4, BR=2, BL=1
// Edges: 0=top(TL→TR), 1=right(TR→BR), 2=bottom(BR→BL), 3=left(BL→TL)
const MS_TABLE: ([number, number] | null)[] = [
  null, // 0
  null, // 1 → handled inline
  null, // 2
  null, // 3
  null, // 4
  null, // 5 (saddle)
  null, // 6
  null, // 7
  null, // 8
  null, // 9
  null, // 10 (saddle)
  null, // 11
  null, // 12
  null, // 13
  null, // 14
  null, // 15
];

// Build actual edge pairs
const EDGE_TABLE: [number, number][][] = [
  [],
  [[2, 3]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [], // saddle
  [[0, 2]],
  [[0, 3]],
  [[0, 3]],
  [[0, 2]],
  [], // saddle
  [[0, 1]],
  [[1, 3]],
  [[1, 2]],
  [[2, 3]],
  [],
];

// Suppress the dummy MS_TABLE variable
void MS_TABLE;

export class NeonTopoScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  private gridCols = 0;
  private gridRows = 0;
  private fieldGrid = new Float32Array(0);

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.allocGrid();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.allocGrid();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt * 0.15;
    this.computeField();
    this.draw();
  }

  private allocGrid(): void {
    this.gridCols = Math.ceil(this.w / CELL) + 2;
    this.gridRows = Math.ceil(this.h / CELL) + 2;
    this.fieldGrid = new Float32Array(this.gridCols * this.gridRows);
  }

  private computeField(): void {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const t = this.time;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const xn = (c * CELL) / this.w;
        const yn = (r * CELL) / this.h;

        // Two-pass domain warp for organic hills/valleys
        const w1x = xn + 0.38 * Math.sin(yn * TAU * 1.2 + t * 0.28);
        const w1y = yn + 0.38 * Math.cos(xn * TAU * 0.9 - t * 0.21);

        const w2x = w1x + 0.18 * Math.cos(w1y * TAU * 2.5 - t * 0.16);
        const w2y = w1y + 0.18 * Math.sin(w1x * TAU * 1.9 + t * 0.13);

        const f =
          Math.sin(w2x * TAU * 1.6 + w2y * TAU * 1.1 + t * 0.11) * 0.5 +
          Math.sin(w2x * TAU * 2.9 - w2y * TAU * 2.1 - t * 0.08) * 0.3 +
          Math.cos(w2x * TAU * 4.3 + w2y * TAU * 3.7 + t * 0.06) * 0.2;

        this.fieldGrid[r * cols + c] = (f + 1) * 0.5;
      }
    }
  }

  // Compute edge crossing point in screen coordinates
  private edgePt(
    c: number,
    r: number,
    edge: number,
    va: number,
    vb: number,
    threshold: number,
  ): [number, number] {
    const t = (threshold - va) / (vb - va);
    const x = c * CELL;
    const y = r * CELL;
    if (edge === 0) return [x + t * CELL, y];
    if (edge === 1) return [x + CELL, y + t * CELL];
    if (edge === 2) return [x + (1 - t) * CELL, y + CELL];
    return [x, y + (1 - t) * CELL]; // edge 3
  }

  private drawContour(g: Graphics, threshold: number): void {
    const grid = this.fieldGrid;
    const cols = this.gridCols;
    const rows = this.gridRows;

    // Corner values per cell
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = grid[r * cols + c];
        const tr = grid[r * cols + c + 1];
        const br = grid[(r + 1) * cols + c + 1];
        const bl = grid[(r + 1) * cols + c];

        const idx =
          (tl > threshold ? 8 : 0) |
          (tr > threshold ? 4 : 0) |
          (br > threshold ? 2 : 0) |
          (bl > threshold ? 1 : 0);

        if (idx === 0 || idx === 15) continue;

        if (idx === 5 || idx === 10) {
          // Saddle: disambiguate via cell center value
          const mid = (tl + tr + br + bl) * 0.25;
          const pairs: [number, number][] =
            (idx === 5) === mid > threshold
              ? [
                  [0, 3],
                  [1, 2],
                ]
              : [
                  [0, 1],
                  [2, 3],
                ];
          const corners: [number, number][] = [
            [tl, tr],
            [tr, br],
            [br, bl],
            [bl, tl],
          ];
          for (const [e1, e2] of pairs) {
            const [x1, y1] = this.edgePt(
              c,
              r,
              e1,
              corners[e1][0],
              corners[e1][1],
              threshold,
            );
            const [x2, y2] = this.edgePt(
              c,
              r,
              e2,
              corners[e2][0],
              corners[e2][1],
              threshold,
            );
            g.moveTo(x1, y1).lineTo(x2, y2);
          }
          continue;
        }

        const corners: [number, number][] = [
          [tl, tr],
          [tr, br],
          [br, bl],
          [bl, tl],
        ];

        for (const [e1, e2] of EDGE_TABLE[idx]) {
          const [x1, y1] = this.edgePt(
            c,
            r,
            e1,
            corners[e1][0],
            corners[e1][1],
            threshold,
          );
          const [x2, y2] = this.edgePt(
            c,
            r,
            e2,
            corners[e2][0],
            corners[e2][1],
            threshold,
          );
          g.moveTo(x1, y1).lineTo(x2, y2);
        }
      }
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Star field — tiny white dots
    for (let i = 0; i < 180; i++) {
      const sx =
        ((Math.sin(i * 127.1 + this.time * 0.04) * 0.5 + 0.5) * this.w) | 0;
      const sy =
        ((Math.sin(i * 311.7 + this.time * 0.03) * 0.5 + 0.5) * this.h) | 0;
      g.circle(sx, sy, 0.7).fill({ color: 0xffffff, alpha: 0.35 });
    }

    // Draw each contour level
    for (let li = 0; li < LEVELS; li++) {
      const threshold = (li + 1) / (LEVELS + 1);
      const tNorm = li / (LEVELS - 1);
      const color = lerpHex(RED, PINK, tNorm);

      // Glow pass — wide, transparent
      this.drawContour(g, threshold);
      g.stroke({ color, width: 4.5, alpha: 0.15 });

      // Core line
      this.drawContour(g, threshold);
      g.stroke({ color, width: 1.6, alpha: 0.85 });
    }
  }
}
