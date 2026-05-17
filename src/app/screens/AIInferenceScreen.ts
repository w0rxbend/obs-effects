import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
// Attention cell gradient: 5 stops from near-black → bright cyan-white
const RAMP = [0x060c1a, 0x093048, 0x0c628e, 0x12b8e0, 0xcef4ff] as const;

const C_TOKEN = 0x166534; // dim scrolling token bar
const C_TOKEN_HI = 0x4ade80; // briefly-hot token bar
const C_PULSE = 0x38bdf8; // expanding ring
const C_DECO = 0x0d2540; // grid border / corner brackets

// ── Config ────────────────────────────────────────────────────────────────────
const N = 16; // attention matrix is N × N
const N_STREAMS = 7; // horizontal token streams
const N_PULSES = 3; // max concurrent pulse rings
const DT_MAX = 0.05;

// ── Helpers ───────────────────────────────────────────────────────────────────
function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

function cellColor(w: number): number {
  const n = RAMP.length - 1;
  const s = Math.max(0, Math.min(1, w)) * n;
  const lo = Math.floor(s);
  return lerpHex(RAMP[lo], RAMP[Math.min(lo + 1, n)], s - lo);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Tok {
  x: number; // normalized, scrolls left [0, 1.6]
  tw: number; // width (normalized)
  a: number; // base alpha
  hot: number; // active-pulse timer (s)
}

interface Stream {
  yn: number; // y normalized [0,1]
  spd: number; // scroll speed (normalized / s)
  toks: Tok[];
}

interface Pulse {
  x: number;
  y: number;
  r: number;
  max: number;
  spd: number;
  live: boolean;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class AIInferenceScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly decoGfx = new Graphics();
  private readonly pulseGfx = new Graphics();
  private readonly gridGfx = new Graphics();
  private readonly tokGfx = new Graphics();

  private weights!: Float32Array; // N*N attention weights
  private targets!: Float32Array; // current target pattern
  private speeds!: Float32Array; // per-cell lerp speed
  private retarget = 0;

  private streams: Stream[] = [];
  private pulses: Pulse[] = [];
  private nextPulse = 3.5;

  // Layout — updated in resize()
  private w = 1920;
  private h = 1080;
  private gx = 0;
  private gy = 0;
  private cs = 32; // cell size px
  private cp = 3; // cell gap px

  constructor() {
    super();
    this.addChild(this.decoGfx, this.pulseGfx, this.gridGfx, this.tokGfx);

    this.weights = new Float32Array(N * N).map(() => Math.random() * 0.12);
    this.targets = this.buildPattern();
    this.speeds = new Float32Array(N * N).map(() => 0.3 + Math.random() * 0.7);

    for (let i = 0; i < N_STREAMS; i++) {
      const yn = 0.06 + (i / (N_STREAMS - 1)) * 0.88;
      const s: Stream = {
        yn,
        spd: 0.018 + Math.random() * 0.032,
        toks: [],
      };
      let x = 0;
      while (x < 1.6) {
        s.toks.push({
          x,
          tw: 0.007 + Math.random() * 0.022,
          a: 0.04 + Math.random() * 0.09,
          hot: 0,
        });
        x += 0.009 + Math.random() * 0.038;
      }
      this.streams.push(s);
    }

    for (let i = 0; i < N_PULSES; i++) {
      this.pulses.push({ x: 0, y: 0, r: 0, max: 0, spd: 0, live: false });
    }
  }

  // ── Pattern generation ────────────────────────────────────────────────────
  private buildPattern(): Float32Array {
    const mode = Math.floor(Math.random() * 5);
    const fq = Math.floor(Math.random() * N);
    const fk = Math.floor(Math.random() * N);
    const hotR = Math.floor(Math.random() * N);
    const out = new Float32Array(N * N);

    for (let q = 0; q < N; q++) {
      for (let k = 0; k < N; k++) {
        let v = 0;
        switch (mode) {
          case 0: // Causal diagonal — attend to recent tokens
            v = Math.exp(-Math.abs(q - k) * 0.45) * (k <= q ? 1 : 0.15);
            break;
          case 1: // Gaussian cluster — attend to one position
            v = Math.exp(-((q - fq) ** 2 + (k - fk) ** 2) * 0.12);
            break;
          case 2: // Row-sparse — one hot query, rest dim
            v = q === hotR ? 0.5 + Math.random() * 0.5 : Math.random() * 0.1;
            break;
          case 3: // Block window — local 4-wide attention groups
            v =
              Math.floor(q / 4) === Math.floor(k / 4)
                ? 0.5 + Math.random() * 0.5
                : Math.random() * 0.07;
            break;
          case 4: // Anti-diagonal — attend to distant tokens
            v = Math.exp(-Math.abs(q + k - (N - 1)) * 0.38);
            break;
        }
        out[q * N + k] = Math.min(v + Math.random() * 0.04, 1.0);
      }
    }
    return out;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.cs = Math.max(16, Math.floor(height * 0.038));
    this.cp = Math.max(2, Math.floor(this.cs * 0.08));
    const span = N * (this.cs + this.cp);
    this.gx = Math.round((width - span) / 2);
    this.gy = Math.round((height - span) / 2);
    this.drawDeco(span);
  }

  private drawDeco(span: number): void {
    this.decoGfx.clear();
    const { gx, gy } = this;

    this.decoGfx.rect(gx - 1, gy - 1, span + 2, span + 2).stroke({
      color: C_DECO,
      width: 1,
    });

    // Corner L-brackets
    const arm = 10;
    for (const [ox, oy] of [
      [0, 0],
      [span, 0],
      [0, span],
      [span, span],
    ] as [number, number][]) {
      const cx = gx + ox,
        cy = gy + oy;
      const dx = ox ? -1 : 1,
        dy = oy ? -1 : 1;
      this.decoGfx
        .moveTo(cx + dx * arm, cy)
        .lineTo(cx, cy)
        .lineTo(cx, cy + dy * arm)
        .stroke({ color: C_DECO, width: 1.5, alpha: 0.85 });
    }
  }

  update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS / 1000, DT_MAX);
    this.stepAttention(dt);
    this.drawGrid();
    this.drawTokens(dt);
    this.drawPulses(dt);
  }

  // ── Attention ─────────────────────────────────────────────────────────────
  private stepAttention(dt: number): void {
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.targets = this.buildPattern();
      this.retarget = 4.0 + Math.random() * 5.0;
    }
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] +=
        (this.targets[i] - this.weights[i]) * dt * this.speeds[i];
    }
  }

  private drawGrid(): void {
    const { gx, gy, cs, cp } = this;
    const step = cs + cp;
    this.gridGfx.clear();
    for (let q = 0; q < N; q++) {
      for (let k = 0; k < N; k++) {
        this.gridGfx
          .rect(gx + k * step, gy + q * step, cs, cs)
          .fill({ color: cellColor(this.weights[q * N + k]), alpha: 0.88 });
      }
    }
  }

  // ── Token streams ─────────────────────────────────────────────────────────
  private drawTokens(dt: number): void {
    const { w, h } = this;
    this.tokGfx.clear();
    const th = Math.max(2, Math.round(h * 0.003));

    for (const s of this.streams) {
      const y = s.yn * h;
      for (const tok of s.toks) {
        tok.x = (((tok.x - s.spd * dt) % 1.6) + 1.6) % 1.6;
        if (tok.x > 1.05) continue;

        if (tok.hot > 0) {
          tok.hot -= dt;
        } else if (Math.random() < 0.0004) {
          tok.hot = 0.2 + Math.random() * 0.5;
        }

        const isHot = tok.hot > 0;
        this.tokGfx.rect(tok.x * w, y - th * 0.5, tok.tw * w, th).fill({
          color: isHot ? C_TOKEN_HI : C_TOKEN,
          alpha: isHot ? Math.min(tok.a * 6, 0.7) : tok.a,
        });
      }
    }
  }

  // ── Neural pulses ─────────────────────────────────────────────────────────
  private drawPulses(dt: number): void {
    const { gx, gy, cs, cp, w, h } = this;
    const step = cs + cp;

    this.nextPulse -= dt;
    if (this.nextPulse <= 0) {
      const p = this.pulses.find((p) => !p.live);
      if (p) {
        p.x = gx + Math.random() * N * step;
        p.y = gy + Math.random() * N * step;
        p.r = 0;
        p.max = Math.min(w, h) * (0.14 + Math.random() * 0.18);
        p.spd = 55 + Math.random() * 60;
        p.live = true;
      }
      this.nextPulse = 2.5 + Math.random() * 3.5;
    }

    this.pulseGfx.clear();
    for (const p of this.pulses) {
      if (!p.live) continue;
      p.r += p.spd * dt;
      if (p.r >= p.max) {
        p.live = false;
        continue;
      }
      const frac = p.r / p.max;
      const a = (1 - frac) * (1 - frac) * 0.28;
      this.pulseGfx
        .circle(p.x, p.y, p.r)
        .stroke({ color: C_PULSE, width: 1.2, alpha: a });
    }
  }
}
