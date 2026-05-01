import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const RED = 0xff0000;
const BLACK = 0x000000;
const RED_HIGHLIGHT = 0xff9999;
const BLACK_HIGHLIGHT = 0x2a2a2a;

const COLS = 50;
const ROWS = 30;
const FOCAL = 1600;
const TILT = -0.18;
const KX = Math.PI * 3.0;
const KX2 = Math.PI * 5.5;
const OMEGA = 1.4;
const OMEGA2 = 0.85;
const MAX_AMP = 72;
const MOUSE_RADIUS = 100;
const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;
const MOUSE_STRENGTH = 42;

const cosTilt = Math.cos(TILT);
const sinTilt = Math.sin(TILT);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface Vertex {
  sx: number;
  sy: number;
  waveNorm: number;
  isRed: boolean;
}

export class UaRedBlackMeshScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private mouseX = -9999;
  private mouseY = -9999;

  constructor() {
    super();
    this.addChild(this.gfx);
    window.addEventListener("mousemove", this.onMouse);
  }

  private readonly onMouse = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  public override destroy(): void {
    window.removeEventListener("mousemove", this.onMouse);
    super.destroy();
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;
    this.draw();
  }

  private project(
    col: number,
    row: number,
    cx: number,
    cy: number,
    meshW: number,
    meshH: number,
  ): Vertex {
    const nx = col / (COLS - 1);
    const ny = row / (ROWS - 1);

    const wx = (nx - 0.5) * meshW;
    const wy = (ny - 0.5) * meshH;

    // Amplitude grows toward free right edge (flag anchored at left)
    const amp = MAX_AMP * (0.05 + 0.95 * nx);
    const wz =
      amp *
      (Math.sin(KX * nx - OMEGA * this.time) +
        0.45 * Math.sin(KX2 * nx - OMEGA2 * this.time));

    // Mouse ripple — push particles along z away from cursor
    const approxSx = cx + wx;
    const approxSy = cy + wy;
    const mdx = approxSx - this.mouseX;
    const mdy = approxSy - this.mouseY;
    const mdist2 = mdx * mdx + mdy * mdy;
    const repel =
      mdist2 < MOUSE_RADIUS_SQ
        ? (1 - Math.sqrt(mdist2) / MOUSE_RADIUS) ** 2 * MOUSE_STRENGTH
        : 0;

    const totalWz = wz + repel;

    const ry = wy * cosTilt - totalWz * sinTilt;
    const rz = wy * sinTilt + totalWz * cosTilt;
    const scale = FOCAL / (FOCAL + rz);

    return {
      sx: cx + wx * scale,
      sy: cy + ry * scale,
      waveNorm: clamp(wz / MAX_AMP, -1, 1),
      isRed: row < ROWS / 2,
    };
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const meshW = this.w * 0.9;
    const meshH = this.h * 0.82;

    const verts: Vertex[][] = Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) =>
        this.project(col, row, cx, cy, meshW, meshH),
      ),
    );

    // Lines drawn first (below dots)
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const v = verts[row][col];
        const color = v.isRed ? RED : BLACK;

        if (col < COLS - 1) {
          const r = verts[row][col + 1];
          g.moveTo(v.sx, v.sy)
            .lineTo(r.sx, r.sy)
            .stroke({ color, width: 0.6, alpha: 0.3 });
        }

        if (row < ROWS - 1) {
          const d = verts[row + 1][col];
          g.moveTo(v.sx, v.sy)
            .lineTo(d.sx, d.sy)
            .stroke({ color, width: 0.6, alpha: 0.3 });
        }
      }
    }

    // Dots drawn on top of lines
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const v = verts[row][col];
        const color = v.isRed ? RED : BLACK;
        const highlight = v.isRed ? RED_HIGHLIGHT : BLACK_HIGHLIGHT;
        const elev = Math.max(0, v.waveNorm);
        const r = 1.2 + elev * 3.2;

        if (elev > 0.18) {
          g.circle(v.sx, v.sy, r * 2.6).fill({ color, alpha: elev * 0.13 });
        }

        g.circle(v.sx, v.sy, r).fill({
          color,
          alpha: clamp(0.55 + elev * 0.4, 0.55, 0.95),
        });

        if (elev > 0.42) {
          g.circle(v.sx, v.sy, r * 0.38).fill({
            color: highlight,
            alpha: elev * 0.45,
          });
        }
      }
    }
  }
}
