import type { Ticker } from "pixi.js";
import { Container, Sprite, Texture } from "pixi.js";

export interface GlitchTerminalConfig {
  fg: string;
  fgDim: string;
  bg: string;
  blockColor: string;
  heavy: string[];
  light: string[];
  cell: number;
  font: string;
  churnRate: number;
  maxBlocks: number;
  glitchInterval: [number, number]; // [min, max] frames between events
  blockAlpha: number;
  sparkColor?: string;
  densityField?: (xn: number, yn: number) => number;
}

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

export class GlitchTerminalBase extends Container {
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

  private readonly cfg: GlitchTerminalConfig;
  private readonly allChars: string[];

  constructor(cfg: GlitchTerminalConfig) {
    super();
    this.cfg = cfg;
    this.allChars = [...cfg.heavy, ...cfg.light];

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

  private pickChar(density: number): string {
    const { heavy, light } = this.cfg;
    if (density < 0.12) return "";
    if (density < 0.3) return rnd() < 0.4 ? (light[0] ?? "·") : "";
    if (density < 0.5) return light[Math.floor(rnd() * light.length)];
    return heavy[Math.floor(rnd() * heavy.length)];
  }

  private buildGrid(w: number, h: number): void {
    const { cell, densityField } = this.cfg;
    this.cols = Math.ceil(w / cell) + 1;
    this.rows = Math.ceil(h / cell) + 1;
    const n = this.cols * this.rows;
    this.density = new Float32Array(n);
    this.grid = new Array(n).fill("");

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const xn = c / this.cols;
        const yn = r / this.rows;
        let d: number;
        if (densityField) {
          d = densityField(xn, yn);
        } else {
          d =
            0.55 +
            0.25 * Math.sin(xn * 9.1 + yn * 6.3) +
            0.15 * Math.sin(xn * 18.7 - yn * 13.2) +
            0.08 * Math.cos(xn * 4.1 + yn * 3.7) -
            0.2 * Math.pow(Math.abs(xn - 0.5) * 2, 1.4) -
            0.18 * yn;
        }
        const clamped = Math.max(0, Math.min(1, d));
        this.density[r * this.cols + c] = clamped;
        this.grid[r * this.cols + c] = this.pickChar(clamped);
      }
    }
  }

  private churnGrid(): void {
    const n = this.cols * this.rows;
    const count = Math.floor(n * this.cfg.churnRate);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rnd() * n);
      this.grid[idx] = this.pickChar(this.density[idx]);
    }
  }

  private tickBlocks(dt: number): void {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      this.blocks[i].ttl -= dt;
      if (this.blocks[i].ttl <= 0) this.blocks.splice(i, 1);
    }
    if (rnd() < 0.015 && this.blocks.length < this.cfg.maxBlocks) {
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
    for (const [row, data] of this.glitchRows) {
      data.ttl -= 1;
      if (data.ttl <= 0) this.glitchRows.delete(row);
    }

    if (this.frame >= this.nextGlitchAt) {
      const type = Math.floor(rnd() * 3);
      if (type === 0) {
        const r = Math.floor(rnd() * this.rows);
        this.glitchRows.set(r, {
          offset: (rnd() < 0.5 ? 1 : -1) * (20 + Math.floor(rnd() * 80)),
          ttl: 4 + Math.floor(rnd() * 8),
        });
      } else if (type === 1) {
        const r0 = Math.floor(rnd() * this.rows);
        const rh = 1 + Math.floor(rnd() * 3);
        for (let r = r0; r < Math.min(this.rows, r0 + rh); r++) {
          for (let c = 0; c < this.cols; c++) {
            const idx = r * this.cols + c;
            this.grid[idx] =
              this.allChars[Math.floor(rnd() * this.allChars.length)];
          }
        }
      } else {
        if (this.blocks.length < this.cfg.maxBlocks + 3) {
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
      const [lo, hi] = this.cfg.glitchInterval;
      this.nextGlitchAt = this.frame + lo + Math.floor(rnd() * (hi - lo));
    }
  }

  private render(): void {
    const {
      fg,
      fgDim,
      bg,
      blockColor,
      cell,
      font,
      blockAlpha,
      sparkColor = "#ffffff",
    } = this.cfg;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    for (const b of this.blocks) {
      const fade = Math.min(1, b.ttl * 6, (b.maxTtl - b.ttl + 0.001) * 6);
      ctx.globalAlpha = Math.min(blockAlpha, fade);
      ctx.fillStyle = blockColor;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;

    ctx.font = font;
    ctx.textBaseline = "top";

    for (let r = 0; r < this.rows; r++) {
      const disp = this.glitchRows.get(r);
      const xOffset = disp ? disp.offset : 0;

      for (let c = 0; c < this.cols; c++) {
        const char = this.grid[r * this.cols + c];
        if (!char) continue;
        const density = this.density[r * this.cols + c];
        ctx.fillStyle = density > 0.55 ? fg : fgDim;
        ctx.fillText(char, c * cell + xOffset, r * cell);
      }
    }

    if (this.frame % 4 < 2) {
      ctx.fillStyle = sparkColor;
      for (let i = 0; i < 30; i++) {
        ctx.fillRect(
          Math.floor(rnd() * this.w),
          Math.floor(rnd() * this.h),
          2,
          2,
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.texture.source as any).update();
  }
}
