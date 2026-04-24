import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b; // Crust
const BASE_HEX = 0x11111b; // Crust
const BORDER_C = 0x313244; // Surface0 — faint grid lines

// Pale & darkish Catppuccin — cool tones only, no vivid warm colours
const PALETTE = [
  0x585b70, // Surface2 — dark blue-gray
  0x7f849c, // Overlay1 — muted slate
  0x9399b2, // Overlay2 — dim lavender-gray
  0xa6adc8, // Subtext0 — pale muted lavender
  0xbac2de, // Subtext1 — pale blue-white
  0x89b4fa, // Blue     — coolest accent
  0x74c7ec, // Sapphire — cool blue
  0x89dceb, // Sky      — pale cyan
  0x94e2d5, // Teal     — muted
  0xa6e3a1, // Green    — muted
  0xb4befe, // Lavender — pale purple
] as const;

const HEX_S = 36;
const WAVE_SPEED = 300; // px / s
const WAVELENGTH = 115;
const WAVE_DECAY = 0.62;
const MAX_RIPPLE_AGE = 5.5;
const MAX_RIPPLES = 12;
const AMBIENT = 0.02; // very quiet ambient shimmer

const SINGLE_MIN = 1.5; // s — min gap between individual spawns
const SINGLE_MAX = 3.2; // s — max gap
const BURST_MIN = 7.0; // s — min gap between bursts
const BURST_MAX = 13.0;

const TAU = Math.PI * 2;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff,
    g1 = (c1 >> 8) & 0xff,
    b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff,
    g2 = (c2 >> 8) & 0xff,
    b2 = c2 & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8) |
    Math.round(b1 + (b2 - b1) * t)
  );
}

interface Ripple {
  x: number;
  y: number;
  age: number;
}
interface Hex {
  cx: number;
  cy: number;
  pts: number[];
  accent: number;
}
interface PendingRipple {
  x: number;
  y: number;
  spawnAt: number;
}

export class HexRippleScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private hexes: Hex[] = [];
  private ripples: Ripple[] = [];
  private pending: PendingRipple[] = [];

  private singleTimer = rand(0, SINGLE_MIN);
  private singleNext = rand(SINGLE_MIN, SINGLE_MAX);
  private burstTimer = rand(0, BURST_MIN * 0.5);
  private burstNext = rand(BURST_MIN, BURST_MAX);

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.buildGrid();
    // Seed two early ripples so the screen isn't empty at start
    this.queueSingle(0.3);
    this.queueSingle(0.9);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.buildGrid();
  }

  // ── Grid ────────────────────────────────────────────────────────────────────

  private buildGrid(): void {
    const S = HEX_S;
    const dx = Math.sqrt(3) * S;
    const dy = 1.5 * S;
    const ox = dx * 0.5;

    const cols = Math.ceil(this.w / dx) + 3;
    const rows = Math.ceil(this.h / dy) + 3;

    this.hexes = [];
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * dx + (row % 2 !== 0 ? ox : 0);
        const cy = row * dy;
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (Math.PI / 3) * i;
          pts.push(cx + S * Math.cos(a), cy + S * Math.sin(a));
        }
        const accent = PALETTE[Math.abs(col * 3 + row * 7) % PALETTE.length];
        this.hexes.push({ cx, cy, pts, accent });
      }
    }
  }

  // ── Spawn strategies ────────────────────────────────────────────────────────

  private spawnRipple(x: number, y: number): void {
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x, y, age: 0 });
  }

  /** Queue a single ripple using one of several placement strategies. */
  private queueSingle(delay = 0): void {
    const roll = Math.random();
    let x: number, y: number;

    if (roll < 0.5) {
      // Random interior
      x = rand(this.w * 0.08, this.w * 0.92);
      y = rand(this.h * 0.08, this.h * 0.92);
    } else if (roll < 0.75) {
      // Near centre — creates prominent centred waves
      const a = rand(0, TAU);
      const r = rand(this.w * 0.04, this.w * 0.22);
      x = this.w / 2 + Math.cos(a) * r;
      y = this.h / 2 + Math.sin(a) * r;
    } else {
      // Edge spawn — wave sweeps across the whole grid
      const edge = Math.floor(rand(0, 4));
      x =
        edge === 0
          ? rand(-30, 10)
          : edge === 1
            ? rand(this.w - 10, this.w + 30)
            : rand(0, this.w);
      y =
        edge === 2
          ? rand(-30, 10)
          : edge === 3
            ? rand(this.h - 10, this.h + 30)
            : rand(0, this.h);
    }

    this.pending.push({ x, y, spawnAt: this.time + delay });
  }

  /** Queue a burst: 3–5 close ripples staggered 150–350 ms apart. */
  private queueBurst(): void {
    const cx = rand(this.w * 0.2, this.w * 0.8);
    const cy = rand(this.h * 0.2, this.h * 0.8);
    const count = 3 + Math.floor(rand(0, 3));
    const spread = rand(50, 140);
    for (let i = 0; i < count; i++) {
      this.pending.push({
        x: cx + rand(-spread, spread),
        y: cy + rand(-spread, spread),
        spawnAt: this.time + i * rand(0.12, 0.32),
      });
    }
  }

  // ── Wave physics ────────────────────────────────────────────────────────────

  private rippleAmp(r: Ripple, hx: number, hy: number): number {
    const dist = Math.sqrt((hx - r.x) ** 2 + (hy - r.y) ** 2);
    const front = r.age * WAVE_SPEED;
    const delta = dist - front;
    if (delta > WAVELENGTH * 0.5 || delta < -WAVELENGTH * 2.0) return 0;
    return Math.sin(delta * (TAU / WAVELENGTH)) * Math.exp(-r.age * WAVE_DECAY);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    // Flush pending queue
    this.pending = this.pending.filter((p) => {
      if (this.time >= p.spawnAt) {
        this.spawnRipple(p.x, p.y);
        return false;
      }
      return true;
    });

    // Single-ripple timer
    this.singleTimer += dt;
    if (this.singleTimer >= this.singleNext) {
      this.singleTimer = 0;
      this.singleNext = rand(SINGLE_MIN, SINGLE_MAX);
      this.queueSingle();
    }

    // Burst timer
    this.burstTimer += dt;
    if (this.burstTimer >= this.burstNext) {
      this.burstTimer = 0;
      this.burstNext = rand(BURST_MIN, BURST_MAX);
      this.queueBurst();
    }

    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < MAX_RIPPLE_AGE);

    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    for (const hex of this.hexes) {
      let amp =
        AMBIENT *
        Math.sin(this.time * 0.55 + hex.cx * 0.009 + hex.cy * 0.006) *
        Math.sin(this.time * 0.38 + hex.cx * 0.014 - hex.cy * 0.01);

      for (const r of this.ripples) amp += this.rippleAmp(r, hex.cx, hex.cy);

      // Map amp (roughly -1 to 1) to a ripple intensity [0, 1]
      // Using absolute value allows both peaks and troughs of the wave to illuminate the edge
      const t = Math.max(0, Math.min(1, Math.abs(amp) * 1.5));

      // Hexagon body is always Crust
      g.poly(hex.pts).fill({ color: BASE_HEX });

      // Ripple effect applied ONLY to the edges
      const edgeColor = lerpColor(BORDER_C, hex.accent, t);
      const edgeAlpha = 0.35 + t * 0.55; // Increase opacity during ripple
      const edgeWidth = 0.6 + t * 1.2; // Increase thickness during ripple

      g.poly(hex.pts).stroke({
        width: edgeWidth,
        color: edgeColor,
        alpha: edgeAlpha,
      });
    }
  }
}
