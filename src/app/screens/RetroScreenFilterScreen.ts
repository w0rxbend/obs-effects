import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const SCANLINE_STEP = 2;
const MICRO_GRID_STEP = 4;
const PHOSPHOR_STEP = 3;
const NOISE_COUNT = 360;

interface DustPixel {
  x: number;
  y: number;
  alpha: number;
  size: number;
  phase: number;
}

export class RetroScreenFilterScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly staticGfx = new Graphics();
  private readonly glassGfx = new Graphics();
  private readonly motionGfx = new Graphics();
  private readonly noiseGfx = new Graphics();

  private readonly dust: DustPixel[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();

    this.staticGfx.blendMode = "normal";
    this.glassGfx.blendMode = "normal";
    this.motionGfx.blendMode = "add";
    this.noiseGfx.blendMode = "add";
    this.addChild(this.staticGfx, this.motionGfx, this.noiseGfx, this.glassGfx);

    for (let i = 0; i < NOISE_COUNT; i++) {
      this.dust.push({
        x: Math.random(),
        y: Math.random(),
        alpha: 0.015 + Math.random() * 0.035,
        size: 0.6 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.drawStaticLayer();
    this.drawGlassLayer();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.drawMotionLayer();
    this.drawNoiseLayer();
  }

  private drawStaticLayer(): void {
    const g = this.staticGfx;
    g.clear();

    this.drawPhosphorMask(g);
    this.drawMicroGrid(g);
    this.drawScanlines(g);
  }

  private drawPhosphorMask(g: Graphics): void {
    const colors = [0xb6f7d0, 0x8fb4ff, 0xff9f9f] as const;

    for (let x = 0; x < this.w; x += PHOSPHOR_STEP) {
      const color = colors[(x / PHOSPHOR_STEP) % colors.length];
      g.rect(x, 0, 1, this.h).fill({
        color,
        alpha: 0.007,
      });
    }
  }

  private drawMicroGrid(g: Graphics): void {
    for (let x = 0; x <= this.w; x += MICRO_GRID_STEP) {
      const major = x % (MICRO_GRID_STEP * 5) === 0;
      g.rect(x, 0, 1, this.h).fill({
        color: 0xc8ffe8,
        alpha: major ? 0.012 : 0.006,
      });
    }

    for (let y = 0; y <= this.h; y += MICRO_GRID_STEP) {
      const major = y % (MICRO_GRID_STEP * 5) === 0;
      g.rect(0, y, this.w, 1).fill({
        color: 0xc8ffe8,
        alpha: major ? 0.01 : 0.005,
      });
    }
  }

  private drawScanlines(g: Graphics): void {
    for (let y = 0; y < this.h; y += SCANLINE_STEP) {
      const alpha = y % 4 === 0 ? 0.033 : 0.018;
      g.rect(0, y, this.w, 1).fill({
        color: 0x000000,
        alpha,
      });
    }
  }

  private drawGlassLayer(): void {
    const g = this.glassGfx;
    g.clear();

    const maxEdge = Math.min(80, Math.max(32, Math.min(this.w, this.h) * 0.06));
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const alpha = 0.012 + t * 0.018;
      const inset = i * (maxEdge / 18);

      g.rect(0, inset, this.w, 1).fill({ color: 0x000000, alpha });
      g.rect(0, this.h - inset - 1, this.w, 1).fill({
        color: 0x000000,
        alpha,
      });
      g.rect(inset, 0, 1, this.h).fill({ color: 0x000000, alpha });
      g.rect(this.w - inset - 1, 0, 1, this.h).fill({
        color: 0x000000,
        alpha,
      });
    }

    this.drawCurvedGlassHints(g);
  }

  private drawCurvedGlassHints(g: Graphics): void {
    const curve = Math.min(this.w, this.h) * 0.045;
    const inset = Math.min(28, Math.min(this.w, this.h) * 0.018);
    const right = this.w - inset;
    const bottom = this.h - inset;

    g.moveTo(inset, curve)
      .quadraticCurveTo(inset + curve * 0.15, inset, curve, inset)
      .lineTo(right - curve, inset)
      .quadraticCurveTo(right - curve * 0.15, inset, right, curve)
      .stroke({ color: 0xe6fff5, alpha: 0.038, width: 1 });

    g.moveTo(right, this.h - curve)
      .quadraticCurveTo(right - curve * 0.15, bottom, right - curve, bottom)
      .lineTo(curve, bottom)
      .quadraticCurveTo(inset + curve * 0.15, bottom, inset, this.h - curve)
      .stroke({ color: 0x000000, alpha: 0.075, width: 1.2 });

    g.moveTo(inset, curve)
      .quadraticCurveTo(curve * 0.25, this.h * 0.5, inset, this.h - curve)
      .stroke({ color: 0x000000, alpha: 0.045, width: 1 });

    g.moveTo(right, curve)
      .quadraticCurveTo(
        this.w - curve * 0.25,
        this.h * 0.5,
        right,
        this.h - curve,
      )
      .stroke({ color: 0x000000, alpha: 0.045, width: 1 });
  }

  private drawMotionLayer(): void {
    const g = this.motionGfx;
    g.clear();

    const rollY = ((this.time * 46) % (this.h + 120)) - 60;
    const shimmer = 0.5 + 0.5 * Math.sin(this.time * 8.3);

    g.rect(0, rollY, this.w, 18).fill({
      color: 0xdcfff0,
      alpha: 0.018 + shimmer * 0.012,
    });
    g.rect(0, rollY + 19, this.w, 2).fill({
      color: 0xffffff,
      alpha: 0.026,
    });

    const drift = Math.sin(this.time * 0.9) * 1.4;
    g.rect(drift - 2, 0, 1, this.h).fill({ color: 0xff7b9c, alpha: 0.015 });
    g.rect(-drift + 2, 0, 1, this.h).fill({ color: 0x80fff6, alpha: 0.015 });

    for (let i = 0; i < 10; i++) {
      const y = (this.time * (10 + i * 1.7) + i * 151) % this.h;
      const alpha = 0.006 + 0.006 * Math.sin(this.time * 1.4 + i);
      g.rect(0, y, this.w, 1).fill({ color: 0xf4fff7, alpha });
    }
  }

  private drawNoiseLayer(): void {
    const g = this.noiseGfx;
    g.clear();

    for (const pixel of this.dust) {
      const flicker = 0.5 + 0.5 * Math.sin(this.time * 12 + pixel.phase);
      const xJitter = Math.sin(this.time * 1.7 + pixel.phase) * 0.5;
      const yJitter = Math.cos(this.time * 1.1 + pixel.phase) * 0.5;

      g.rect(
        pixel.x * this.w + xJitter,
        pixel.y * this.h + yJitter,
        pixel.size,
        pixel.size,
      ).fill({
        color: 0xe8fff5,
        alpha: pixel.alpha * flicker,
      });
    }
  }
}
