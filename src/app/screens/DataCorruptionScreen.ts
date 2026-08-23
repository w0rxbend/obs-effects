import { Container, Graphics } from "pixi.js";
import type { Ticker } from "pixi.js";
import { clamp, randRange as rand } from "../../lib/math";

type EventKind = "tear" | "block" | "combined";

interface TearBand {
  y: number;
  h: number;
  shiftX: number;
  color: number;
  alpha: number;
  rgbShift: number;
}

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
}

interface CorruptEvent {
  kind: EventKind;
  startTime: number;
  duration: number;
  tears: TearBand[];
  blocks: Block[];
}

const BLOCK_SIZE = 16;

export class DataCorruptionScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly blockGfx = new Graphics();
  private readonly tearGfx = new Graphics();
  private readonly rgbGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;
  private nextEventTime = rand(2, 6);

  // Burst cluster state
  private burstCount = 0;
  private burstCooldownUntil = 0;

  private activeEvent: CorruptEvent | null = null;

  constructor() {
    super();
    this.addChild(this.blockGfx);
    this.addChild(this.tearGfx);
    this.addChild(this.rgbGfx);
  }

  private scheduleNext(): void {
    if (this.burstCount > 0) {
      this.burstCount--;
      this.nextEventTime = this.time + rand(0.08, 0.35);
      if (this.burstCount === 0) {
        this.burstCooldownUntil = this.time + rand(10, 22);
      }
    } else {
      this.nextEventTime = this.time + rand(3, 11);
      if (Math.random() < 0.18 && this.time >= this.burstCooldownUntil) {
        this.burstCount = Math.floor(rand(2, 5));
      }
    }
  }

  private createEvent(): CorruptEvent {
    const r = Math.random();
    const kind: EventKind = r < 0.42 ? "tear" : r < 0.72 ? "block" : "combined";
    const duration = rand(0.06, 0.5);
    const tears: TearBand[] = [];
    const blocks: Block[] = [];

    if (kind !== "block") {
      const count = Math.floor(rand(1, 4));
      for (let i = 0; i < count; i++) {
        const y = rand(0, this.h);
        const h = rand(1, 22);
        const shiftX = (Math.random() < 0.5 ? 1 : -1) * rand(6, 90);
        tears.push({
          y,
          h,
          shiftX,
          color: Math.random() < 0.12 ? 0xffffff : 0xdde2ee,
          alpha: rand(0.25, 0.7),
          rgbShift: rand(4, 20),
        });
      }
    }

    if (kind !== "tear") {
      const cols = Math.floor(rand(3, 18));
      const rows = Math.floor(rand(2, 9));
      const ox =
        Math.floor(rand(0, this.w - cols * BLOCK_SIZE) / BLOCK_SIZE) *
        BLOCK_SIZE;
      const oy =
        Math.floor(rand(0, this.h - rows * BLOCK_SIZE) / BLOCK_SIZE) *
        BLOCK_SIZE;
      for (let r2 = 0; r2 < rows; r2++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.7) {
            const luma = Math.floor(rand(55, 235));
            const isChroma = Math.random() < 0.1;
            const color = isChroma
              ? Math.random() < 0.5
                ? 0x1a3a8f
                : 0x8f1a2a
              : (luma << 16) | (luma << 8) | luma;
            blocks.push({
              x: ox + c * BLOCK_SIZE,
              y: oy + r2 * BLOCK_SIZE,
              w: BLOCK_SIZE,
              h: BLOCK_SIZE,
              color,
              alpha: rand(0.1, 0.4),
            });
          }
        }
      }
    }

    return { kind, startTime: this.time, duration, tears, blocks };
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS / 1000, 0, 0.05);
    this.time += dt;

    if (!this.activeEvent && this.time >= this.nextEventTime) {
      this.activeEvent = this.createEvent();
    }

    if (this.activeEvent) {
      const age = this.time - this.activeEvent.startTime;
      if (age >= this.activeEvent.duration) {
        this.activeEvent = null;
        this.blockGfx.clear();
        this.tearGfx.clear();
        this.rgbGfx.clear();
        this.scheduleNext();
      } else {
        this.drawEvent(this.activeEvent, age);
      }
    }
  }

  private drawEvent(ev: CorruptEvent, age: number): void {
    const p = age / ev.duration;
    // Snap in, ease out
    const fadeIn = Math.min(p * 15, 1);
    const fadeOut = p < 0.5 ? 1 : 1 - Math.pow((p - 0.5) * 2, 1.8);
    const opacity = fadeIn * fadeOut;

    this.drawBlocks(ev.blocks, opacity);
    this.drawTears(ev.tears, opacity);
  }

  private drawBlocks(blocks: Block[], opacity: number): void {
    const g = this.blockGfx;
    g.clear();
    for (const b of blocks) {
      g.rect(b.x, b.y, b.w, b.h).fill({
        color: b.color,
        alpha: b.alpha * opacity,
      });
    }
  }

  private drawTears(tears: TearBand[], opacity: number): void {
    const tg = this.tearGfx;
    const rg = this.rgbGfx;
    tg.clear();
    rg.clear();
    const { w } = this;

    for (const t of tears) {
      const a = t.alpha * opacity;
      if (a < 0.01) continue;
      const s = t.rgbShift;

      // Red channel shifted left, blue shifted right
      rg.rect(t.shiftX - s * 1.4, t.y, w, t.h).fill({
        color: 0xff1a1a,
        alpha: a * 0.45,
      });
      rg.rect(t.shiftX + s, t.y, w, t.h).fill({
        color: 0x1a4aff,
        alpha: a * 0.38,
      });

      // Main displaced band
      tg.rect(t.shiftX, t.y, w, t.h).fill({ color: t.color, alpha: a });
    }
  }
}
