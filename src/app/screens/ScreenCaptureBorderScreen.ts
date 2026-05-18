import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const EDGE_STEPS = 150;
const BAND_COUNT = 7;
const SPARK_COUNT = 120;
const MAX_BAND_DEPTH = 24;

const CATT_CRUST = 0x11111b;
const CATT_MANTLE = 0x181825;
const CATT_BASE = 0x1e1e2e;
const CATT_SURFACE0 = 0x313244;
const CATT_SURFACE1 = 0x45475a;
const CATT_SURFACE2 = 0x585b70;
const CATT_OVERLAY0 = 0x6c7086;

const BAND_COLORS = [
  CATT_CRUST,
  CATT_MANTLE,
  CATT_BASE,
  CATT_SURFACE0,
  CATT_SURFACE1,
  CATT_SURFACE2,
  CATT_OVERLAY0,
] as const;

interface BorderBand {
  depth: number;
  width: number;
  glowWidth: number;
  alpha: number;
  color: number;
  amplitude: number;
  frequency: number;
  speed: number;
  phase: number;
  sidePhase: number;
}

interface EdgeSpark {
  side: 0 | 1 | 2 | 3;
  t: number;
  speed: number;
  depth: number;
  radius: number;
  alpha: number;
  phase: number;
  color: number;
}

export class ScreenCaptureBorderScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly hazeGfx = new Graphics();
  private readonly lineGfx = new Graphics();
  private readonly sparkGfx = new Graphics();
  private readonly bands: BorderBand[] = [];
  private readonly sparks: EdgeSpark[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();

    this.hazeGfx.blendMode = "add";
    this.sparkGfx.blendMode = "add";
    this.addChild(this.hazeGfx, this.lineGfx, this.sparkGfx);

    this.buildBands();
    this.buildSparks();
  }

  public async show(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.redraw();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    for (const spark of this.sparks) {
      spark.t = (spark.t + spark.speed * dt) % 1;
    }

    this.redraw();
  }

  private buildBands(): void {
    for (let i = 0; i < BAND_COUNT; i++) {
      const t = i / Math.max(1, BAND_COUNT - 1);
      this.bands.push({
        depth: t * MAX_BAND_DEPTH,
        width: 0.9 - t * 0.45,
        glowWidth: 1.8 - t * 0.6,
        alpha: 0.86 - t * 0.38,
        color: BAND_COLORS[i % BAND_COLORS.length],
        amplitude: 0.2 + t * 4.5,
        frequency: 1.5 + (i % 3) * 0.9 + t * 1.2,
        speed: (i % 2 === 0 ? 1 : -1) * (0.12 + t * 0.08),
        phase: Math.random() * Math.PI * 2,
        sidePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  private buildSparks(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const t = Math.random();
      const side = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
      this.sparks.push({
        side,
        t,
        speed: 0.015 + Math.random() * 0.045,
        depth: Math.random() ** 1.8 * MAX_BAND_DEPTH,
        radius: 0.08 + Math.random() * 0.18,
        alpha: 0.14 + Math.random() * 0.34,
        phase: Math.random() * Math.PI * 2,
        color: BAND_COLORS[Math.floor(Math.random() * BAND_COLORS.length)],
      });
    }
  }

  private redraw(): void {
    this.hazeGfx.clear();
    this.lineGfx.clear();
    this.sparkGfx.clear();

    this.drawEdgeHaze();
    this.drawBands();
    this.drawCornerPools();
    this.drawSparks();
  }

  private drawEdgeHaze(): void {
    const pulse = 0.72 + 0.28 * Math.sin(this.time * 0.55);

    for (let i = 0; i < 4; i++) {
      const depth = i * 7;
      const alpha = (0.045 - i * 0.007) * pulse;
      const color = i % 2 === 0 ? CATT_CRUST : CATT_SURFACE0;

      this.hazeGfx.rect(0, depth, this.w, 1).fill({ color, alpha });
      this.hazeGfx.rect(0, this.h - depth - 1, this.w, 1).fill({
        color,
        alpha,
      });
      this.hazeGfx.rect(depth, 0, 1, this.h).fill({ color, alpha });
      this.hazeGfx.rect(this.w - depth - 1, 0, 1, this.h).fill({
        color,
        alpha,
      });
    }
  }

  private drawBands(): void {
    for (const band of this.bands) {
      for (let side = 0; side < 4; side++) {
        const points = this.buildEdgeBand(side as 0 | 1 | 2 | 3, band);

        this.hazeGfx.poly(points).stroke({
          color: band.color,
          alpha: band.alpha * 0.2,
          width: band.glowWidth,
          cap: "round",
          join: "round",
        });

        this.lineGfx.poly(points).stroke({
          color: band.color,
          alpha: band.alpha * 0.46,
          width: band.width + 0.3,
          cap: "round",
          join: "round",
        });

        this.lineGfx.poly(points).stroke({
          color: band.color,
          alpha: band.alpha,
          width: band.width,
          cap: "round",
          join: "round",
        });
      }
    }
  }

  private buildEdgeBand(side: 0 | 1 | 2 | 3, band: BorderBand): number[] {
    const points: number[] = [];
    const sideWavePhase = band.sidePhase + side * 1.37;
    const maxWave = Math.min(band.amplitude, band.depth * 0.42);

    for (let i = 0; i <= EDGE_STEPS; i++) {
      const t = i / EDGE_STEPS;
      const endTaper = Math.sin(t * Math.PI);
      const longWave = Math.sin(
        t * Math.PI * 2 * band.frequency +
          this.time * band.speed +
          band.phase +
          sideWavePhase,
      );
      const softRelief = Math.sin(
        t * Math.PI * 2 * (band.frequency * 0.45 + 0.8) -
          this.time * band.speed * 0.7 +
          band.phase * 1.9,
      );
      const drift = (longWave * 0.72 + softRelief * 0.28) * maxWave * endTaper;
      const depth = Math.max(0, band.depth + drift);

      points.push(...this.edgePoint(side, t, depth));
    }

    return points;
  }

  private drawCornerPools(): void {
    const radius = 0.8;
    const pulse = 0.68 + 0.32 * Math.sin(this.time * 0.8);
    const corners = [
      [0, 0],
      [this.w, 0],
      [this.w, this.h],
      [0, this.h],
    ] as const;

    for (let i = 0; i < corners.length; i++) {
      const [x, y] = corners[i];
      const color = BAND_COLORS[(i + 1) % BAND_COLORS.length];

      for (let r = 0; r < 4; r++) {
        this.hazeGfx.circle(x, y, radius + r * 0.5).stroke({
          color,
          alpha: (0.08 - r * 0.014) * pulse,
          width: 0.7 - r * 0.1,
        });
      }
    }
  }

  private drawSparks(): void {
    for (const spark of this.sparks) {
      const pulse = 0.62 + 0.38 * Math.sin(this.time * 1.6 + spark.phase);
      const depthDrift = Math.sin(this.time * 0.7 + spark.phase) * 2.5;
      const [x, y] = this.edgePoint(
        spark.side,
        spark.t,
        Math.max(0, Math.min(MAX_BAND_DEPTH, spark.depth + depthDrift)),
      );
      const radius = spark.radius * pulse;

      this.sparkGfx.circle(x, y, radius * 4).fill({
        color: spark.color,
        alpha: spark.alpha * 0.08,
      });
      this.sparkGfx.circle(x, y, radius).fill({
        color: spark.color,
        alpha: spark.alpha * pulse,
      });
    }
  }

  private edgePoint(
    side: 0 | 1 | 2 | 3,
    t: number,
    depth: number,
  ): [number, number] {
    switch (side) {
      case 0:
        return [this.w * t, depth];
      case 1:
        return [this.w - depth, this.h * t];
      case 2:
        return [this.w * (1 - t), this.h - depth];
      case 3:
        return [depth, this.h * (1 - t)];
    }
  }
}
