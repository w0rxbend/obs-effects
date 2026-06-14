import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const RGB_SPLIT = [0xff2244, 0x22ff88, 0x2266ff] as const;

// Bursts stay short and sparse so the underlying scene keeps reading clearly
const BURST_GAP_MIN = 2.2;
const BURST_GAP_MAX = 6.5;
const BURST_LEN_MIN = 0.18;
const BURST_LEN_MAX = 0.55;

const MICRO_TICK = 1 / 18; // burst contents re-roll at a stuttery low rate

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class GlitchVeilScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly scanGfx = new Graphics();
  private readonly sliceGfx = new Graphics();
  private readonly blockGfx = new Graphics();
  private readonly staticGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  private bursting = false;
  private burstEnd = 0;
  private nextBurst = rand(0.8, 2.5);
  private microTimer = 0;
  private burstStrength = 1;

  private scanY = 0;
  private scanSpeed = 46;

  constructor() {
    super();
    this.addChild(this.scanGfx, this.sliceGfx, this.blockGfx, this.staticGfx);
    this.sliceGfx.blendMode = "add";
    this.blockGfx.blendMode = "add";
  }

  public async show(): Promise<void> {}

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.scanY = rand(0, height);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;

    this.updateScanBand(dt);

    if (this.bursting) {
      this.microTimer -= dt;
      if (this.microTimer <= 0) {
        this.microTimer = MICRO_TICK;
        this.drawBurst();
      }
      if (this.time >= this.burstEnd) {
        this.bursting = false;
        this.nextBurst = this.time + rand(BURST_GAP_MIN, BURST_GAP_MAX);
        this.sliceGfx.clear();
        this.blockGfx.clear();
        this.staticGfx.clear();
      }
    } else if (this.time >= this.nextBurst) {
      this.bursting = true;
      this.burstEnd = this.time + rand(BURST_LEN_MIN, BURST_LEN_MAX);
      this.burstStrength = rand(0.5, 1);
      this.microTimer = 0;
    }
  }

  // Always-on faint scanline shimmer drifting down the frame
  private updateScanBand(dt: number): void {
    this.scanY += this.scanSpeed * dt;
    const bandH = 90;
    if (this.scanY > this.h + bandH) {
      this.scanY = -bandH;
      this.scanSpeed = rand(30, 70);
    }

    const g = this.scanGfx;
    g.clear();
    const flicker = 0.6 + 0.4 * Math.sin(this.time * 11);
    for (let i = 0; i < 4; i++) {
      const y = this.scanY + i * 5;
      g.rect(0, y, this.w, 1.5).fill({
        color: 0xaaccff,
        alpha: 0.035 * flicker * (1 - i * 0.2),
      });
    }
  }

  // One stutter frame of a burst: RGB slice bars, chromatic blocks, static
  private drawBurst(): void {
    const s = this.burstStrength;

    const slices = this.sliceGfx;
    slices.clear();
    const sliceCount = 2 + Math.floor(rand(0, 4) * s);
    for (let i = 0; i < sliceCount; i++) {
      const y = rand(0, this.h);
      const sh = rand(3, 26);
      const shift = rand(8, 60) * s * (Math.random() < 0.5 ? -1 : 1);
      for (let c = 0; c < 3; c++) {
        slices
          .rect(shift * (c - 1) * 0.6, y, this.w, sh)
          .fill({ color: RGB_SPLIT[c], alpha: rand(0.04, 0.12) * s });
      }
      // thin bright tear line on the slice edge
      if (Math.random() < 0.5) {
        slices
          .rect(0, y + (Math.random() < 0.5 ? 0 : sh), this.w, 1)
          .fill({ color: 0xffffff, alpha: rand(0.08, 0.2) * s });
      }
    }

    const blocks = this.blockGfx;
    blocks.clear();
    const blockCount = Math.floor(rand(2, 7) * s);
    for (let i = 0; i < blockCount; i++) {
      const bw = rand(40, 320);
      const bh = rand(8, 70);
      const x = rand(-20, this.w - bw + 20);
      const y = rand(0, this.h - bh);
      const c = RGB_SPLIT[Math.floor(rand(0, 3))];
      const fringe = rand(2, 9) * s;
      blocks.rect(x, y, bw, bh).fill({ color: c, alpha: rand(0.05, 0.14) * s });
      blocks
        .rect(x + fringe, y, bw, bh)
        .fill({ color: 0xffffff, alpha: rand(0.02, 0.05) * s });
    }

    const speckle = this.staticGfx;
    speckle.clear();
    // static confined to a couple of horizontal strips, not the whole frame
    const strips = 1 + Math.floor(rand(0, 2));
    for (let st = 0; st < strips; st++) {
      const sy = rand(0, this.h - 40);
      const sh = rand(14, 44);
      const dots = Math.floor(rand(60, 160) * s);
      for (let i = 0; i < dots; i++) {
        const v = Math.random();
        speckle.rect(rand(0, this.w), sy + rand(0, sh), rand(1, 3), 1).fill({
          color: v > 0.5 ? 0xffffff : 0x000000,
          alpha: rand(0.1, 0.4) * s,
        });
      }
    }
  }
}
