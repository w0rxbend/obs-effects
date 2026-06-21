import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import { obsAudio } from "../../lib";

interface AudioWaveformPalette {
  core: number;
  glow: number;
  outline: number;
}

const DEFAULT_PALETTE: AudioWaveformPalette = {
  core: 0xffffff,
  glow: 0xffffff,
  outline: 0x000000,
};

const RAZER_TOXIC_PALETTE: AudioWaveformPalette = {
  core: 0x44ff00,
  glow: 0x00ff66,
  outline: 0x000000,
};

const TAU = Math.PI * 2;
const BAR_COUNT = 128;
const LINE_SEGMENTS = 176;
const EDGE_FADE = 0.16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function edgeAlpha(t: number): number {
  return smoothstep(0, EDGE_FADE, t) * (1 - smoothstep(1 - EDGE_FADE, 1, t));
}

export class AudioWaveformScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly bars = new Float32Array(BAR_COUNT);
  private readonly seeds = new Float32Array(BAR_COUNT);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private peak = 0;

  constructor(
    private readonly palette: AudioWaveformPalette = DEFAULT_PALETTE,
  ) {
    super();
    this.addChild(this.gfx);

    for (let i = 0; i < BAR_COUNT; i++) {
      const x = i / Math.max(1, BAR_COUNT - 1);
      this.seeds[i] =
        Math.sin(i * 12.9898) * 43758.5453 -
        Math.floor(Math.sin(i * 12.9898) * 43758.5453);
      this.bars[i] = Math.pow(1 - Math.abs(x - 0.5) * 2, 2.2) * 0.12;
    }

    void obsAudio.connect();
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    obsAudio.update(dt);
    const targetPeak = obsAudio.beat ? 1 : 0;
    this.peak += (targetPeak - this.peak) * Math.min(1, dt * 8);
    this.updateBars(dt);
    this.draw();
  }

  private updateBars(dt: number): void {
    const level = obsAudio.level;
    const bass = obsAudio.bass;
    const mid = obsAudio.mid;
    const high = obsAudio.high;
    const attack = 1 - Math.exp(-dt * 24);
    const release = 1 - Math.exp(-dt * 7);

    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / Math.max(1, BAR_COUNT - 1);
      const centered = Math.abs(t - 0.5) * 2;
      const clusterA = Math.exp(-Math.pow((t - 0.44) / 0.11, 2));
      const clusterB = Math.exp(-Math.pow((t - 0.62) / 0.1, 2));
      const clusterC = Math.exp(-Math.pow((t - 0.74) / 0.14, 2));
      const quietEnds = Math.pow(1 - centered, 0.38);
      const grain =
        0.5 +
        0.5 *
          Math.sin(
            this.time * (5.2 + this.seeds[i] * 8.8) +
              i * 0.48 +
              this.seeds[i] * TAU,
          );
      const chatter =
        0.5 + 0.5 * Math.sin(this.time * (14 + this.seeds[i] * 18) + i * 1.87);

      const target =
        0.015 +
        quietEnds * 0.08 +
        clusterA * (bass * 1.35 + level * 0.55) +
        clusterB * (mid * 1.15 + level * 0.42) +
        clusterC * (high * 1.05 + level * 0.34) +
        grain * high * 0.18 +
        chatter * level * 0.12 +
        this.peak * Math.exp(-Math.pow((t - 0.5) / 0.2, 2)) * 0.28;

      const speed = target > this.bars[i] ? attack : release;
      this.bars[i] += (target - this.bars[i]) * speed;
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const span = Math.min(this.w * 0.92, Math.max(720, this.w - 160));
    const left = cx - span * 0.5;
    const amp =
      Math.min(this.h, this.w) *
      (0.044 + obsAudio.level * 0.04 + obsAudio.bass * 0.035);
    const barMax = Math.min(this.h * 0.22, span * 0.16);
    const lineAlpha = 0.54 + obsAudio.level * 0.28;

    g.moveTo(left, cy)
      .lineTo(left + span, cy)
      .stroke({ color: this.palette.outline, alpha: 0.72, width: 5 });
    g.moveTo(left, cy)
      .lineTo(left + span, cy)
      .stroke({
        color: this.palette.core,
        alpha: 0.44 + obsAudio.level * 0.22,
        width: 1,
      });

    this.drawSineTrace(cy, left, span, amp, 1.35, 0, lineAlpha);
    this.drawSineTrace(
      cy,
      left,
      span,
      amp * (0.74 + obsAudio.mid * 0.36),
      2.55,
      Math.PI * 0.76,
      lineAlpha * 0.82,
    );

    const barGap = span / (BAR_COUNT - 1);
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / Math.max(1, BAR_COUNT - 1);
      const alpha = edgeAlpha(t);
      if (alpha <= 0.01) continue;

      const x = left + t * span;
      const shape = 0.28 + 0.72 * Math.exp(-Math.pow((t - 0.56) / 0.27, 2));
      const wobble = Math.sin(this.time * 2.1 + i * 0.17) * amp * 0.08;
      const height = this.bars[i] * barMax * shape + wobble;
      const half = Math.max(2, height);
      const width = Math.max(1, Math.min(3.2, barGap * 0.22));
      const coreAlpha = alpha * (0.42 + this.bars[i] * 1.45);

      g.moveTo(x, cy - half)
        .lineTo(x, cy + half)
        .stroke({
          color: this.palette.outline,
          alpha: clamp(alpha * (0.52 + this.bars[i] * 0.8), 0, 0.78),
          width: width + 4.4,
        });
      g.moveTo(x, cy - half)
        .lineTo(x, cy + half)
        .stroke({
          color: this.palette.core,
          alpha: clamp(coreAlpha, 0, 0.96),
          width,
        });

      if (this.bars[i] > 0.34) {
        g.moveTo(x, cy - half * 1.1)
          .lineTo(x, cy + half * 1.1)
          .stroke({
            color: this.palette.glow,
            alpha: clamp(coreAlpha * 0.18, 0, 0.32),
            width: width * 3,
          });
      }
    }
  }

  private drawSineTrace(
    cy: number,
    left: number,
    span: number,
    amp: number,
    cycles: number,
    phase: number,
    alpha: number,
  ): void {
    const drift = this.time * (0.52 + obsAudio.mid * 0.25);

    for (let i = 0; i < LINE_SEGMENTS; i++) {
      const t0 = i / LINE_SEGMENTS;
      const t1 = (i + 1) / LINE_SEGMENTS;
      const a0 = edgeAlpha(t0);
      const a1 = edgeAlpha(t1);
      const a = Math.min(a0, a1) * alpha;
      if (a <= 0.01) continue;

      const x0 = left + t0 * span;
      const x1 = left + t1 * span;
      const y0 = cy + this.waveAt(t0, amp, cycles, phase, drift);
      const y1 = cy + this.waveAt(t1, amp, cycles, phase, drift);

      this.gfx
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          color: this.palette.outline,
          alpha: a * 0.84,
          width: 5.4 + obsAudio.high * 1.2,
        });
      this.gfx
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          color: this.palette.core,
          alpha: a,
          width: 1.25 + obsAudio.high * 0.9,
        });
    }
  }

  private waveAt(
    t: number,
    amp: number,
    cycles: number,
    phase: number,
    drift: number,
  ): number {
    const env =
      0.18 +
      0.82 *
        (0.55 * Math.exp(-Math.pow((t - 0.28) / 0.19, 2)) +
          0.45 * Math.exp(-Math.pow((t - 0.72) / 0.24, 2)));
    const primary = Math.sin(t * TAU * cycles + phase + drift);
    const secondary =
      Math.sin(t * TAU * (cycles * 0.47 + 0.35) - drift * 0.72 + phase) * 0.34;

    return (primary + secondary) * amp * env;
  }
}

export class RazerAudioWaveformScreen extends AudioWaveformScreen {
  constructor() {
    super(RAZER_TOXIC_PALETTE);
  }
}
