import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Blue mosaic/halftone over dark flowing organic shapes
// Small dots, deep navy background, dots range from near-white to dark steel blue

const SPACING = 9;
const TAU = Math.PI * 2;

export class BlueMosaicFlowScreen extends Container {
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
    this.time += dt * 0.18;
    this.draw();
  }

  private field(xn: number, yn: number, t: number): number {
    // Deep domain warp producing elongated flow cells
    const w1x = xn + 0.28 * Math.sin(yn * TAU * 1.2 + t * 0.28);
    const w1y = yn + 0.28 * Math.cos(xn * TAU * 0.9 - t * 0.21);

    const w2x = w1x + 0.14 * Math.cos(w1y * TAU * 2.7 - t * 0.16);
    const w2y = w1y + 0.14 * Math.sin(w1x * TAU * 2.1 + t * 0.13);

    const f =
      Math.sin(w2x * TAU * 1.8 + w2y * TAU * 2.3 + t * 0.19) * 0.5 +
      Math.sin(w2x * TAU * 3.7 - w2y * TAU * 1.9 - t * 0.12) * 0.3 +
      Math.cos(w2x * TAU * 5.1 + w2y * TAU * 4.2 - t * 0.09) * 0.2;

    return (f + 1) * 0.5;
  }

  private fieldToColor(f: number): number | null {
    if (f > 0.78) return 0xd8eeff; // near white
    if (f > 0.58) return 0x6ab4d8; // sky blue
    if (f > 0.36) return 0x2a7099; // steel blue
    if (f > 0.16) return 0x0d3d55; // dark navy
    return null; // void — no dot
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x04111a });

    const cols = Math.ceil(this.w / SPACING) + 1;
    const rows = Math.ceil(this.h / SPACING) + 1;
    const maxR = SPACING * 0.43;
    const t = this.time;

    // Bucket dots by color for efficient batched fills
    const buckets = new Map<number, { x: number; y: number; r: number }[]>();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * SPACING;
        const y = row * SPACING;
        const f = this.field(x / this.w, y / this.h, t);
        const color = this.fieldToColor(f);
        if (color === null) continue;

        // Scale dot radius within its color tier
        const r = maxR * (0.3 + 0.7 * Math.min(1, f * 1.3));

        if (!buckets.has(color)) buckets.set(color, []);
        buckets.get(color)!.push({ x, y, r });
      }
    }

    for (const [color, dots] of buckets) {
      for (const { x, y, r } of dots) g.circle(x, y, r);
      g.fill({ color });
    }
  }
}
