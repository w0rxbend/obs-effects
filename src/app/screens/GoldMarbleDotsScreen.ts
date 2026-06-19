import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Halftone dots over domain-warped gold marble field
// Dot size and color encode field intensity: white → light gold → amber → invisible

const SPACING = 12;
const TAU = Math.PI * 2;

const TIERS = [
  { threshold: 0.72, color: 0xffffff }, // bright white
  { threshold: 0.48, color: 0xffd890 }, // light gold
  { threshold: 0.22, color: 0xa06018 }, // dark amber
  { threshold: 0.0, color: 0x000000 }, // invisible — skip
] as const;

export class GoldMarbleDotsScreen extends Container {
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
    this.time += dt * 0.2;
    this.draw();
  }

  private field(xn: number, yn: number, t: number): number {
    // Two-pass domain warp for organic marble
    const w1x = xn + 0.22 * Math.sin(yn * TAU * 1.4 + t * 0.31);
    const w1y = yn + 0.22 * Math.cos(xn * TAU * 1.1 - t * 0.24);

    const w2x = w1x + 0.11 * Math.sin(w1y * TAU * 2.9 + t * 0.18);
    const w2y = w1y + 0.11 * Math.cos(w1x * TAU * 2.4 - t * 0.14);

    const f =
      Math.sin(w2x * TAU * 2.1 + w2y * TAU * 1.7 + t * 0.22) * 0.45 +
      Math.sin(w2x * TAU * 4.3 - w2y * TAU * 3.1 - t * 0.15) * 0.3 +
      Math.cos(w2x * TAU * 1.2 + w2y * TAU * 3.8 + t * 0.11) * 0.25;

    return (f + 1) * 0.5;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x000000 });

    const cols = Math.ceil(this.w / SPACING) + 1;
    const rows = Math.ceil(this.h / SPACING) + 1;
    const maxR = SPACING * 0.44;
    const t = this.time;

    // Collect dots per color tier for batched fills
    const buckets: Map<number, { x: number; y: number; r: number }[]> = new Map(
      TIERS.slice(0, 3).map((tier) => [tier.color, []]),
    );

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * SPACING;
        const y = row * SPACING;
        const f = this.field(x / this.w, y / this.h, t);

        let tierColor: number | null = null;
        let tierFloor = 0;
        for (const tier of TIERS) {
          if (f >= tier.threshold) {
            if (tier.color === 0x000000) break;
            tierColor = tier.color;
            tierFloor = tier.threshold;
            break;
          }
        }
        if (tierColor === null) continue;

        // Next tier threshold for sizing the dot within tier range
        const nextThresh =
          tierFloor === TIERS[0].threshold
            ? 1.0
            : TIERS[TIERS.findIndex((t2) => t2.threshold === tierFloor) - 1]
                .threshold;
        const tNorm = (f - tierFloor) / Math.max(0.01, nextThresh - tierFloor);
        const r = maxR * (0.35 + 0.65 * tNorm);

        buckets.get(tierColor)!.push({ x, y, r });
      }
    }

    // Render each tier in one fill pass
    for (const [color, dots] of buckets) {
      if (dots.length === 0) continue;
      for (const { x, y, r } of dots) g.circle(x, y, r);
      g.fill({ color });
    }
  }
}
