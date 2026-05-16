import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const BG = 0x050a14;
const C_TEAL = 0x94e2d5;
const C_SKY = 0x89dceb;
const C_SAPH = 0x74c7ec;
const C_BLUE = 0x89b4fa;
const C_LAVND = 0x7287fd;
const C_WHITE = 0xcdd6f4;

// Wave source tuple: [bx, by, orbitAmp, orbitSpeed, orbitPhase, freq, wavelength, amplitude, color]
// bx/by      = base position as fraction of w/h
// orbitAmp   = orbital radius as fraction of min(w,h)
// orbitSpeed = angular speed rad/s
// freq       = temporal frequency (cycles/s)
// wavelength = spatial period (px at 1920-wide)
// amplitude  = contribution weight (normalised)
// prettier-ignore
type SrcDef = readonly [number, number, number, number, number, number, number, number, number];

// prettier-ignore
const SRC_DEFS: SrcDef[] = [
  [0.50, 0.50, 0.18, 0.047, 0.00, 1.10, 220, 1.00, C_TEAL],
  [0.28, 0.38, 0.15, 0.063, 2.10, 0.90, 260, 0.90, C_SKY],
  [0.72, 0.62, 0.20, 0.038, 4.30, 1.30, 190, 0.80, C_SAPH],
  [0.22, 0.68, 0.13, 0.072, 1.50, 0.70, 300, 0.70, C_LAVND],
  [0.78, 0.32, 0.16, 0.055, 3.20, 1.50, 175, 0.60, C_BLUE],
];

// ── Grid ──────────────────────────────────────────────────────────────────────
const GRID_COLS = 60;
const GRID_ROWS = 34;

// ── Particles ─────────────────────────────────────────────────────────────────
const MAX_P = 450;
const CONN_D = 130;
const MAX_CONN_PER_P = 5;
const BASE_SPD = 55; // px/s base velocity magnitude
const W_INFL = 75; // px/s per unit wave-gradient magnitude

// ── Ripples ───────────────────────────────────────────────────────────────────
const MAX_RIPPLE = 10;
const RIPPLE_SPD = 240; // px/s expansion
const RIPPLE_ITV = 2.8; // s between spawns
const RIPPLE_FRAC = 0.6; // max radius as fraction of min(w,h)

// ── Types ─────────────────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  color: number;
}

interface Ripple {
  cx: number;
  cy: number;
  r: number;
  maxR: number;
  speed: number;
  color: number;
  active: boolean;
}

interface WaveSrc {
  bx: number;
  by: number;
  oa: number;
  os: number;
  op: number;
  freq: number;
  wl: number;
  amp: number;
  color: number;
  x: number;
  y: number;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class WaveSimulationScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx = new Graphics();
  private readonly gridGfx = new Graphics();
  private readonly connGfx = new Graphics();
  private readonly partGfx = new Graphics();
  private readonly rippleGfx = new Graphics();
  private readonly srcGfx = new Graphics();
  private readonly vigGfx = new Graphics();

  private readonly sources: WaveSrc[] = [];
  private readonly particles: Particle[] = [];
  private readonly ripples: Ripple[] = [];

  // Pre-allocated wave-field buffer — avoids GC pressure from Float32Array creation
  private readonly waveField = new Float32Array(GRID_ROWS * GRID_COLS);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private nextRipple = RIPPLE_ITV;

  constructor() {
    super();

    const gridLayer = new Container();
    gridLayer.addChild(this.gridGfx);
    // Light blur softens the dot grid into a luminous interference-pattern glow
    gridLayer.filters = [new BlurFilter({ strength: 7, quality: 2 })];

    // Vignette: blurred corner circles darken edges without touching the centre
    this.vigGfx.filters = [new BlurFilter({ strength: 55, quality: 2 })];

    this.addChild(this.bgGfx);
    this.addChild(gridLayer);
    this.addChild(this.connGfx);
    this.addChild(this.partGfx);
    this.addChild(this.rippleGfx);
    this.addChild(this.srcGfx);
    this.addChild(this.vigGfx);

    this.initSources();
    this.initParticles();
    this.initRipples();
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.drawVignette();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawVignette();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.updateSources();
    this.computeWaveField();
    this.drawBackground();
    this.drawGrid();
    this.updateParticles(dt);
    this.drawConnections();
    this.drawParticles();
    this.updateRipples(dt);
    this.drawRipples();
    this.drawSources();
  }

  // ── Initialisation ────────────────────────────────────────────────────────
  private initSources(): void {
    for (const [bx, by, oa, os, op, freq, wl, amp, color] of SRC_DEFS) {
      this.sources.push({
        bx,
        by,
        oa,
        os,
        op,
        freq,
        wl,
        amp,
        color,
        x: bx * 1920,
        y: by * 1080,
      });
    }
  }

  private initParticles(): void {
    for (let i = 0; i < MAX_P; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.4 + Math.random() * 0.6) * BASE_SPD;
      this.particles.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        phase: Math.random() * Math.PI * 2,
        color: SRC_DEFS[i % SRC_DEFS.length][8],
      });
    }
  }

  private initRipples(): void {
    for (let i = 0; i < MAX_RIPPLE; i++) {
      this.ripples.push({
        cx: 0,
        cy: 0,
        r: 0,
        maxR: 0,
        speed: RIPPLE_SPD,
        color: C_TEAL,
        active: false,
      });
    }
  }

  // ── Per-frame logic ───────────────────────────────────────────────────────
  private updateSources(): void {
    const { w, h, time } = this;
    const md = Math.min(w, h);
    for (const s of this.sources) {
      s.x = s.bx * w + Math.cos(time * s.os + s.op) * s.oa * md;
      s.y = s.by * h + Math.sin(time * s.os + s.op) * s.oa * md;
    }
  }

  // Evaluates the superposition of all wave sources on the coarse grid.
  // Using a pre-baked grid avoids per-particle sqrt calls — particles and
  // connections sample from this buffer instead.
  private computeWaveField(): void {
    const { w, h, time, sources } = this;
    const cw = w / GRID_COLS;
    const ch = h / GRID_ROWS;
    for (let row = 0; row < GRID_ROWS; row++) {
      const gy = (row + 0.5) * ch;
      for (let col = 0; col < GRID_COLS; col++) {
        const gx = (col + 0.5) * cw;
        let v = 0;
        for (const s of sources) {
          const dx = gx - s.x;
          const dy = gy - s.y;
          const r = Math.sqrt(dx * dx + dy * dy) + 1;
          // 1/r attenuation gives natural radial falloff
          v +=
            (s.amp * Math.sin((r / s.wl - s.freq * time) * Math.PI * 2)) /
            (1 + r * 0.0015);
        }
        this.waveField[row * GRID_COLS + col] = v;
      }
    }
  }

  private drawBackground(): void {
    const g = this.bgGfx;
    const { w, h, time } = this;
    g.clear().rect(0, 0, w, h).fill({ color: BG });
    const md = Math.min(w, h);
    g.circle(
      (0.5 + Math.sin(time * 0.019) * 0.12) * w,
      (0.5 + Math.cos(time * 0.014) * 0.1) * h,
      0.6 * md,
    ).fill({ color: 0x071525, alpha: 0.28 });
    g.circle(
      (0.32 + Math.cos(time * 0.023) * 0.1) * w,
      (0.62 + Math.sin(time * 0.017) * 0.08) * h,
      0.48 * md,
    ).fill({ color: 0x0a0820, alpha: 0.2 });
  }

  // Draws the interference pattern as a field of coloured dots — crests teal,
  // troughs violet, zero-crossings invisible.
  private drawGrid(): void {
    const g = this.gridGfx;
    const { w, h, waveField } = this;
    g.clear();
    const cw = w / GRID_COLS;
    const ch = h / GRID_ROWS;
    const dotR = Math.min(cw, ch) * 0.28;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const v = waveField[row * GRID_COLS + col];
        if (Math.abs(v) < 0.06) continue;
        const gx = (col + 0.5) * cw;
        const gy = (row + 0.5) * ch;
        if (v > 0) {
          g.circle(gx, gy, dotR).fill({
            color: C_TEAL,
            alpha: Math.min(v * 0.5, 0.68),
          });
        } else {
          g.circle(gx, gy, dotR * 0.75).fill({
            color: C_LAVND,
            alpha: Math.min(-v * 0.28, 0.36),
          });
        }
      }
    }
  }

  // Particles surf the wave gradient: velocity is nudged toward rising amplitude.
  // Grid bilinear sample via finite difference — no per-particle wave evaluation.
  private updateParticles(dt: number): void {
    const { w, h, waveField } = this;
    const cw = w / GRID_COLS;
    const ch = h / GRID_ROWS;

    for (const p of this.particles) {
      const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(p.x / cw)));
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(p.y / ch)));
      const col1 = Math.min(GRID_COLS - 1, col + 1);
      const row1 = Math.min(GRID_ROWS - 1, row + 1);
      const v00 = waveField[row * GRID_COLS + col];
      const v10 = waveField[row * GRID_COLS + col1];
      const v01 = waveField[row1 * GRID_COLS + col];

      // Forward-difference gradient on the grid (no extra sqrt)
      p.vx += ((v10 - v00) / cw) * W_INFL * dt;
      p.vy += ((v01 - v00) / ch) * W_INFL * dt;

      const spd2 = p.vx * p.vx + p.vy * p.vy;
      const maxSpd = BASE_SPD * 2.4;
      if (spd2 > maxSpd * maxSpd) {
        const f = maxSpd / Math.sqrt(spd2);
        p.vx *= f;
        p.vy *= f;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Toroidal wrap — avoids border forces and keeps motion cyclic
      if (p.x < 0) p.x += w;
      else if (p.x >= w) p.x -= w;
      if (p.y < 0) p.y += h;
      else if (p.y >= h) p.y -= h;
    }
  }

  // Lines between nearby particles; brightness and colour determined by wave
  // amplitude at the midpoint — connections literally pulse with the field.
  private drawConnections(): void {
    const g = this.connGfx;
    const { w, h, waveField } = this;
    g.clear();
    const cw = w / GRID_COLS;
    const ch = h / GRID_ROWS;
    const connD2 = CONN_D * CONN_D;

    for (let i = 0; i < MAX_P; i++) {
      const a = this.particles[i];
      let connCount = 0;
      for (let j = i + 1; j < MAX_P && connCount < MAX_CONN_PER_P; j++) {
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > connD2) continue;

        const d = Math.sqrt(d2);
        const t = 1 - d / CONN_D;
        const mcol = Math.min(
          GRID_COLS - 1,
          Math.max(0, Math.floor(((a.x + b.x) * 0.5) / cw)),
        );
        const mrow = Math.min(
          GRID_ROWS - 1,
          Math.max(0, Math.floor(((a.y + b.y) * 0.5) / ch)),
        );
        const wAmp = waveField[mrow * GRID_COLS + mcol];
        const wBr = 0.5 + 0.5 * Math.max(-1, Math.min(1, wAmp));
        const alpha = t * t * (0.09 + 0.2 * wBr);
        const color = wAmp >= 0 ? C_TEAL : C_LAVND;

        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ color, alpha, width: 0.5 + t });
        connCount++;
      }
    }
  }

  // Particle glow scales with local wave energy — dots brighten on wave crests.
  private drawParticles(): void {
    const g = this.partGfx;
    const { w, h, waveField, time } = this;
    g.clear();
    const cw = w / GRID_COLS;
    const ch = h / GRID_ROWS;
    const pulse = 1 + 0.12 * Math.sin(time * 1.9);

    for (const p of this.particles) {
      const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(p.x / cw)));
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(p.y / ch)));
      const wAmp = waveField[row * GRID_COLS + col];
      // Energy peaks at wave crests; personal phase prevents synchronised pulsing
      const energy =
        0.5 +
        0.5 * Math.sin(time * 2.2 + p.phase) * (0.4 + 0.6 * Math.max(0, wAmp));
      const glowR = 9 * energy * pulse;
      const coreR = 2.5 * energy;

      g.circle(p.x, p.y, glowR).fill({
        color: p.color,
        alpha: 0.04 + energy * 0.13,
      });
      g.circle(p.x, p.y, coreR).fill({
        color: p.color,
        alpha: 0.65 + energy * 0.25,
      });
      g.circle(p.x, p.y, Math.max(0.8, coreR * 0.38)).fill({
        color: C_WHITE,
        alpha: 0.22 + energy * 0.55,
      });
    }
  }

  private updateRipples(dt: number): void {
    this.nextRipple -= dt;
    if (this.nextRipple <= 0) {
      this.nextRipple = RIPPLE_ITV * (0.7 + 0.6 * Math.random());
      this.spawnRipple();
    }
    for (const r of this.ripples) {
      if (!r.active) continue;
      r.r += r.speed * dt;
      if (r.r > r.maxR) r.active = false;
    }
  }

  private spawnRipple(): void {
    const slot = this.ripples.find((r) => !r.active);
    if (!slot) return;
    // Anchor ripple to whichever source is currently emitting strongest
    const src = this.sources[Math.floor(Math.random() * this.sources.length)];
    slot.cx = src.x;
    slot.cy = src.y;
    slot.r = 0;
    slot.maxR = RIPPLE_FRAC * Math.min(this.w, this.h);
    slot.speed = RIPPLE_SPD * (0.8 + 0.4 * Math.random());
    slot.color = src.color;
    slot.active = true;
  }

  private drawRipples(): void {
    const g = this.rippleGfx;
    g.clear();
    for (const r of this.ripples) {
      if (!r.active || r.r < 1) continue;
      const tf = r.r / r.maxR;
      const fade = Math.sin(tf * Math.PI); // peaks at midlife, zero at birth+death
      g.circle(r.cx, r.cy, r.r).stroke({
        color: r.color,
        alpha: fade * 0.55,
        width: (1 - tf) * 2.5 + 0.5,
      });
      if (r.r > 40) {
        // Inner secondary ring at 68 % radius adds harmonic depth
        g.circle(r.cx, r.cy, r.r * 0.68).stroke({
          color: r.color,
          alpha: fade * 0.24,
          width: (1 - tf) * 1.5 + 0.4,
        });
      }
    }
  }

  // Small glow at each orbiting wave source — marks the emission centre.
  private drawSources(): void {
    const g = this.srcGfx;
    const { sources, time } = this;
    g.clear();
    for (const s of sources) {
      const pulse = 1 + 0.25 * Math.sin(time * s.freq * Math.PI * 2);
      const r = 16 * pulse;
      g.circle(s.x, s.y, r * 2.8).fill({ color: s.color, alpha: 0.06 });
      g.circle(s.x, s.y, r).fill({ color: s.color, alpha: 0.2 });
      g.circle(s.x, s.y, r * 0.38).fill({ color: C_WHITE, alpha: 0.6 });
    }
  }

  private drawVignette(): void {
    const g = this.vigGfx;
    const { w, h } = this;
    g.clear();
    const r = Math.min(w, h) * 0.72;
    g.circle(0, 0, r).fill({ color: 0x000000, alpha: 0.85 });
    g.circle(w, 0, r).fill({ color: 0x000000, alpha: 0.85 });
    g.circle(0, h, r).fill({ color: 0x000000, alpha: 0.85 });
    g.circle(w, h, r).fill({ color: 0x000000, alpha: 0.85 });
  }
}
