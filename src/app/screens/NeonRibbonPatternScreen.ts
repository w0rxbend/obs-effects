import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x03050b;
const CARVE = 0x03050b;
const HOT_PINK = 0xff2f8b;
const SUNSET = 0xff6a5f;
const VIOLET = 0x7a3d9b;
const LINE_ANGLE = -0.91;
const STRIPE_GAP = 24;
const BASE_LINE_WIDTH = 7.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mixColor(a: number, b: number, t: number): number {
  const amount = clamp(t, 0, 1);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  return (
    (Math.round(ar + (br - ar) * amount) << 16) |
    (Math.round(ag + (bg - ag) * amount) << 8) |
    Math.round(ab + (bb - ab) * amount)
  );
}

export class NeonRibbonPatternScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
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
    this.draw();
  }

  private colorAt(x: number, y: number, phase = 0): number {
    const sweep =
      (x / Math.max(this.w, 1)) * 0.44 +
      (y / Math.max(this.h, 1)) * 0.5 +
      0.06 * Math.sin(this.time * 0.42 + phase);

    if (sweep < 0.5) {
      return mixColor(SUNSET, HOT_PINK, sweep * 2);
    }

    return mixColor(HOT_PINK, VIOLET, (sweep - 0.5) * 2);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    this.drawDiagonalField();
    this.drawRibbonTiles();
    this.drawVignette();
  }

  private drawDiagonalField(): void {
    const span = Math.hypot(this.w, this.h) * 1.25;
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const cos = Math.cos(LINE_ANGLE);
    const sin = Math.sin(LINE_ANGLE);
    const nx = -sin;
    const ny = cos;
    const scale = Math.min(this.w, this.h) / 1080;
    const gap = STRIPE_GAP * scale;
    const width = BASE_LINE_WIDTH * scale;
    const travel = (this.time * 16 * scale) % gap;
    const first = -span - gap;
    const last = span + gap;

    for (let offset = first; offset <= last; offset += gap) {
      const shifted = offset + travel;
      const mx = cx + nx * shifted;
      const my = cy + ny * shifted;
      const wave = Math.sin(offset * 0.018 + this.time * 0.7) * 0.5 + 0.5;
      const color = this.colorAt(mx, my, offset * 0.02);
      const alpha = 0.78 + wave * 0.17;

      this.gfx
        .moveTo(mx - cos * span, my - sin * span)
        .lineTo(mx + cos * span, my + sin * span)
        .stroke({ color, alpha, width, cap: "round" });
    }
  }

  private drawRibbonTiles(): void {
    const base = Math.min(this.w, this.h) / 1080;
    const tileW = 520 * base;
    const tileH = 330 * base;
    const driftX = (this.time * 12 * base) % tileW;
    const driftY = (this.time * -7 * base) % tileH;
    const startX = -tileW * 1.1;
    const startY = -tileH * 1.2;
    const cols = Math.ceil(this.w / tileW) + 4;
    const rows = Math.ceil(this.h / tileH) + 5;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const phase = row * 0.9 + col * 1.37;
        const wobbleX = Math.sin(this.time * 0.34 + phase) * 16 * base;
        const wobbleY = Math.cos(this.time * 0.28 + phase * 0.8) * 11 * base;
        const x =
          startX + col * tileW + ((row % 2) * tileW) / 2 + driftX + wobbleX;
        const y = startY + row * tileH + driftY + wobbleY;
        const kind = (row + col * 2) % 3;
        const scale = base * (kind === 1 ? 0.78 : kind === 2 ? 0.95 : 1.1);
        const angle = LINE_ANGLE + Math.sin(this.time * 0.18 + phase) * 0.035;
        const color = this.colorAt(x, y, phase);
        const pulse = 0.88 + Math.sin(this.time * 0.9 + phase) * 0.08;

        this.drawRibbonMotif(x, y, scale, angle, kind, color, pulse);
      }
    }
  }

  private drawRibbonMotif(
    cx: number,
    cy: number,
    scale: number,
    angle: number,
    kind: number,
    color: number,
    pulse: number,
  ): void {
    const width = 34 * scale;

    this.strokeMotif(cx, cy, scale, angle, kind, CARVE, 1, width * 2.05);
    this.strokeMotif(cx, cy, scale, angle, kind, color, 0.08, width * 2.3);
    this.strokeMotif(cx, cy, scale, angle, kind, color, 0.18, width * 1.55);
    this.strokeMotif(cx, cy, scale, angle, kind, color, pulse, width);
  }

  private strokeMotif(
    cx: number,
    cy: number,
    scale: number,
    angle: number,
    kind: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = (u: number, v: number) => cx + (u * cos - v * sin) * scale;
    const y = (u: number, v: number) => cy + (u * sin + v * cos) * scale;
    const g = this.gfx;

    if (kind === 1) {
      g.moveTo(x(-190, -58), y(-190, -58))
        .lineTo(x(54, -58), y(54, -58))
        .bezierCurveTo(
          x(132, -58),
          y(132, -58),
          x(132, 58),
          y(132, 58),
          x(54, 58),
          y(54, 58),
        )
        .lineTo(x(-135, 58), y(-135, 58))
        .stroke({ color, alpha, width, cap: "round", join: "round" });
      return;
    }

    if (kind === 2) {
      g.moveTo(x(-210, 55), y(-210, 55))
        .lineTo(x(-72, 55), y(-72, 55))
        .bezierCurveTo(
          x(8, 55),
          y(8, 55),
          x(8, -65),
          y(8, -65),
          x(88, -65),
          y(88, -65),
        )
        .lineTo(x(215, -65), y(215, -65))
        .stroke({ color, alpha, width, cap: "round", join: "round" });
      return;
    }

    g.moveTo(x(-250, -70), y(-250, -70))
      .lineTo(x(78, -70), y(78, -70))
      .bezierCurveTo(
        x(172, -70),
        y(172, -70),
        x(172, 70),
        y(172, 70),
        x(78, 70),
        y(78, 70),
      )
      .lineTo(x(-94, 70), y(-94, 70))
      .bezierCurveTo(
        x(-188, 70),
        y(-188, 70),
        x(-188, -70),
        y(-188, -70),
        x(-94, -70),
        y(-94, -70),
      )
      .lineTo(x(238, -70), y(238, -70))
      .stroke({ color, alpha, width, cap: "round", join: "round" });
  }

  private drawVignette(): void {
    const g = this.gfx;
    const edge = Math.min(this.w, this.h) * 0.12;

    g.rect(0, 0, this.w, edge).fill({ color: BG, alpha: 0.18 });
    g.rect(0, this.h - edge, this.w, edge).fill({ color: BG, alpha: 0.28 });
    g.rect(0, 0, edge, this.h).fill({ color: BG, alpha: 0.16 });
    g.rect(this.w - edge, 0, edge, this.h).fill({ color: BG, alpha: 0.16 });

    const scanY = ((this.time * 34) % (this.h + edge * 2)) - edge;
    g.rect(0, scanY, this.w, edge * 0.18).fill({
      color: HOT_PINK,
      alpha: 0.028,
    });
  }
}
