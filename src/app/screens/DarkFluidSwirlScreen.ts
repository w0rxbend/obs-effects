import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const BG = 0x12141e;
const SHADOW = 0x0a0b14;
const PINK_HOT = 0xff0077;
const PINK_MID = 0xff2266;
const CORAL = 0xff5544;
const SALMON = 0xff7766;

const BAND_COUNT = 60;
const X_STEPS = 180;

function lerpHex(a: number, b: number, t: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (clamp(ar + (br - ar) * t) << 16) |
    (clamp(ag + (bg - ag) * t) << 8) |
    clamp(ab + (bb - ab) * t)
  );
}

export class DarkFluidSwirlScreen extends Container {
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
    this.time += dt * 0.4;
    this.draw();
  }

  private fieldY(xn: number, yBase: number, phase: number, t: number): number {
    // Multi-layer domain warp for organic swirl
    const warp =
      Math.sin(xn * 5.3 * TAU - t * 0.7 + phase) * 0.11 +
      Math.sin(xn * 2.9 * TAU + t * 0.41 - phase * 0.8) * 0.09 +
      Math.sin(xn * 8.7 * TAU - t * 0.28 + phase * 1.4) * 0.042 +
      Math.cos(xn * 1.7 * TAU + t * 0.33 + phase * 0.6) * 0.07;

    // Second warp pass — uses first warp as input coordinate shift
    const wx = xn + warp * 0.3;
    const warp2 =
      Math.sin(wx * 6.1 * TAU - t * 0.55 + phase * 1.7) * 0.065 +
      Math.sin(wx * 3.4 * TAU + t * 0.22 - phase * 0.5) * 0.05;

    const amp =
      this.h * (0.1 + 0.06 * Math.sin((yBase / this.h) * TAU * 0.8 + t));
    return yBase + amp * (warp + warp2);
  }

  private bandWidth(xn: number, phase: number, t: number): number {
    const w =
      0.5 +
      1.4 * Math.abs(Math.sin(xn * 4.7 * TAU + phase * 1.2 - t * 0.3)) +
      0.6 * Math.abs(Math.sin(xn * 9.1 * TAU - phase * 0.7 + t * 0.5));
    return this.h * 0.004 * w;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    // Background with subtle dark topology wash
    g.rect(0, 0, this.w, this.h).fill({ color: BG });
    this.drawBgRipples(g);

    const t = this.time;

    for (let i = 0; i < BAND_COUNT; i++) {
      const tNorm = i / BAND_COUNT;
      const yBase = tNorm * this.h;
      const phase = i * 1.6180339887 * Math.PI; // golden ratio spread

      // Color: hot pink at peaks, coral/salmon at lower bands, cycling
      const hue = tNorm + 0.12 * Math.sin(phase + t * 0.2);
      const color =
        hue < 0.3
          ? lerpHex(PINK_HOT, PINK_MID, hue / 0.3)
          : hue < 0.65
            ? lerpHex(PINK_MID, CORAL, (hue - 0.3) / 0.35)
            : lerpHex(CORAL, SALMON, (hue - 0.65) / 0.35);

      const topPts: { x: number; y: number }[] = [];
      const botPts: { x: number; y: number }[] = [];

      for (let s = 0; s <= X_STEPS; s++) {
        const xn = s / X_STEPS;
        const x = xn * this.w;
        const cy = this.fieldY(xn, yBase, phase, t);
        const hw = this.bandWidth(xn, phase, t);
        topPts.push({ x, y: cy - hw });
        botPts.push({ x, y: cy + hw });
      }

      // Dark shadow — slightly wider, drawn first
      this.drawBand(g, topPts, botPts, SHADOW, 1.0, 3.5);
      // Colored band on top
      this.drawBand(g, topPts, botPts, color, 0.88, 0);
      // Bright highlight core on front-facing bands
      if (i % 5 === 0 || i % 7 === 1) {
        this.drawBand(g, topPts, botPts, 0xffffff, 0.22, -1.5);
      }
    }
  }

  private drawBand(
    g: Graphics,
    topPts: { x: number; y: number }[],
    botPts: { x: number; y: number }[],
    color: number,
    alpha: number,
    expand: number,
  ): void {
    if (topPts.length === 0) return;

    g.moveTo(topPts[0].x, topPts[0].y - expand);
    for (let i = 1; i < topPts.length; i++) {
      g.lineTo(topPts[i].x, topPts[i].y - expand);
    }
    for (let i = botPts.length - 1; i >= 0; i--) {
      g.lineTo(botPts[i].x, botPts[i].y + expand);
    }
    g.closePath();
    g.fill({ color, alpha });
  }

  private drawBgRipples(g: Graphics): void {
    // Subtle dark topology bands behind everything
    const t = this.time * 0.25;
    const DARK_BANDS = 25;

    for (let i = 0; i < DARK_BANDS; i++) {
      const tNorm = i / DARK_BANDS;
      const yBase = tNorm * this.h;
      const phase = i * 2.399 * Math.PI; // different golden angle

      const pts: { x: number; y: number }[] = [];
      const N = 100;

      for (let s = 0; s <= N; s++) {
        const xn = s / N;
        const x = xn * this.w;
        const warp =
          Math.sin(xn * 3.2 * TAU - t * 0.5 + phase) * 0.06 +
          Math.sin(xn * 6.8 * TAU + t * 0.28 + phase * 1.1) * 0.035;
        const y = yBase + this.h * 0.055 * warp;
        pts.push({ x, y });
      }

      g.moveTo(pts[0].x, pts[0].y);
      for (let i2 = 1; i2 < pts.length; i2++) g.lineTo(pts[i2].x, pts[i2].y);
      g.stroke({ color: 0x1e2135, width: this.h * 0.012, alpha: 0.55 });
    }
  }
}
