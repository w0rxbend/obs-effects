import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;
const TAU = Math.PI * 2;

const BAND_DEFS = [
  { cx: 0.12, color: 0xa6e3a1, coreW: 18, glowW: 120 }, // Green
  { cx: 0.30, color: 0x94e2d5, coreW: 22, glowW: 150 }, // Teal
  { cx: 0.52, color: 0x89dceb, coreW: 28, glowW: 190 }, // Sky   (center, widest)
  { cx: 0.72, color: 0x74c7ec, coreW: 20, glowW: 140 }, // Sapphire
  { cx: 0.88, color: 0xcba6f7, coreW: 16, glowW: 110 }, // Mauve
] as const;

const SCAN_STEP   = 4;
const STAR_COUNT  = 100;
const RISE_COUNT  = 20; // rising streamer particles per band

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

interface SineComp { freq: number; amp: number; phase: number; speed: number; }

interface Band {
  cx: number;
  color: number;
  coreW: number;
  glowW: number;
  comps: SineComp[];
  shimmer: number;
  shimmerSpd: number;
  shimmerPh: number;
  streamers: Streamer[];
}

interface Streamer {
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

interface Star { x: number; y: number; size: number; phase: number; speed: number; }

export class AuroraBorealisScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private bands: Band[] = [];
  private stars: Star[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this.init();
  }

  private init(): void {
    const W = this.w;
    this.bands = BAND_DEFS.map((def) => ({
      ...def,
      comps: [
        { freq: 0.0040, amp: W * 0.058, phase: rand(0, TAU), speed: rand(0.12, 0.35) },
        { freq: 0.0100, amp: W * 0.028, phase: rand(0, TAU), speed: rand(0.28, 0.70) },
        { freq: 0.0230, amp: W * 0.012, phase: rand(0, TAU), speed: rand(0.55, 1.20) },
      ],
      shimmer: 0.8,
      shimmerSpd: rand(0.35, 1.1),
      shimmerPh: rand(0, TAU),
      streamers: Array.from({ length: RISE_COUNT }, () => ({
        y: rand(0, this.h),
        speed: rand(40, 110),
        size: rand(1.5, 4.5),
        alpha: rand(0.3, 0.9),
      })),
    }));

    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      x: rand(0, this.w),
      y: rand(0, this.h * 0.55),
      size: rand(0.5, 1.8),
      phase: rand(0, TAU),
      speed: rand(0.6, 2.2),
    }));
  }

  private bandX(band: Band, y: number): number {
    let x = band.cx * this.w;
    for (const c of band.comps) x += c.amp * Math.sin(c.freq * y + c.phase);
    return x;
  }

  // Aurora peaks in upper 60% of screen, fades at very top and bottom.
  private envelope(yr: number): number {
    return Math.max(0, Math.sin(yr * Math.PI) * Math.pow(1 - yr, 0.35) * 1.18);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    for (const band of this.bands) {
      for (const c of band.comps) c.phase += c.speed * dt;
      band.shimmer = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * band.shimmerSpd + band.shimmerPh));
    }

    this.drawStars(g, dt);
    this.drawAurora(g);
    this.drawStreamers(g, dt);
  }

  private drawStars(g: Graphics, dt: number): void {
    for (const s of this.stars) {
      s.phase += s.speed * dt;
      const a = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase));
      g.circle(s.x, s.y, s.size).fill({ color: 0xcdd6f4, alpha: a });
    }
  }

  private drawAurora(g: Graphics): void {
    for (const band of this.bands) {
      for (let y = 0; y < this.h; y += SCAN_STEP) {
        const env = this.envelope(y / this.h) * band.shimmer;
        if (env < 0.012) continue;
        const cx = this.bandX(band, y);

        g.moveTo(cx - band.glowW, y).lineTo(cx + band.glowW, y)
          .stroke({ width: SCAN_STEP, color: band.color, alpha: env * 0.042 });

        g.moveTo(cx - band.coreW, y).lineTo(cx + band.coreW, y)
          .stroke({ width: SCAN_STEP, color: band.color, alpha: env * 0.60 });

        // Bright center thread
        g.moveTo(cx - 3, y).lineTo(cx + 3, y)
          .stroke({ width: SCAN_STEP, color: band.color, alpha: env * 0.88 });
      }
    }
  }

  private drawStreamers(g: Graphics, dt: number): void {
    for (const band of this.bands) {
      for (const s of band.streamers) {
        s.y -= s.speed * dt;
        if (s.y < -10) {
          s.y = this.h + rand(0, 40);
          s.speed = rand(40, 110);
          s.alpha = rand(0.3, 0.9);
        }
        const yr = s.y / this.h;
        const env = this.envelope(yr) * band.shimmer;
        if (env < 0.02) continue;
        const cx = this.bandX(band, s.y);
        g.circle(cx, s.y, s.size * 2.5).fill({ color: band.color, alpha: env * s.alpha * 0.14 });
        g.circle(cx, s.y, s.size).fill({ color: band.color, alpha: env * s.alpha });
      }
    }
  }
}
