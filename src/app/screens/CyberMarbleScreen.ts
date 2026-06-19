import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Two-color fluid marble: magenta + teal on black
// Dense interleaved flow bands create full-coverage marble texture

const TAU = Math.PI * 2;

const MAGENTA_A = 0xff00cc;
const MAGENTA_B = 0xcc00ff;
const TEAL_A = 0x009dbb;
const TEAL_B = 0x006688;
const DARK_TEAL = 0x002233;
const BLACK = 0x000000;

const BAND_COUNT = 72;
const X_STEPS = 200;
const GOLDEN = 1.6180339887;

function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

export class CyberMarbleScreen extends Container {
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
    this.time += dt * 0.35;
    this.draw();
  }

  // Domain-warped field Y position for a flow band
  private flowY(
    xn: number,
    yBase: number,
    phase: number,
    t: number,
    scale: number,
  ): number {
    // First warp layer — large scale swirl
    const w1 =
      Math.sin(xn * 3.1 * TAU - t * 0.6 + phase) * 0.13 +
      Math.cos(xn * 1.8 * TAU + t * 0.38 + phase * 0.7) * 0.09 +
      Math.sin(xn * 5.7 * TAU + t * 0.21 - phase * 1.2) * 0.055;

    // Second warp pass — add turbulence using warped coords
    const wx = xn + w1 * 0.25;
    const w2 =
      Math.sin(wx * 7.3 * TAU - t * 0.44 + phase * 1.5) * 0.042 +
      Math.cos(wx * 4.2 * TAU + t * 0.29 - phase * 0.6) * 0.035 +
      Math.sin(wx * 11.1 * TAU - t * 0.17 + phase * 2.1) * 0.018;

    const amp = this.h * scale;
    return yBase + amp * (w1 + w2);
  }

  // Band half-width — varies sinusoidally to create pinch/bulge
  private halfWidth(
    xn: number,
    phase: number,
    t: number,
    baseW: number,
  ): number {
    const mod =
      0.4 +
      0.45 * Math.abs(Math.sin(xn * 5.9 * TAU + phase - t * 0.25)) +
      0.25 * Math.abs(Math.sin(xn * 10.3 * TAU - phase * 0.8 + t * 0.4)) +
      0.1 * Math.abs(Math.sin(xn * 17.7 * TAU + phase * 1.3));
    return this.h * baseW * mod;
  }

  private buildFlowPts(
    xn0: number,
    xn1: number,
    yBase: number,
    phase: number,
    t: number,
    scale: number,
    baseW: number,
  ): { top: { x: number; y: number }[]; bot: { x: number; y: number }[] } {
    const top: { x: number; y: number }[] = [];
    const bot: { x: number; y: number }[] = [];

    const steps = Math.round(X_STEPS * (xn1 - xn0));
    for (let s = 0; s <= steps; s++) {
      const xn = xn0 + ((xn1 - xn0) * s) / steps;
      const x = xn * this.w;
      const cy = this.flowY(xn, yBase, phase, t, scale);
      const hw = this.halfWidth(xn, phase, t, baseW);
      top.push({ x, y: cy - hw });
      bot.push({ x, y: cy + hw });
    }
    return { top, bot };
  }

  private fillBand(
    g: Graphics,
    top: { x: number; y: number }[],
    bot: { x: number; y: number }[],
    color: number,
    alpha: number,
    expand = 0,
  ): void {
    if (top.length === 0) return;
    g.moveTo(top[0].x, top[0].y - expand);
    for (let i = 1; i < top.length; i++) g.lineTo(top[i].x, top[i].y - expand);
    for (let i = bot.length - 1; i >= 0; i--)
      g.lineTo(bot[i].x, bot[i].y + expand);
    g.closePath();
    g.fill({ color, alpha });
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    // Black base
    g.rect(0, 0, this.w, this.h).fill({ color: BLACK });

    const t = this.time;

    // ── Teal system (drawn first, below magenta) ──────────────────────────────
    for (let i = 0; i < BAND_COUNT; i++) {
      const tNorm = i / BAND_COUNT;
      const yBase = tNorm * this.h;
      // Offset phase so teal bands sit between magenta bands
      const phase = i * GOLDEN * Math.PI + Math.PI * 0.5;

      // Color varies between teal shades
      const tColor = lerpHex(
        TEAL_A,
        TEAL_B,
        0.5 + 0.5 * Math.sin(phase + t * 0.15),
      );

      const { top, bot } = this.buildFlowPts(
        0,
        1,
        yBase,
        phase,
        t,
        0.13,
        0.0042,
      );

      // Dark contour shadow
      this.fillBand(g, top, bot, DARK_TEAL, 0.9, 3.5);
      // Main teal fill
      this.fillBand(g, top, bot, tColor, 0.82);
      // Highlight sheen on every 4th band
      if (i % 4 === 0) {
        this.fillBand(g, top, bot, 0x00ffee, 0.18, -1.5);
      }
    }

    // ── Magenta system (drawn on top) ─────────────────────────────────────────
    for (let i = 0; i < BAND_COUNT; i++) {
      const tNorm = i / BAND_COUNT;
      const yBase = tNorm * this.h;
      const phase = i * GOLDEN * Math.PI;

      // Color cycles between hot magenta and purple-pink
      const mColor = lerpHex(
        MAGENTA_A,
        MAGENTA_B,
        0.5 + 0.5 * Math.sin(phase * 0.8 - t * 0.2),
      );

      const { top, bot } = this.buildFlowPts(
        0,
        1,
        yBase,
        phase,
        t,
        0.11,
        0.0035,
      );

      // Dark edge contour
      this.fillBand(g, top, bot, BLACK, 0.85, 3);
      // Magenta fill
      this.fillBand(g, top, bot, mColor, 0.9);
      // Bright neon core highlight
      if (i % 3 === 0) {
        this.fillBand(g, top, bot, 0xff88ff, 0.25, -2);
      }
    }

    // ── Fine detail layer — thin bright filaments ─────────────────────────────
    for (let i = 0; i < 18; i++) {
      const phase = i * 2.399 * Math.PI;
      const yBase = ((i + 0.5) / 18) * this.h;

      const { top, bot } = this.buildFlowPts(
        0,
        1,
        yBase,
        phase + t * 0.08,
        t * 1.1,
        0.09,
        0.0008,
      );

      const isMagenta = i % 2 === 0;
      this.fillBand(g, top, bot, isMagenta ? 0xff44ff : 0x00ddcc, 0.65);
    }
  }
}
