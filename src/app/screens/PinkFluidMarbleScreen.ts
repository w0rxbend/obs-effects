import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerpHex } from "../../lib/color";
import { TAU } from "../../lib/math";

const BG = 0x171a2a;
const INK = 0x070c16;
const DEEP_INK = 0x101522;
const RELIEF = 0x24283d;
const HOT_PINK = 0xff008a;
const MAGENTA = 0xe9008f;
const CORAL = 0xff4f5f;
const SALMON = 0xff725d;

const GOLDEN = 1.6180339887;
const LONG_STEPS = 170;

interface Ribbon {
  base: number;
  width: number;
  amp: number;
  phase: number;
  speed: number;
  colorA: number;
  colorB: number;
  accentEvery: number;
}

interface Island {
  x: number;
  y: number;
  rx: number;
  ry: number;
  phase: number;
  color: number;
}

const RIBBONS: Ribbon[] = [
  {
    base: -0.1,
    width: 0.06,
    amp: 0.18,
    phase: 0.2,
    speed: 0.9,
    colorA: HOT_PINK,
    colorB: CORAL,
    accentEvery: 3,
  },
  {
    base: 0.12,
    width: 0.09,
    amp: 0.24,
    phase: 1.4,
    speed: 0.75,
    colorA: CORAL,
    colorB: MAGENTA,
    accentEvery: 4,
  },
  {
    base: 0.36,
    width: 0.055,
    amp: 0.2,
    phase: 2.7,
    speed: 0.65,
    colorA: MAGENTA,
    colorB: SALMON,
    accentEvery: 5,
  },
  {
    base: 0.58,
    width: 0.075,
    amp: 0.16,
    phase: 3.9,
    speed: 0.82,
    colorA: HOT_PINK,
    colorB: SALMON,
    accentEvery: 4,
  },
  {
    base: 0.83,
    width: 0.06,
    amp: 0.22,
    phase: 5.1,
    speed: 0.7,
    colorA: CORAL,
    colorB: HOT_PINK,
    accentEvery: 3,
  },
  {
    base: 1.08,
    width: 0.08,
    amp: 0.2,
    phase: 6.3,
    speed: 0.62,
    colorA: MAGENTA,
    colorB: CORAL,
    accentEvery: 4,
  },
];

const ISLANDS: Island[] = [
  { x: 0.78, y: 0.13, rx: 0.022, ry: 0.04, phase: 0.3, color: CORAL },
  { x: 0.9, y: 0.27, rx: 0.055, ry: 0.025, phase: 1.5, color: HOT_PINK },
  { x: 0.62, y: 0.34, rx: 0.085, ry: 0.018, phase: 2.8, color: CORAL },
  { x: 0.57, y: 0.6, rx: 0.058, ry: 0.024, phase: 4.2, color: MAGENTA },
  { x: 0.14, y: 0.78, rx: 0.03, ry: 0.015, phase: 5.1, color: HOT_PINK },
  { x: 0.45, y: 0.86, rx: 0.075, ry: 0.018, phase: 6.0, color: SALMON },
];

interface Point {
  x: number;
  y: number;
}

export class PinkFluidMarbleScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private widthPx = 1920;
  private heightPx = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(width: number, height: number): void {
    this.widthPx = width;
    this.heightPx = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt * 0.32;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.widthPx, this.heightPx).fill({ color: BG });

    this.drawDarkMarble();
    this.drawRibbons();
    this.drawIslands();
  }

  private ribbonCenterX(ribbon: Ribbon, yn: number, time: number): number {
    const primary =
      Math.sin(yn * TAU * 1.15 + ribbon.phase + time * ribbon.speed) *
      ribbon.amp;
    const secondary =
      Math.sin(yn * TAU * 2.7 - ribbon.phase * 0.8 - time * 0.55) *
      ribbon.amp *
      0.34;
    const fine =
      Math.cos(yn * TAU * 6.3 + ribbon.phase * 1.7 + time * 0.28) *
      ribbon.amp *
      0.12;

    return ribbon.base + primary + secondary + fine;
  }

  private ribbonHalfWidth(ribbon: Ribbon, yn: number, time: number): number {
    const widthMod =
      0.55 +
      Math.abs(Math.sin(yn * TAU * 1.7 + ribbon.phase - time * 0.6)) * 0.65 +
      Math.abs(Math.cos(yn * TAU * 5.1 - ribbon.phase + time * 0.36)) * 0.22;

    return ribbon.width * widthMod;
  }

  private buildVerticalRibbon(
    ribbon: Ribbon,
    inset: number,
    time: number,
  ): { left: Point[]; right: Point[] } {
    const left: Point[] = [];
    const right: Point[] = [];
    const diagonal = this.widthPx * 0.2 * Math.sin(ribbon.phase);

    for (let i = 0; i <= LONG_STEPS; i++) {
      const yn = i / LONG_STEPS;
      const y = yn * this.heightPx;
      const center =
        this.ribbonCenterX(ribbon, yn, time) * this.widthPx +
        (yn - 0.5) * diagonal;
      const halfWidth =
        (this.ribbonHalfWidth(ribbon, yn, time) + inset) * this.widthPx;

      left.push({ x: center - halfWidth, y });
      right.push({ x: center + halfWidth, y });
    }

    return { left, right };
  }

  private fillRibbon(
    left: Point[],
    right: Point[],
    color: number,
    alpha: number,
  ): void {
    if (left.length === 0) {
      return;
    }

    const g = this.gfx;
    g.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) {
      g.lineTo(left[i].x, left[i].y);
    }

    for (let i = right.length - 1; i >= 0; i--) {
      g.lineTo(right[i].x, right[i].y);
    }

    g.closePath();
    g.fill({ color, alpha });
  }

  private drawRibbons(): void {
    for (let i = 0; i < RIBBONS.length; i++) {
      const ribbon = RIBBONS[i];
      const colorMix =
        0.5 + Math.sin(this.time * 0.55 + ribbon.phase * 0.8) * 0.5;
      const color = lerpHex(ribbon.colorA, ribbon.colorB, colorMix);

      const shadow = this.buildVerticalRibbon(ribbon, 0.045, this.time);
      this.fillRibbon(shadow.left, shadow.right, INK, 0.96);

      const relief = this.buildVerticalRibbon(ribbon, 0.02, this.time + 0.12);
      this.fillRibbon(relief.left, relief.right, DEEP_INK, 0.92);

      const body = this.buildVerticalRibbon(ribbon, 0, this.time);
      this.fillRibbon(body.left, body.right, color, 0.95);

      if (i % ribbon.accentEvery === 0 || i === 1) {
        const highlight = this.buildVerticalRibbon(ribbon, -0.025, this.time);
        this.fillRibbon(highlight.left, highlight.right, 0xff7b73, 0.44);
      }
    }
  }

  private drawDarkMarble(): void {
    for (let i = 0; i < 18; i++) {
      const ribbon: Ribbon = {
        base: -0.18 + i * 0.08,
        width: 0.045 + (i % 4) * 0.014,
        amp: 0.12 + (i % 5) * 0.018,
        phase: i * GOLDEN,
        speed: 0.38 + (i % 3) * 0.06,
        colorA: RELIEF,
        colorB: DEEP_INK,
        accentEvery: 5,
      };
      const dark = this.buildVerticalRibbon(ribbon, 0.012, this.time * 0.6);
      this.fillRibbon(dark.left, dark.right, i % 2 === 0 ? RELIEF : INK, 0.42);
    }
  }

  private drawIslands(): void {
    const minSide = Math.min(this.widthPx, this.heightPx);

    for (const island of ISLANDS) {
      const x =
        island.x * this.widthPx +
        Math.sin(this.time * 0.7 + island.phase) * minSide * 0.025;
      const y =
        island.y * this.heightPx +
        Math.cos(this.time * 0.54 + island.phase * 1.4) * minSide * 0.016;
      const rx = island.rx * this.widthPx;
      const ry = island.ry * this.heightPx;

      this.gfx
        .ellipse(x, y, rx * 1.55, ry * 1.7)
        .fill({ color: INK, alpha: 0.9 });
      this.gfx.ellipse(x, y, rx, ry).fill({ color: island.color, alpha: 0.92 });
      this.gfx
        .ellipse(x - rx * 0.18, y - ry * 0.16, rx * 0.42, ry * 0.38)
        .fill({ color: SALMON, alpha: 0.32 });
    }
  }
}
