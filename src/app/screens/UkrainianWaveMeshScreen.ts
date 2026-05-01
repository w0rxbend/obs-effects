import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const AZURE = 0x89b4fa;
const GOLD = 0xf9e2af;

const COLS = 40;
const ROWS = 26;
const FOCAL = 1600;
const TILT = -0.22;
const KX = Math.PI * 3.6;
const KY = Math.PI * 1.5;
const OMEGA = 1.3;
const MAX_AMP = 82;
const MOUSE_RADIUS = 240;
const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;
const MOUSE_STRENGTH = 52;

const cosTilt = Math.cos(TILT);
const sinTilt = Math.sin(TILT);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface Vertex {
  sx: number;
  sy: number;
  wave: number;
  isBlue: boolean;
}

export class UkrainianWaveMeshScreen extends Container {
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

    // Wave grows toward free right edge (flag anchored at left)
    const amp = MAX_AMP * (0.08 + 0.92 * nx);
    const wz =
      amp *
      (Math.sin(KX * nx - OMEGA * this.time) +
        0.38 * Math.cos(KY * ny + OMEGA * this.time * 0.55) +
        0.18 *
          Math.sin(
            KX * 1.7 * nx - OMEGA * 1.4 * this.time + ny * Math.PI * 1.3,
          ));

    // Mouse repulsion along z-axis (cloth pushed away from cursor)
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

    // X-axis rotation (tilt flag slightly into depth)
    const ry = wy * cosTilt - totalWz * sinTilt;
    const rz = wy * sinTilt + totalWz * cosTilt;

    const scale = FOCAL / (FOCAL + rz);

    return {
      sx: cx + wx * scale,
      sy: cy + ry * scale,
      wave: Math.abs(wz) / MAX_AMP,
      isBlue: row < ROWS / 2,
    };
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const meshW = this.w * 0.85;
    const meshH = this.h * 0.78;

    const verts: Vertex[][] = Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) =>
        this.project(col, row, cx, cy, meshW, meshH),
      ),
    );

    // Lines drawn first (underneath dots)
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const v = verts[row][col];
        const color = v.isBlue ? AZURE : GOLD;

        if (col < COLS - 1) {
          const r = verts[row][col + 1];
          const avg = (v.wave + r.wave) * 0.5;
          g.moveTo(v.sx, v.sy)
            .lineTo(r.sx, r.sy)
            .stroke({
              color,
              width: 0.5,
              alpha: clamp(0.06 + avg * 0.28, 0, 0.5),
            });
        }

        if (row < ROWS - 1) {
          const d = verts[row + 1][col];
          const avg = (v.wave + d.wave) * 0.5;
          g.moveTo(v.sx, v.sy)
            .lineTo(d.sx, d.sy)
            .stroke({
              color,
              width: 0.5,
              alpha: clamp(0.06 + avg * 0.28, 0, 0.5),
            });
        }
      }
    }

    // Dots drawn on top of lines
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const v = verts[row][col];
        const color = v.isBlue ? AZURE : GOLD;
        const glow = clamp(v.wave * 0.9, 0, 1);
        const r = 1.2 + glow * 2.8;

        if (glow > 0.15) {
          g.circle(v.sx, v.sy, r * 2.4).fill({ color, alpha: glow * 0.15 });
        }

        g.circle(v.sx, v.sy, r).fill({
          color,
          alpha: clamp(0.6 + glow * 0.35, 0, 0.95),
        });

        if (glow > 0.4) {
          g.circle(v.sx, v.sy, r * 0.4).fill({
            color: 0xcdd6f4,
            alpha: glow * 0.4,
          });
        }
      }
    }
  }
}
