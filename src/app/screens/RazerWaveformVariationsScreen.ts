import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import { obsAudio } from "../../lib";

type WaveformVariant =
  | "pulse"
  | "prism"
  | "spectrum"
  | "oscilloscope"
  | "blade"
  | "ridge"
  | "equalizer"
  | "weave"
  | "orb"
  | "helix"
  | "radial"
  | "ribbons"
  | "ribbonBands"
  | "ribbonLattice";

const TAU = Math.PI * 2;
const SEGMENTS = 184;
const BARS = 128;
const RED = 0xff3a20;
const ORANGE = 0xff9b2f;
const YELLOW = 0xffec62;
const GREEN = 0x43ff75;
const TEAL = 0x29dccf;
const CYAN = 0x61eaff;
const BLUE = 0x1688ff;
const PURPLE = 0x7b35ff;
const MAGENTA = 0xff2fb8;
const PINK = 0xff6bd6;
const WHITE = 0xf0fff2;

const PALETTE = [
  RED,
  ORANGE,
  YELLOW,
  TEAL,
  CYAN,
  BLUE,
  PURPLE,
  MAGENTA,
  PINK,
  WHITE,
] as const;

const RIBBON_PALETTE = [
  MAGENTA,
  BLUE,
  GREEN,
  CYAN,
  PINK,
  YELLOW,
  WHITE,
] as const;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function edgeAlpha(t: number): number {
  return smoothstep(0, 0.08, t) * (1 - smoothstep(0.92, 1, t));
}

function gauss(t: number, center: number, width: number): number {
  return Math.exp(-Math.pow((t - center) / width, 2));
}

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | blue;
}

function paletteAt(t: number, offset = 0): number {
  const range = PALETTE.length - 1;
  const scaled = (((t * range + offset) % range) + range) % range;
  const i = Math.floor(scaled);
  return mixColor(PALETTE[i], PALETTE[i + 1], scaled - i);
}

export class RazerWaveformVariationScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly values = new Float32Array(BARS);
  private readonly seeds = new Float32Array(BARS);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private beat = 0;
  private activity = 0;

  constructor(private readonly variant: WaveformVariant) {
    super();
    this.addChild(this.gfx);

    for (let i = 0; i < BARS; i++) {
      const s = Math.sin(i * 91.171) * 43758.5453;
      this.seeds[i] = s - Math.floor(s);
      this.values[i] = 0.06;
    }

    void obsAudio.connect();
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
    obsAudio.update(dt);
    const audioEnergy =
      obsAudio.level +
      obsAudio.bass * 0.45 +
      obsAudio.mid * 0.28 +
      obsAudio.high * 0.12;
    const targetActivity = obsAudio.isConnected
      ? smoothstep(0.035, 0.42, audioEnergy)
      : smoothstep(0.32, 0.75, audioEnergy);
    const activitySpeed = targetActivity > this.activity ? 14 : 4;
    this.activity +=
      (targetActivity - this.activity) * Math.min(1, dt * activitySpeed);
    const beatGate = obsAudio.isConnected ? 0.12 : 0.28;
    const beatTarget = obsAudio.beat && this.activity > beatGate ? 1 : 0;
    this.beat += (beatTarget - this.beat) * Math.min(1, dt * 8);
    this.updateValues(dt);
    this.draw();
  }

  private updateValues(dt: number): void {
    const attack = 1 - Math.exp(-dt * 25);
    const release = 1 - Math.exp(-dt * 7);

    for (let i = 0; i < BARS; i++) {
      const t = i / (BARS - 1);
      const center = 1 - Math.abs(t - 0.5) * 2;
      const clusters =
        gauss(t, 0.22, 0.09) * (obsAudio.high * 0.8 + obsAudio.level * 0.55) +
        gauss(t, 0.42, 0.13) * (obsAudio.mid * 1.1 + obsAudio.level * 0.35) +
        gauss(t, 0.62, 0.11) * (obsAudio.bass * 1.2 + obsAudio.level * 0.42) +
        gauss(t, 0.81, 0.1) * (obsAudio.high * 0.75 + obsAudio.mid * 0.36);
      const grain =
        0.5 + 0.5 * Math.sin(this.time * (7.5 + this.seeds[i] * 13) + i * 0.73);
      const target =
        0.01 +
        Math.pow(center, 0.55) * 0.024 +
        clusters * (0.06 + this.activity * 1.05) +
        grain * (obsAudio.high * 0.22 + obsAudio.level * 0.1) * this.activity +
        this.beat * gauss(t, 0.5, 0.22) * 0.35;
      const speed = target > this.values[i] ? attack : release;
      this.values[i] += (target - this.values[i]) * speed;
    }
  }

  private draw(): void {
    this.gfx.clear();

    switch (this.variant) {
      case "pulse":
        this.drawPulse();
        break;
      case "prism":
        this.drawPrism();
        break;
      case "spectrum":
        this.drawSpectrum();
        break;
      case "oscilloscope":
        this.drawOscilloscope();
        break;
      case "blade":
        this.drawBlade();
        break;
      case "ridge":
        this.drawRidge();
        break;
      case "equalizer":
        this.drawEqualizer();
        break;
      case "weave":
        this.drawWeave();
        break;
      case "orb":
        this.drawOrb();
        break;
      case "helix":
        this.drawHelix();
        break;
      case "radial":
        this.drawRadial();
        break;
      case "ribbons":
        this.drawRibbons();
        break;
      case "ribbonBands":
        this.drawRibbonBands();
        break;
      case "ribbonLattice":
        this.drawRibbonLattice();
        break;
    }
  }

  private drawPulse(): void {
    this.drawDotSkyline({
      base: this.h * 0.5,
      left: this.w * 0.11,
      span: this.w * 0.78,
      maxHeight: this.h * 0.22,
      columns: 72,
      rows: 28,
      mirror: true,
      dotRadius: 3.3,
      colorMode: "rainbowVertical",
      density: 0.86,
      waveBias: 0.4,
    });
  }

  private drawPrism(): void {
    this.drawDotSkyline({
      base: this.h * 0.58,
      left: this.w * 0.16,
      span: this.w * 0.68,
      maxHeight: this.h * 0.18,
      columns: 68,
      rows: 22,
      mirror: false,
      dotRadius: 3,
      colorMode: "cyanDepth",
      density: 0.72,
      waveBias: 0.28,
    });
  }

  private drawSpectrum(): void {
    const base = this.h * 0.66;
    const left = this.w * 0.1;
    const span = this.w * 0.76;
    const columns = 42;
    const rows = 18;
    const cellW = span / columns;
    const cellH = this.h * 0.018;

    for (let i = 0; i < columns; i++) {
      const t = i / (columns - 1);
      const height = Math.ceil(
        rows *
          clamp(
            0.08 +
              this.valueAt(t) * (0.32 + this.activity * 0.68) +
              gauss(t, 0.48, 0.2) *
                (0.18 + obsAudio.bass * this.activity * 0.28) +
              Math.sin(this.time * 0.42 + i * 0.65) * 0.04 * this.activity,
            0.08,
            1,
          ),
      );
      const x = left + span * t;
      for (let row = 0; row < height; row++) {
        const y = base - row * cellH;
        const color = mixColor(BLUE, CYAN, row / rows);
        this.gfx
          .rect(x, y, cellW * 0.74, cellH * 0.56)
          .fill({ color, alpha: 0.16 + (row / rows) * 0.62 });
      }
    }
  }

  private drawOscilloscope(): void {
    const cy = this.h * 0.5;
    const left = this.w * 0.11;
    const span = this.w * 0.78;
    const amp =
      this.h *
      (0.026 + this.activity * 0.054 + obsAudio.mid * this.activity * 0.08);

    this.glowLine(left, cy, left + span, cy, BLUE, 0.26, 1.2, 14);
    this.strokeWave(cy, left, span, amp, 5.2, this.time * 1.1, CYAN, 0.95, 1.4);
    this.strokeWave(
      cy,
      left,
      span,
      amp * 0.66,
      6.7,
      this.time * 1.1 + 1.5,
      TEAL,
      0.76,
      1.05,
    );
    this.strokeWave(
      cy,
      left,
      span,
      amp * 0.45,
      9.6,
      this.time * 1.6 + Math.PI,
      BLUE,
      0.5,
      0.85,
    );
  }

  private drawBlade(): void {
    const cy = this.h * 0.5;
    const left = this.w * 0.12;
    const span = this.w * 0.76;
    const amp =
      this.h *
      (0.045 +
        this.activity * 0.085 +
        obsAudio.bass * this.activity * 0.08 +
        this.beat * 0.04);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const body =
        gauss(t, 0.32, 0.11) * 0.44 +
        gauss(t, 0.46, 0.15) * 0.9 +
        gauss(t, 0.6, 0.13) * 0.72 +
        gauss(t, 0.75, 0.16) * 0.34;
      const crest =
        0.82 +
        0.18 *
          Math.sin(t * TAU * 7.5 + this.time * (0.45 + this.activity * 1.6));
      const h = amp * body * crest * (0.72 + this.valueAt(t) * 0.58);
      const x = left + span * t;
      upper.push(x, cy - h);
      lower.unshift(x, cy + h * (0.72 + Math.sin(t * TAU * 3.5) * 0.08));
    }

    this.gfx.poly([...upper, ...lower]).fill({ color: MAGENTA, alpha: 0.58 });
    this.gfx.poly([...upper, ...lower]).stroke({
      color: PINK,
      alpha: 0.88,
      width: 1.4,
    });
    this.glowLine(left, cy, left + span, cy, WHITE, 0.9, 1.2, 12);
  }

  private drawRidge(): void {
    this.drawDotDiamond({
      cx: this.w * 0.5,
      cy: this.h * 0.5,
      width: this.w * 0.66,
      height: this.h * 0.32,
      columns: 62,
      rows: 25,
      dotRadius: 4.2,
    });
  }

  private drawEqualizer(): void {
    const cy = this.h * 0.5;
    const left = this.w * 0.08;
    const span = this.w * 0.84;
    const amp =
      this.h *
      (0.095 + this.activity * 0.185 + obsAudio.level * this.activity * 0.12);
    const points: number[] = [];
    const steps = 156;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const body =
        gauss(t, 0.38, 0.16) * 0.52 +
        gauss(t, 0.5, 0.12) * 0.88 +
        gauss(t, 0.63, 0.17) * 0.58;
      const carrier =
        Math.sin(t * TAU * 5.4 + this.time * (0.36 + this.activity * 1.35)) *
          0.52 +
        Math.sin(t * TAU * 9.2 - this.time * (0.22 + this.activity * 0.9)) *
          0.24 +
        Math.sin(t * TAU * 2.2 + this.time * 0.18) * 0.18;
      const h =
        amp *
        body *
        (0.34 + this.valueAt(t) * 0.72) *
        carrier *
        (0.72 + this.activity * 0.28);
      const x = left + span * t;
      points.push(x, cy + h);
    }

    for (let i = 0; i < points.length - 2; i += 2) {
      const t = i / Math.max(2, points.length - 2);
      const x0 = points[i];
      const y0 = points[i + 1];
      const x1 = points[i + 2];
      const y1 = points[i + 3];
      this.glowLine(
        x0,
        y0,
        x1,
        y1,
        paletteAt(t, 0.5),
        edgeAlpha(t) * 0.9,
        1.2,
        9,
      );
    }
  }

  private drawWeave(): void {
    const cy = this.h * 0.5;
    const left = this.w * 0.12;
    const span = this.w * 0.76;
    const amp =
      this.h *
      (0.045 + this.activity * 0.075 + obsAudio.level * this.activity * 0.05);
    const steps = 58;

    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const x0 = left + span * t0;
      const x1 = left + span * t1;
      const y0 = cy + this.zigzagAt(i, t0, amp);
      const y1 = cy + this.zigzagAt(i + 1, t1, amp);
      this.glowLine(
        x0,
        y0,
        x1,
        y1,
        paletteAt(t0, 0.25),
        edgeAlpha(t0) * 0.88,
        1.6,
        10,
      );
    }
  }

  private drawOrb(): void {
    this.drawDotSkyline({
      base: this.h * 0.56,
      left: this.w * 0.12,
      span: this.w * 0.76,
      maxHeight: this.h * 0.19,
      columns: 76,
      rows: 22,
      mirror: true,
      dotRadius: 2.7,
      colorMode: "sunset",
      density: 0.78,
      waveBias: 0.52,
    });
  }

  private drawHelix(): void {
    const cy = this.h * 0.5;
    const left = this.w * 0.1;
    const span = this.w * 0.8;
    const amp =
      this.h *
      (0.032 + this.activity * 0.048 + obsAudio.mid * this.activity * 0.06);

    for (let layer = 0; layer < 4; layer++) {
      const phase = layer * 0.62 + this.time * 0.58;
      const color = layer % 2 === 0 ? CYAN : MAGENTA;
      this.strokeWave(
        cy,
        left,
        span,
        amp * (0.6 + layer * 0.16),
        2.5 + layer * 0.36,
        phase,
        color,
        0.66,
        1.1,
      );
    }

    this.glowLine(left, cy, left + span, cy, BLUE, 0.32, 1, 12);
  }

  private drawRadial(): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const size = Math.min(this.w, this.h);
    const rays = 56;
    const rows = 12;
    const innerRadius = size * 0.14;
    const cellDepth = size * 0.029;
    const cellWidth = size * 0.023;
    const spin = this.time * (0.015 + this.activity * 0.105);

    for (let ray = 0; ray < rays; ray++) {
      const t = ray / rays;
      const angle = t * TAU - Math.PI * 0.5 + spin;
      const wave =
        gauss(t, 0.08, 0.045) * 0.64 +
        gauss(t, 0.18, 0.06) * 0.5 +
        gauss(t, 0.31, 0.055) * 0.82 +
        gauss(t, 0.44, 0.05) * 0.72 +
        gauss(t, 0.58, 0.07) * 0.56 +
        gauss(t, 0.72, 0.045) * 0.76 +
        gauss(t, 0.86, 0.06) * 0.62;
      const flicker =
        0.5 +
        0.5 *
          Math.sin(
            this.time * (0.35 + this.activity * 1.85 + this.seeds[ray % BARS]) +
              ray * 0.73,
          );
      const height = Math.ceil(
        rows *
          clamp(
            0.14 +
              wave * (0.36 + this.activity * 0.22) +
              this.valueAt(t) * (0.18 + this.activity * 0.32) +
              flicker * 0.08 * this.activity,
            0.12,
            1,
          ),
      );

      for (let row = 0; row < height; row++) {
        const rowT = row / Math.max(1, rows - 1);
        const radius = innerRadius + row * cellDepth;
        const color = paletteAt(t + rowT * 0.16, 0.18);
        const alpha = 0.34 + rowT * 0.4 + this.valueAt(t) * 0.14;
        const jitter =
          Math.sin(row * 1.7 + ray * 0.41 + this.time * 2) *
          (0.15 + this.activity * 0.65);
        this.fillRotatedCell(
          cx + Math.cos(angle) * (radius + jitter),
          cy + Math.sin(angle) * (radius + jitter),
          cellWidth * (0.78 + rowT * 0.08),
          cellDepth * 0.72,
          angle,
          color,
          alpha,
        );
      }
    }
  }

  private drawRibbons(): void {
    const left = this.w * 0.075;
    const span = this.w * 0.85;
    const cy = this.h * 0.5;
    const amp =
      this.h *
      (0.055 + this.activity * 0.075 + obsAudio.level * this.activity * 0.055);

    this.glowLine(left, cy, left + span, cy, WHITE, 0.22, 0.9, 12);

    for (let layer = 0; layer < 7; layer++) {
      this.drawBlobRibbon({
        cy,
        left,
        span,
        amp: amp * (0.72 + layer * 0.07),
        thickness: this.h * (0.052 + layer * 0.004),
        row: 1,
        layer,
        color: RIBBON_PALETTE[(layer * 2) % RIBBON_PALETTE.length],
        alpha: 0.4,
        lobeScale: 0.96,
      });
    }

    this.drawBlobRibbon({
      cy,
      left,
      span,
      amp: amp * 0.28,
      thickness: this.h * 0.018,
      row: 1,
      layer: 8,
      color: WHITE,
      alpha: 0.76,
      lobeScale: 0.62,
    });
  }

  private drawRibbonBands(): void {
    const left = this.w * 0.055;
    const span = this.w * 0.89;
    const cy = this.h * 0.5;
    const amp =
      this.h *
      (0.074 + this.activity * 0.11 + obsAudio.bass * this.activity * 0.07);

    this.glowLine(left, cy, left + span, cy, CYAN, 0.2, 1, 14);

    for (let layer = 0; layer < 8; layer++) {
      this.drawBlobRibbon({
        cy,
        left,
        span,
        amp: amp * (0.62 + layer * 0.075),
        thickness: this.h * (0.075 + layer * 0.005),
        row: 3,
        layer,
        color: RIBBON_PALETTE[(layer + 2) % RIBBON_PALETTE.length],
        alpha: 0.34,
        lobeScale: 1.12,
      });
    }
  }

  private drawRibbonLattice(): void {
    const left = this.w * 0.08;
    const span = this.w * 0.84;
    const cy = this.h * 0.5;
    const amp =
      this.h *
      (0.06 + this.activity * 0.105 + obsAudio.mid * this.activity * 0.065);

    this.glowLine(left, cy, left + span, cy, WHITE, 0.22, 1, 14);

    for (let layer = 0; layer < 8; layer++) {
      this.drawBlobRibbon({
        cy,
        left,
        span,
        amp: amp * (0.44 + layer * 0.065),
        thickness: this.h * (0.03 + layer * 0.0045),
        row: layer % 4,
        layer,
        color: RIBBON_PALETTE[layer % RIBBON_PALETTE.length],
        alpha: 0.34,
        lobeScale: 0.9,
      });
    }

    for (let layer = 0; layer < 4; layer++) {
      this.strokeWave(
        cy,
        left,
        span,
        amp * (0.32 + layer * 0.08),
        2.4 + layer * 0.55,
        this.time * 0.36 + layer * 1.7,
        RIBBON_PALETTE[(layer * 2 + 1) % RIBBON_PALETTE.length],
        0.42,
        0.9,
      );
    }
  }

  private drawBlobRibbon({
    cy,
    left,
    span,
    amp,
    thickness,
    row,
    layer,
    color,
    alpha,
    lobeScale,
  }: {
    cy: number;
    left: number;
    span: number;
    amp: number;
    thickness: number;
    row: number;
    layer: number;
    color: number;
    alpha: number;
    lobeScale: number;
  }): void {
    const upper: number[] = [];
    const lower: number[] = [];
    const phase = row * 0.74 + layer * 1.31;
    const speed =
      0.2 + this.activity * 0.8 + obsAudio.high * this.activity * 0.42;

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const edge = edgeAlpha(t);
      const lobes = this.ribbonLobeAt(t, row, layer) * lobeScale;
      const audio =
        0.42 +
        this.activity * 0.52 +
        this.valueAt(clamp(t + layer * 0.027 - 0.08, 0, 1)) *
          (0.9 + this.activity * 0.45) +
        this.beat * gauss(t, 0.5, 0.28) * 0.42;
      const carrier =
        Math.sin(t * TAU * (1.45 + layer * 0.13) + phase + this.time * speed) *
          0.58 +
        Math.sin(
          t * TAU * (3.25 + row * 0.21) - phase + this.time * speed * 0.7,
        ) *
          0.22;
      const lift =
        carrier *
        amp *
        edge *
        (0.22 + lobes * 0.62) *
        (0.82 + this.activity * 0.2);
      const half =
        thickness *
        edge *
        Math.max(0.02, lobes) *
        audio *
        (0.76 + 0.24 * Math.sin(t * TAU * 2 + phase));
      const x = left + span * t;

      upper.push(x, cy + lift - half);
      lower.unshift(x, cy + lift + half);
    }

    this.gfx.poly([...upper, ...lower]).fill({
      color,
      alpha: alpha * (0.72 + this.activity * 0.22),
    });
  }

  private ribbonLobeAt(t: number, row: number, layer: number): number {
    const rowShift = (row % 2) * 0.055 - 0.025;
    const layerShift = ((layer % 3) - 1) * 0.035;
    const drift = Math.sin(this.time * 0.14 + row * 0.7 + layer) * 0.018;
    const centers = [
      0.17 + rowShift - layerShift * 0.35,
      0.33 - rowShift * 0.6 + layerShift,
      0.5 + rowShift * 0.3 - layerShift * 0.4,
      0.66 - rowShift + layerShift * 0.65,
      0.82 + rowShift * 0.35 - layerShift,
    ];
    const widths = [0.058, 0.085, 0.105, 0.088, 0.055];
    let lobe = 0;

    for (let i = 0; i < centers.length; i++) {
      const weight =
        0.52 +
        0.24 * Math.sin(row * 1.9 + layer * 1.17 + i * 0.83) +
        this.valueAt(clamp(centers[i], 0, 1)) * 0.18;
      lobe += gauss(t, centers[i] + drift, widths[i]) * weight;
    }

    const centerMass = gauss(t, 0.5 + drift * 0.4, 0.22) * 0.26;
    return clamp(lobe + centerMass, 0, 1.35);
  }

  private drawDotSkyline({
    base,
    left,
    span,
    maxHeight,
    columns,
    rows,
    mirror,
    dotRadius,
    colorMode,
    density,
    waveBias,
  }: {
    base: number;
    left: number;
    span: number;
    maxHeight: number;
    columns: number;
    rows: number;
    mirror: boolean;
    dotRadius: number;
    colorMode: "rainbowVertical" | "cyanDepth" | "sunset";
    density: number;
    waveBias: number;
  }): void {
    const colGap = span / Math.max(1, columns - 1);
    const rowGap = maxHeight / rows;

    for (let col = 0; col < columns; col++) {
      const t = col / Math.max(1, columns - 1);
      const envelope =
        gauss(t, 0.24, 0.1) * 0.55 +
        gauss(t, 0.42, 0.14) * 0.78 +
        gauss(t, 0.58, 0.08) * 1.05 +
        gauss(t, 0.76, 0.14) * 0.72;
      const jitter =
        0.5 +
        0.5 *
          Math.sin(
            this.time * (1.4 + this.seeds[col % BARS] * 1.8) + col * 0.54,
          );
      const height =
        rows *
        clamp(
          envelope * density * (0.48 + this.activity * 0.52) +
            this.valueAt(t) * waveBias * (0.35 + this.activity * 0.9) +
            jitter * 0.1 * this.activity,
          0.06,
          1,
        );
      const x = left + colGap * col;

      for (let row = 0; row <= height; row++) {
        const p = row / rows;
        const yTop = base - row * rowGap;
        const color = this.dotColor(colorMode, t, p, false);
        const alpha = (0.28 + p * 0.7) * edgeAlpha(t);
        this.gfx.circle(x, yTop, dotRadius).fill({ color, alpha });

        if (mirror && row > 1) {
          const yBottom = base + row * rowGap;
          this.gfx.circle(x, yBottom, dotRadius).fill({
            color: this.dotColor(colorMode, t, p, true),
            alpha: alpha * 0.74,
          });
        }
      }
    }
  }

  private drawDotDiamond({
    cx,
    cy,
    width,
    height,
    columns,
    rows,
    dotRadius,
  }: {
    cx: number;
    cy: number;
    width: number;
    height: number;
    columns: number;
    rows: number;
    dotRadius: number;
  }): void {
    const left = cx - width * 0.5;
    const top = cy - height * 0.5;
    const colGap = width / Math.max(1, columns - 1);
    const rowGap = height / Math.max(1, rows - 1);

    for (let col = 0; col < columns; col++) {
      const tx = col / Math.max(1, columns - 1);
      const x = left + col * colGap;
      const xNorm = Math.abs(tx - 0.5) * 2;
      for (let row = 0; row < rows; row++) {
        const ty = row / Math.max(1, rows - 1);
        const y = top + row * rowGap;
        const yNorm = Math.abs(ty - 0.5) * 2;
        const yEnv = 1 - yNorm;
        const diamond = 1 - (xNorm * 0.82 + yNorm * 1.24);
        const crossPulse =
          gauss(tx, 0.5, 0.18) * (0.3 + this.activity * 0.12) +
          gauss(ty, 0.5, 0.26) * 0.22;
        const ripple =
          0.035 *
            this.activity *
            Math.sin(this.time * 0.6 + col * 0.5 + row * 0.72) +
          this.valueAt(tx) * (0.16 + this.activity * 0.18);
        if (diamond + crossPulse + ripple < 0.1) continue;
        this.gfx.circle(x, y, dotRadius).fill({
          color: mixColor(BLUE, WHITE, 0.35 + yEnv * 0.52),
          alpha: edgeAlpha(tx) * (0.3 + yEnv * 0.62),
        });
      }
    }
  }

  private dotColor(
    colorMode: "rainbowVertical" | "cyanDepth" | "sunset",
    _t: number,
    p: number,
    mirrored: boolean,
  ): number {
    if (colorMode === "cyanDepth") {
      return mixColor(BLUE, CYAN, 0.28 + p * 0.72);
    }
    if (colorMode === "sunset") {
      return mirrored
        ? mixColor(MAGENTA, PURPLE, p)
        : mixColor(YELLOW, RED, p * 0.92);
    }
    return mirrored
      ? mixColor(MAGENTA, PURPLE, p)
      : p < 0.42
        ? mixColor(YELLOW, ORANGE, p / 0.42)
        : mixColor(ORANGE, RED, (p - 0.42) / 0.58);
  }

  private zigzagAt(i: number, t: number, amp: number): number {
    const triangle = i % 2 === 0 ? -1 : 1;
    const center = gauss(t, 0.5, 0.25);
    return (
      triangle *
      amp *
      (0.16 + center * 0.92 + this.valueAt(t) * 0.35) *
      (0.9 + 0.1 * this.activity * Math.sin(this.time * 0.65 + t * TAU * 3))
    );
  }

  private valueAt(t: number): number {
    const scaled = clamp(t, 0, 1) * (BARS - 1);
    const idx = Math.floor(scaled);
    const next = Math.min(BARS - 1, idx + 1);
    return (
      this.values[idx] + (this.values[next] - this.values[idx]) * (scaled - idx)
    );
  }

  private strokeWave(
    cy: number,
    left: number,
    span: number,
    amp: number,
    cycles: number,
    phase: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    for (let i = 0; i < SEGMENTS; i++) {
      const t0 = i / SEGMENTS;
      const t1 = (i + 1) / SEGMENTS;
      const a = Math.min(edgeAlpha(t0), edgeAlpha(t1)) * alpha;
      if (a <= 0.01) continue;
      const x0 = left + span * t0;
      const x1 = left + span * t1;
      const y0 = cy + this.waveAt(t0, amp, cycles, phase);
      const y1 = cy + this.waveAt(t1, amp, cycles, phase);
      this.glowLine(x0, y0, x1, y1, color, a, width, 10);
    }
  }

  private waveAt(
    t: number,
    amp: number,
    cycles: number,
    phase: number,
  ): number {
    const envelope =
      0.18 +
      0.82 *
        (gauss(t, 0.23, 0.18) * 0.35 +
          gauss(t, 0.48, 0.21) * 0.48 +
          gauss(t, 0.74, 0.2) * 0.38);
    const energy = 0.18 + this.valueAt(t) * (0.55 + this.activity * 0.7);
    const drift =
      this.time *
      (0.08 + this.activity * 0.55 + obsAudio.mid * this.activity * 0.55);
    const primary = Math.sin(t * TAU * cycles + phase + drift);
    const secondary =
      Math.sin(t * TAU * (cycles * 0.52 + 0.8) - drift * 1.3 + phase * 0.7) *
      0.38;
    const tertiary =
      Math.sin(t * TAU * (cycles * 1.8 + 1.2) + drift * 0.35) *
      obsAudio.high *
      this.activity *
      0.42;
    return (primary + secondary + tertiary) * amp * envelope * energy;
  }

  private glowLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    alpha: number,
    width: number,
    glow: number,
  ): void {
    this.gfx
      .moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({
        color,
        alpha: alpha * 0.12,
        width: width + glow,
      });
    this.gfx
      .moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({
        color,
        alpha: alpha * 0.24,
        width: width + glow * 0.42,
      });
    this.gfx.moveTo(x0, y0).lineTo(x1, y1).stroke({
      color,
      alpha,
      width,
    });
  }

  private fillRotatedCell(
    cx: number,
    cy: number,
    width: number,
    height: number,
    angle: number,
    color: number,
    alpha: number,
  ): void {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const vx = -uy;
    const vy = ux;
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const points = [
      cx - vx * halfW - ux * halfH,
      cy - vy * halfW - uy * halfH,
      cx + vx * halfW - ux * halfH,
      cy + vy * halfW - uy * halfH,
      cx + vx * halfW + ux * halfH,
      cy + vy * halfW + uy * halfH,
      cx - vx * halfW + ux * halfH,
      cy - vy * halfW + uy * halfH,
    ];

    this.gfx.poly(points).fill({ color, alpha });
  }
}

export class RazerWaveformPulseScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("pulse");
  }
}

export class RazerWaveformPrismScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("prism");
  }
}

export class RazerWaveformSpectrumScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("spectrum");
  }
}

export class RazerWaveformOscilloscopeScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("oscilloscope");
  }
}

export class RazerWaveformBladeScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("blade");
  }
}

export class RazerWaveformRidgeScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("ridge");
  }
}

export class RazerWaveformEqualizerScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("equalizer");
  }
}

export class RazerWaveformWeaveScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("weave");
  }
}

export class RazerWaveformOrbScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("orb");
  }
}

export class RazerWaveformHelixScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("helix");
  }
}

export class RazerWaveformRadialScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("radial");
  }
}

export class RazerWaveformRibbonsScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("ribbons");
  }
}

export class RazerWaveformRibbonBandsScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("ribbonBands");
  }
}

export class RazerWaveformRibbonLatticeScreen extends RazerWaveformVariationScreen {
  constructor() {
    super("ribbonLattice");
  }
}
