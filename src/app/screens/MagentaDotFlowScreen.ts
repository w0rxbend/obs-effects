import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { TAU } from "../../lib/math";

// Hot magenta halftone dots on dark charcoal — organic void shapes break the dot field
// Single color, radius encodes field intensity (true halftone)

const SPACING = 12;
const DOT_COLOR = 0xcc0099;
const BG = 0x1a1a1a;

export class MagentaDotFlowScreen extends Container {
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
    this.time += dt * 0.22;
    this.draw();
  }

  private field(xn: number, yn: number, t: number): number {
    // Domain warp producing organic void shapes (strong, sharp transitions)
    const w1x = xn + 0.32 * Math.sin(yn * TAU * 1.3 + t * 0.26);
    const w1y = yn + 0.32 * Math.cos(xn * TAU * 1.0 - t * 0.19);

    const w2x = w1x + 0.16 * Math.cos(w1y * TAU * 2.6 - t * 0.15);
    const w2y = w1y + 0.16 * Math.sin(w1x * TAU * 2.2 + t * 0.12);

    const f =
      Math.sin(w2x * TAU * 1.7 + w2y * TAU * 2.1 + t * 0.17) * 0.55 +
      Math.sin(w2x * TAU * 3.4 - w2y * TAU * 1.6 - t * 0.11) * 0.3 +
      Math.cos(w2x * TAU * 4.9 + w2y * TAU * 3.7 - t * 0.08) * 0.15;

    // Sharp step: either show dot or void
    return (f + 1) * 0.5;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const cols = Math.ceil(this.w / SPACING) + 1;
    const rows = Math.ceil(this.h / SPACING) + 1;
    const maxR = SPACING * 0.45;
    const THRESHOLD = 0.28; // voids below this level
    const t = this.time;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * SPACING;
        const y = row * SPACING;
        const f = this.field(x / this.w, y / this.h, t);
        if (f < THRESHOLD) continue;

        // Normalize to dot size in active zone
        const fn = (f - THRESHOLD) / (1 - THRESHOLD);
        const r = maxR * (0.25 + 0.75 * fn);
        g.circle(x, y, r);
      }
    }
    g.fill({ color: DOT_COLOR });
  }
}
