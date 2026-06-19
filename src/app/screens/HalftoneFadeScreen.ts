import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Monochrome halftone fade — white dots on black, dense at top fading to sparse at bottom
// Dot size encodes field intensity (true halftone technique)

const SPACING = 14;
const DOT_COLOR = 0xffffff;

export class HalftoneFadeScreen extends Container {
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
    this.time += dt * 0.25;
    this.draw();
  }

  private field(xn: number, yn: number, t: number): number {
    // Top-heavy fade with organic breathing variation
    const base = Math.pow(Math.max(0, 1 - yn * 1.15), 1.3);

    // Organic noise layers
    const organic =
      Math.sin(xn * 5.1 + yn * 3.7 + t * 0.4) * 0.09 +
      Math.sin(xn * 2.3 - yn * 7.1 + t * 0.22) * 0.06 +
      Math.cos(xn * 9.4 + yn * 2.1 - t * 0.31) * 0.04;

    // Slow global pulse
    const pulse = 1 + Math.sin(t * 0.6) * 0.06;

    // Left-side bias (matching reference image)
    const leftBias = Math.max(0, (0.35 - xn) * 0.25);

    return Math.max(0, Math.min(1, (base + organic + leftBias) * pulse));
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x000000 });

    const cols = Math.ceil(this.w / SPACING) + 1;
    const rows = Math.ceil(this.h / SPACING) + 1;
    const maxR = SPACING * 0.46;
    const t = this.time;

    // Single fill pass — all dots are white, only radius varies
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * SPACING;
        const y = row * SPACING;
        const xn = x / this.w;
        const yn = y / this.h;
        const f = this.field(xn, yn, t);
        const r = maxR * f;
        if (r > 0.4) g.circle(x, y, r);
      }
    }
    g.fill({ color: DOT_COLOR });
  }
}
