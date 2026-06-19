import type { Ticker } from "pixi.js";
import { Container, Sprite, Texture } from "pixi.js";

const LIME = "#aaff00";
const LIME_DIM = "#558800";
const FONT = "14px 'Courier New', monospace";
const CELL = 14;

const HEAVY = ["©", "○", "□", "×", "⊕", "⊗", "⊙", "X", "O"];
const LIGHT = ["+", "·", "\\", "*", "×", "x", "o"];
const ALL_CHARS = [...HEAVY, ...LIGHT];

interface GlitchBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  ttl: number;
  maxTtl: number;
}

function rnd(): number {
  return Math.random();
}

function pickChar(density: number): string {
  if (density < 0.12) return "";
  if (density < 0.3) return rnd() < 0.4 ? "·" : "";
  if (density < 0.5) return LIGHT[Math.floor(rnd() * LIGHT.length)];
  return HEAVY[Math.floor(rnd() * HEAVY.length)];
}

export class GlitchTerminalScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly offscreen: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: Texture;
  private readonly sprite: Sprite;

  private w = 1920;
  private h = 1080;
  private time = 0;
  private frame = 0;

  private cols = 0;
  private rows = 0;
  private grid: string[] = [];
  private density: Float32Array = new Float32Array(0);

  private blocks: GlitchBlock[] = [];
  private glitchRows: Map<number, { offset: number; ttl: number }> = new Map();
  private nextGlitchAt = 60;

  constructor() {
    super();
    this.offscreen = document.createElement("canvas");
    this.offscreen.width = 1920;
    this.offscreen.height = 1080;
    this.ctx = this.offscreen.getContext("2d")!;
    this.texture = Texture.from(this.offscreen);
    this.sprite = new Sprite(this.texture);
    this.addChild(this.sprite);
    this.buildGrid(1920, 1080);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.offscreen.width = width;
    this.offscreen.height = height;
    this.sprite.width = width;
    this.sprite.height = height;
    this.buildGrid(width, height);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.frame++;
    this.tickBlocks(dt);
    this.tickGlitch();
    if (this.frame % 3 === 0) this.churnGrid();
    this.render();
  }

  private buildGrid(w: number, h: number): void {
    this.cols = Math.ceil(w / CELL) + 1;
    this.rows = Math.ceil(h / CELL) + 1;
    const n = this.cols * this.rows;
    this.density = new Float32Array(n);
    this.grid = new Array(n).fill("");

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const xn = c / this.cols;
        const yn = r / this.rows;
        // Layered density field — organic but biased toward upper-center
        const d =
          0.55 +
          0.25 * Math.sin(xn * 9.1 + yn * 6.3) +
          0.15 * Math.sin(xn * 18.7 - yn * 13.2) +
          0.08 * Math.cos(xn * 4.1 + yn * 3.7) -
          0.2 * Math.pow(Math.abs(xn - 0.5) * 2, 1.4) -
          0.18 * yn;
        const clamped = Math.max(0, Math.min(1, d));
        this.density[r * this.cols + c] = clamped;
        this.grid[r * this.cols + c] = pickChar(clamped);
      }
    }
  }

  private churnGrid(): void {
    // Randomly update ~3% of chars per tick
    const n = this.cols * this.rows;
    const count = Math.floor(n * 0.03);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rnd() * n);
      this.grid[idx] = pickChar(this.density[idx]);
    }
  }

  private tickBlocks(dt: number): void {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      this.blocks[i].ttl -= dt;
      if (this.blocks[i].ttl <= 0) this.blocks.splice(i, 1);
    }
    // Spawn new block occasionally
    if (rnd() < 0.015 && this.blocks.length < 12) {
      const bw = 40 + Math.floor(rnd() * 220);
      const bh = 20 + Math.floor(rnd() * 140);
      this.blocks.push({
        x: Math.floor(rnd() * (this.w - bw)),
        y: Math.floor(rnd() * (this.h - bh)),
        w: bw,
        h: bh,
        ttl: 0.3 + rnd() * 1.8,
        maxTtl: 2,
      });
    }
  }

  private tickGlitch(): void {
    // Expire displaced rows
    for (const [row, data] of this.glitchRows) {
      data.ttl -= 1;
      if (data.ttl <= 0) this.glitchRows.delete(row);
    }

    if (this.frame >= this.nextGlitchAt) {
      const type = Math.floor(rnd() * 3);
      if (type === 0) {
        // Horizontal scanline displacement
        const r = Math.floor(rnd() * this.rows);
        this.glitchRows.set(r, {
          offset: (rnd() < 0.5 ? 1 : -1) * (20 + Math.floor(rnd() * 80)),
          ttl: 4 + Math.floor(rnd() * 8),
        });
      } else if (type === 1) {
        // Rapid-randomize a horizontal stripe
        const r0 = Math.floor(rnd() * this.rows);
        const rh = 1 + Math.floor(rnd() * 3);
        for (let r = r0; r < Math.min(this.rows, r0 + rh); r++) {
          for (let c = 0; c < this.cols; c++) {
            const idx = r * this.cols + c;
            this.grid[idx] = ALL_CHARS[Math.floor(rnd() * ALL_CHARS.length)];
          }
        }
      } else {
        // Force-spawn a block
        if (this.blocks.length < 15) {
          const bw = 80 + Math.floor(rnd() * 300);
          const bh = 30 + Math.floor(rnd() * 120);
          this.blocks.push({
            x: Math.floor(rnd() * (this.w - bw)),
            y: Math.floor(rnd() * (this.h - bh)),
            w: bw,
            h: bh,
            ttl: 0.15 + rnd() * 0.6,
            maxTtl: 0.8,
          });
        }
      }
      this.nextGlitchAt = this.frame + 40 + Math.floor(rnd() * 120);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, this.w, this.h);

    // Draw solid blocks first (behind characters)
    for (const b of this.blocks) {
      const fade = Math.min(1, b.ttl * 6, (b.maxTtl - b.ttl + 0.001) * 6);
      ctx.globalAlpha = Math.min(1, fade);
      ctx.fillStyle = LIME;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;

    // Draw character grid
    ctx.font = FONT;
    ctx.textBaseline = "top";

    for (let r = 0; r < this.rows; r++) {
      const disp = this.glitchRows.get(r);
      const xOffset = disp ? disp.offset : 0;

      for (let c = 0; c < this.cols; c++) {
        const char = this.grid[r * this.cols + c];
        if (!char) continue;

        const density = this.density[r * this.cols + c];
        const x = c * CELL + xOffset;
        const y = r * CELL;

        // Skip if inside a solid block (chars appear on top anyway, but skip for perf)
        ctx.fillStyle = density > 0.55 ? LIME : LIME_DIM;
        ctx.fillText(char, x, y);
      }
    }

    // Small bright specks for glitching white noise
    if (this.frame % 4 < 2) {
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 30; i++) {
        ctx.fillRect(
          Math.floor(rnd() * this.w),
          Math.floor(rnd() * this.h),
          2,
          2,
        );
      }
    }

    // Refresh PixiJS texture
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.texture.source as any).update();
  }
}
