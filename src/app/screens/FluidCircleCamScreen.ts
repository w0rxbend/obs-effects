import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const CATT_MAUVE = 0xcba6f7;
const CATT_BLUE = 0x89b4fa;
const CATT_TEAL = 0x94e2d5;
const CATT_SKY = 0x89dceb;
const CATT_SAPPHIRE = 0x74c7ec;
const CATT_LAVENDER = 0xb4befe;

const PALETTE = [
  CATT_MAUVE,
  CATT_BLUE,
  CATT_TEAL,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
] as const;

// ── Configuration ─────────────────────────────────────────────────────────────
const WEBCAM_R = 250;
const BUBBLE_COUNT = 15;
const POINT_COUNT = 30;

interface FluidElement {
  angle: number;
  orbitRadius: number;
  size: number;
  speed: number;
  offset: number;
  color: number;
  alpha: number;
}

export class FluidCircleCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world: Container;
  private readonly mainGfx = new Graphics();
  private readonly fluidGfx = new Graphics();

  private bubbles: FluidElement[] = [];
  private points: FluidElement[] = [];
  private time = 0;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    this.world.addChild(this.mainGfx);
    this.world.addChild(this.fluidGfx);

    this.initFluidElements();
  }

  private initFluidElements(): void {
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      this.bubbles.push({
        angle: Math.random() * Math.PI * 2,
        orbitRadius: WEBCAM_R + (Math.random() - 0.5) * 40,
        size: 5 + Math.random() * 15,
        speed: (Math.random() * 0.01 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        offset: Math.random() * 100,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        alpha: 0.3 + Math.random() * 0.4,
      });
    }

    for (let i = 0; i < POINT_COUNT; i++) {
      this.points.push({
        angle: Math.random() * Math.PI * 2,
        orbitRadius: WEBCAM_R + (Math.random() - 0.5) * 60,
        size: 1 + Math.random() * 3,
        speed: (Math.random() * 0.02 + 0.01) * (Math.random() > 0.5 ? 1 : -1),
        offset: Math.random() * 100,
        color: 0xffffff,
        alpha: 0.5 + Math.random() * 0.5,
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.02;

    this.drawMainFrame();
    this.drawFluidElements();
  }

  private drawMainFrame(): void {
    const g = this.mainGfx;
    g.clear();

    // 1. Wavy base lines (already present)
    this.drawWavyCircle(g, WEBCAM_R, 5, 6, this.time, CATT_BLUE, 0.4, 24);
    this.drawWavyCircle(
      g,
      WEBCAM_R,
      8,
      4,
      -this.time * 0.8,
      CATT_MAUVE,
      0.3,
      16,
    );

    // ─── ADDED 3 MORE LINES ───
    // Teal line with higher frequency
    this.drawWavyCircle(
      g,
      WEBCAM_R - 15,
      12,
      8,
      this.time * 1.2,
      CATT_TEAL,
      0.25,
      12,
    );
    // Sky line with large slow waves
    this.drawWavyCircle(
      g,
      WEBCAM_R + 15,
      20,
      3,
      -this.time * 0.5,
      CATT_SKY,
      0.2,
      18,
    );
    // Lavender line with subtle jitter
    this.drawWavyCircle(
      g,
      WEBCAM_R,
      3,
      15,
      this.time * 2,
      CATT_LAVENDER,
      0.35,
      10,
    );
    // ──────────────────────────

    // 2. Dotted/Dashed circle
    const dashCount = 60;
    const dashLength = 0.05;
    for (let i = 0; i < dashCount; i++) {
      const angleStart = (i / dashCount) * Math.PI * 2 + this.time * 0.1;
      const angleEnd = angleStart + dashLength;

      const x1 = Math.cos(angleStart) * (WEBCAM_R + 10);
      const y1 = Math.sin(angleStart) * (WEBCAM_R + 10);
      const x2 = Math.cos(angleEnd) * (WEBCAM_R + 10);
      const y2 = Math.sin(angleEnd) * (WEBCAM_R + 10);

      g.moveTo(x1, y1).lineTo(x2, y2).stroke({
        color: 0xffffff,
        width: 16,
        alpha: 0.6,
        cap: "round",
      });
    }

    // 3. Inner soft rim
    g.circle(0, 0, WEBCAM_R).stroke({
      color: 0xffffff,
      width: 8,
      alpha: 0.2,
    });
  }

  private drawFluidElements(): void {
    const g = this.fluidGfx;
    g.clear();

    // Update and draw bubbles
    for (const b of this.bubbles) {
      b.angle += b.speed;
      const wobble = Math.sin(this.time + b.offset) * 15;
      const r = b.orbitRadius + wobble;
      const x = Math.cos(b.angle) * r;
      const y = Math.sin(b.angle) * r;

      g.circle(x, y, b.size).fill({
        color: b.color,
        alpha: b.alpha,
      });

      // Add a small highlight to bubbles
      g.circle(x - b.size * 0.3, y - b.size * 0.3, b.size * 0.2).fill({
        color: 0xffffff,
        alpha: b.alpha * 0.5,
      });
    }

    // Update and draw points
    for (const p of this.points) {
      p.angle += p.speed;
      const wobble = Math.cos(this.time * 1.5 + p.offset) * 10;
      const r = p.orbitRadius + wobble;
      const x = Math.cos(p.angle) * r;
      const y = Math.sin(p.angle) * r;

      g.circle(x, y, p.size).fill({
        color: p.color,
        alpha: p.alpha,
      });
    }
  }

  private drawWavyCircle(
    g: Graphics,
    r: number,
    amp: number,
    freq: number,
    phase: number,
    color: number,
    alpha: number,
    weight: number,
  ): void {
    const points: { x: number; y: number }[] = [];
    const steps = 120;

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const radialOffset = Math.sin(angle * freq + phase) * amp;
      const currentR = r + radialOffset;

      points.push({
        x: Math.cos(angle) * currentR,
        y: Math.sin(angle) * currentR,
      });
    }

    g.poly(points).stroke({
      color,
      width: weight,
      alpha,
      cap: "round",
      join: "round",
    });
  }

  public resize(width: number, height: number): void {
    this.world.x = width * 0.5;
    this.world.y = height * 0.5;
  }
}
