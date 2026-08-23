import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import { obsAudio } from "../../lib";
import { lerpHex as mixColor } from "../../lib/color";
import { TAU } from "../../lib/math";

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
  private readonly peaks = new Float32Array(BARS);
  private readonly seeds = new Float32Array(BARS);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private beat = 0;
  private activity = 0;
  private wavePhase = 0;

  constructor(private readonly variant: WaveformVariant) {
    super();
    this.addChild(this.gfx);

    for (let i = 0; i < BARS; i++) {
      const s = Math.sin(i * 91.171) * 43758.5453;
      this.seeds[i] = s - Math.floor(s);
      this.values[i] = 0.06;
      this.peaks[i] = 0.06;
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
    this.wavePhase += dt * (0.18 + this.activity * 0.25);
    this.updateValues(dt);
    this.draw();
  }

  private updateValues(dt: number): void {
    if (this.isRibbonFamily()) {
      this.updateRibbonsValues(dt);
      return;
    }
    this.updateRibbonLikeValues(dt);
  }

  private isRibbonFamily(): boolean {
    return (
      this.variant === "ribbons" ||
      this.variant === "ribbonBands" ||
      this.variant === "ribbonLattice"
    );
  }

  private updateRibbonsValues(dt: number): void {
    const level = obsAudio.level;
    const bass = obsAudio.bass;
    const mid = obsAudio.mid;
    const high = obsAudio.high;
    const attack = 1 - Math.exp(-dt * 26);
    const release = 1 - Math.exp(-dt * 3.8);
    const peakFalloff = Math.exp(-dt * 2.05);
    const sweep = this.wavePhase * 0.6;
    const peakOffset = this.wavePhase * 0.12;

    for (let i = 0; i < BARS; i++) {
      const t = i / (BARS - 1);
      const center = 1 - Math.abs(t - 0.5) * 2;
      const bassEnvelope =
        gauss(t, 0.22, 0.17) * (bass * 1.2 + level * 0.44) +
        gauss(t, 0.08, 0.09) * (bass * 0.34 + level * 0.22);
      const midEnvelope =
        gauss(t, 0.52, 0.22) * (mid * 1.06 + level * 0.36) +
        gauss(t, 0.34, 0.16) * (mid * 0.46 + level * 0.24);
      const highEnvelope =
        gauss(t, 0.78, 0.16) * (high * 0.92 + level * 0.27) +
        gauss(t, 0.92, 0.1) * (high * 0.28 + level * 0.18);
      const lfo =
        0.55 +
        0.45 *
          Math.sin(
            sweep +
              t * TAU * 1.8 +
              i * 0.14 +
              this.seeds[i] * 0.9 +
              this.wavePhase,
          );
      const micro = 0.5 + 0.5 * Math.sin(t * TAU * 2.9 + i * 0.27 + peakOffset);
      const coherentBlend =
        (i > 0 ? this.values[i - 1] : this.values[i]) * 0.12 +
        (i + 1 < BARS ? this.values[i + 1] : this.values[i]) * 0.12 +
        this.peaks[i] * 0.22;
      const bandBase =
        0.006 + Math.pow(center, 1.35) * (0.008 + this.activity * 0.024);
      const response =
        (bassEnvelope * 0.42 + midEnvelope * 0.4 + highEnvelope * 0.34) *
        (0.9 + this.activity * 0.95);
      const target = clamp(
        bandBase +
          response * (0.22 + this.activity * 0.9) +
          lfo * (0.02 + this.activity * 0.056) * (1 + this.activity * 0.42) +
          micro * this.activity * 0.036 +
          coherentBlend * 0.27 +
          this.peaks[i] * 0.08 +
          this.beat * gauss(t, 0.5, 0.22) * 0.18,
        0.004,
        1,
      );
      const speed = target > this.values[i] ? attack : release;
      this.values[i] += (target - this.values[i]) * speed;
      this.peaks[i] = Math.max(this.peaks[i] * peakFalloff, this.values[i]);
    }
  }

  private updateRibbonLikeValues(dt: number): void {
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
      this.peaks[i] = Math.max(this.peaks[i], this.values[i]);
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
    const base = this.h * 0.58;
    const left = this.w * 0.16;
    const span = this.w * 0.68;
    const maxHeight = this.h * 0.18;
    const columns = 68;
    const rows = 22;
    const dotRadius = 3;
    const density = 0.72;
    const waveBias = 0.28;
    const calm = this.activity < 0.06;
    const colGap = span / Math.max(1, columns - 1);
    const rowGap = maxHeight / rows;

    for (let col = 0; col < columns; col++) {
      const t = col / Math.max(1, columns - 1);
      const envelope =
        gauss(t, 0.24, 0.1) * 0.55 +
        gauss(t, 0.42, 0.14) * 0.78 +
        gauss(t, 0.58, 0.08) * 1.05 +
        gauss(t, 0.76, 0.14) * 0.72;
      const responsiveHeight =
        rows *
        clamp(
          (0.06 + envelope * density * (0.48 + this.activity * 0.52)) *
            (0.24 + this.activity * 1.1) +
            this.valueAt(t) * waveBias * (0.35 + this.activity * 0.9) +
            (calm
              ? 0
              : 0.1 *
                (0.5 +
                  0.5 *
                    Math.sin(
                      this.time * (1.4 + this.seeds[col % BARS] * 1.8) +
                        col * 0.54,
                    )) *
                this.activity),
          0.06,
          1,
        );
      const height = calm ? 1 : Math.ceil(responsiveHeight);
      const x = left + colGap * col;

      for (let row = 0; row < height; row++) {
        const p = row / rows;
        const yTop = base - row * rowGap;
        const color = this.dotColor("cyanDepth", t, p, false);
        this.gfx.circle(x, yTop, dotRadius).fill({
          color,
          alpha: (0.28 + p * 0.7) * edgeAlpha(t),
        });
      }
    }
  }

  private drawSpectrum(): void {
    const base = this.h * 0.66;
    const left = this.w * 0.1;
    const span = this.w * 0.76;
    const columns = 42;
    const rows = 18;
    const cellW = span / columns;
    const cellH = this.h * 0.018;
    const calm = this.activity < 0.06;
    const tone = clamp(0.2 + obsAudio.level * 0.8, 0, 1);

    for (let i = 0; i < columns; i++) {
      const t = i / (columns - 1);
      const bandEnergy =
        this.valueAt(t) * (0.28 + this.activity * 0.72) +
        gauss(t, 0.48, 0.2) *
          (0.09 + obsAudio.bass * this.activity * 0.42) *
          (0.4 + this.activity * 0.5);
      const noise = calm
        ? 0
        : 0.05 *
          this.activity *
          (0.5 +
            0.5 * Math.sin(this.time * 0.42 + i * 0.65 + this.wavePhase * 0.8));
      const height = Math.ceil(
        rows * clamp(0.06 + bandEnergy + noise + tone * 0.03, 0.08, 1),
      );
      const x = left + span * t;
      const barHeight = calm ? 1 : height;
      for (let row = 0; row < barHeight; row++) {
        const y = base - row * cellH;
        const color = mixColor(BLUE, CYAN, row / rows);
        this.gfx.rect(x, y, cellW * 0.74, cellH * 0.56).fill({
          color,
          alpha: calm
            ? 0.22
            : 0.16 +
              (row / rows) *
                (0.5 + this.activity * 0.12) *
                (0.55 + bandEnergy * 0.75),
        });
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

    const energy = (this.valueAt(0.17) + this.valueAt(0.83)) * 0.5;
    const motionPulse = 1 + (this.activity * 0.22 + energy * 0.16);
    const centerDrift = Math.sin(this.time * 0.28) * amp * 0.08;

    this.glowLine(
      left,
      cy + centerDrift,
      left + span,
      cy - centerDrift,
      WHITE,
      0.44,
      1.7,
      18,
    );
    this.glowLine(
      left,
      cy + centerDrift * 0.5,
      left + span,
      cy - centerDrift * 0.5,
      BLUE,
      0.22 + energy * 0.2,
      1.2,
      10,
    );
    this.strokeWave(
      cy,
      left,
      span,
      amp * (0.92 * motionPulse + energy * 0.2),
      5.8,
      this.time * 1.1,
      CYAN,
      0.94,
      1.55,
    );
    this.strokeWave(
      cy,
      left,
      span,
      amp * 0.68 * motionPulse,
      7.2,
      this.time * 1.1 + 1.5,
      TEAL,
      0.84,
      1.2,
    );
    this.strokeWave(
      cy,
      left,
      span,
      amp * 0.44 * (1 + this.activity * 0.2),
      10.6,
      this.time * 1.6 + Math.PI,
      BLUE,
      0.7,
      1.02,
    );
    for (let i = 0; i < 24; i++) {
      const t = (i + 0.5) / 24;
      const marker = this.valueAt(t);
      const peak = this.peakAt(t);
      if ((marker < 0.16 && peak < 0.16) || t <= 0.02 || t >= 0.98) continue;
      const x = left + span * t;
      const y =
        cy + this.waveAt(t, amp * 0.22 * motionPulse, 13, this.time * 1.3 + i);
      const a = (0.1 + marker * 0.45 + peak * 0.4) * edgeAlpha(t);
      this.gfx
        .circle(x, y, 1.8 + peak * 3.4)
        .fill({ color: WHITE, alpha: clamp(a, 0, 0.8) });
      this.gfx
        .circle(x, y, 4.8)
        .fill({ color: CYAN, alpha: clamp(a * 0.24, 0, 0.32) });
    }
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
      const sample = this.valueAt(t);
      const peak = this.peakAt(t);
      const crest =
        0.8 +
        0.24 *
          Math.sin(t * TAU * 7.5 + this.time * (0.45 + this.activity * 1.6)) +
        peak * 0.3;
      const profile = 0.72 + sample * 0.58;
      const h = amp * body * crest * profile * (1 + sample * 0.2 + peak * 0.16);
      const x = left + span * t;
      upper.push(x, cy - h);
      lower.unshift(
        x,
        cy +
          h *
            (0.64 +
              Math.sin(t * TAU * 3.5 + this.wavePhase) * 0.1 +
              peak * 0.14),
      );
    }

    this.gfx.poly([...upper, ...lower]).fill({
      color: MAGENTA,
      alpha: 0.52 + this.activity * 0.1,
    });
    this.gfx.poly([...upper, ...lower]).stroke({
      color: PINK,
      alpha: 0.9,
      width: 1.5,
    });
    this.gfx.poly([...upper, ...lower]).stroke({
      color: WHITE,
      alpha: 0.28,
      width: 2.6,
    });

    for (let i = 0; i < upper.length; i += 2) {
      const t = i / 2 / SEGMENTS;
      if (this.valueAt(t) < 0.12) continue;
      const x = upper[i];
      const y0 = upper[i + 1];
      const y1 = lower[lower.length - 2 - i];
      this.glowLine(x, y0, x, y1, CYAN, edgeAlpha(t) * 0.28, 1.1, 4);
    }

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
    const upper: number[] = [];
    const lower: number[] = [];
    const steps = 156;
    const floor = this.h * 0.5;
    const floorLift = amp * 0.23;

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
      const sample = this.valueAt(t);
      const peak = this.peakAt(t);
      const h =
        amp *
        body *
        (0.34 + sample * 0.72 + peak * 0.26) *
        carrier *
        (0.74 + this.activity * 0.34);
      const x = left + span * t;
      upper.push(x, cy + h);
      const drift = Math.sin(t * TAU * 0.8 + this.wavePhase) * 0.16;
      const floorMod = 1 + drift + peak * 0.4;
      lower.push(x, floor + floorLift * floorMod * 0.6);
    }

    const base = [...lower].reverse();
    this.gfx.poly([...upper, ...base]).fill({
      color: TEAL,
      alpha: 0.22 + this.activity * 0.3,
    });

    for (let i = 0; i < upper.length - 2; i += 2) {
      const t = i / Math.max(2, upper.length - 2);
      const x0 = upper[i];
      const y0 = upper[i + 1];
      const x1 = upper[i + 2];
      const y1 = upper[i + 3];
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
      if ((i / 2) % 16 === 0 && this.peakAt(t) > 0.22) {
        this.glowLine(x0, y0, x1, y1, WHITE, 0.28, 1.6, 6);
      }
    }

    this.glowLine(
      left,
      cy,
      left + span,
      cy,
      WHITE,
      0.24 + this.peakAt(0.5) * 0.3,
      0.9,
      10,
    );
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
    const rows = 13;
    const innerRadius = size * 0.14;
    const cellDepth = size * 0.026;
    const cellWidth = size * 0.023;
    const spin =
      this.time * (0.015 + this.activity * 0.105) + this.wavePhase * 0.24;

    for (let ray = 0; ray < rays; ray++) {
      const t = ray / rays;
      const angle =
        t * TAU -
        Math.PI * 0.5 +
        spin +
        Math.sin(this.wavePhase + t * TAU) * 0.016;
      const wave =
        gauss(t, 0.08, 0.045) * 0.64 +
        gauss(t, 0.18, 0.06) * 0.5 +
        gauss(t, 0.31, 0.055) * 0.82 +
        gauss(t, 0.44, 0.05) * 0.72 +
        gauss(t, 0.58, 0.07) * 0.56 +
        gauss(t, 0.72, 0.045) * 0.76 +
        gauss(t, 0.86, 0.06) * 0.62;
      const sample = this.valueAt(t);
      const peak = this.peakAt(t);
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
              sample * (0.18 + this.activity * 0.36) +
              peak * 0.2 +
              flicker * 0.08 * this.activity +
              this.beat * gauss(t, 0.5, 0.25) * 0.22 +
              this.wavePhase * 0.007,
            0.12,
            1,
          ),
      );

      for (let row = 0; row < height; row++) {
        const rowT = row / Math.max(1, rows - 1);
        const radius = innerRadius + row * cellDepth;
        const color = paletteAt(t + rowT * 0.16 + peak * 0.2, 0.18);
        const alpha =
          0.34 + rowT * 0.4 + sample * 0.14 + this.wavePhase * 0.005;
        const jitter =
          Math.sin(row * 1.7 + ray * 0.41 + this.time * 2) *
            (0.15 + this.activity * 0.65) +
          peak * 0.22 +
          Math.sin(this.wavePhase * 0.8 + t * TAU * 2) * 0.07;
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

    const corePulse =
      innerRadius * (0.28 + this.activity * 0.2 + this.peakAt(0) * 0.16);
    this.gfx.circle(cx, cy, corePulse).fill({
      color: WHITE,
      alpha: 0.09 + this.activity * 0.09,
    });
    this.gfx.circle(cx, cy, corePulse).stroke({
      color: CYAN,
      alpha: 0.44,
      width: 1.8,
    });

    const ringSteps = 96;
    for (let i = 0; i < ringSteps; i++) {
      const a0 = (i / ringSteps) * TAU + spin;
      const a1 = ((i + 1) / ringSteps) * TAU + spin;
      const t0 = i / ringSteps;
      const waveT =
        this.valueAt(t0) * 0.4 + this.peakAt(t0) * 0.12 + this.activity * 0.2;
      const r = innerRadius * (1 + (0.34 + waveT) * 0.32);
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      const sw = 0.8 + waveT * 1.8;
      this.glowLine(
        x0,
        y0,
        x1,
        y1,
        paletteAt(t0, 0.4),
        edgeAlpha(t0) * 0.36,
        sw,
        7,
      );
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
      const sampleT = clamp(t + layer * 0.014 - row * 0.01, 0, 1);
      const sample = this.valueAt(sampleT);
      const peak = this.peakAt(sampleT);
      const audio =
        0.32 +
        sample * (0.95 + this.activity * 0.45) +
        peak * 0.42 +
        this.activity * 0.28 +
        this.beat * gauss(t, 0.5, 0.3) * 0.34;
      const carrier =
        Math.sin(
          t * TAU * (1.38 + layer * 0.1) + phase + this.time * speed * 0.9,
        ) *
          (0.52 + sample * 0.18) +
        Math.sin(
          t * TAU * (2.95 + row * 0.18) -
            phase +
            this.wavePhase * 0.7 +
            i * 0.02,
        ) *
          0.2 +
        Math.sin(
          t * TAU * (0.82 + layer * 0.035) + this.wavePhase * 1.4 + i * 0.16,
        ) *
          0.16;
      const lift =
        carrier *
        amp *
        edge *
        (0.21 + lobes * 0.64) *
        (0.76 + this.activity * 0.22);
      const half =
        thickness *
        edge *
        Math.max(0.02, lobes) *
        (0.86 + audio * 0.52) *
        (0.72 + 0.2 * Math.sin(this.wavePhase + t * TAU * 1.9 + phase));
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

  private peakAt(t: number): number {
    const scaled = clamp(t, 0, 1) * (BARS - 1);
    const idx = Math.floor(scaled);
    const next = Math.min(BARS - 1, idx + 1);
    return (
      this.peaks[idx] + (this.peaks[next] - this.peaks[idx]) * (scaled - idx)
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
