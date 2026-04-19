import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

const ACCENT = [
  0xf5e0dc, 0xf2cdcd, 0xf5c2e7, 0xcba6f7,
  0xf38ba8, 0xfab387, 0xf9e2af, 0xa6e3a1,
  0x94e2d5, 0x89dceb, 0x74c7ec, 0x89b4fa, 0xb4befe,
] as const;

// Points sampled per curve — enough for smooth arcs at any ratio
const POINTS = 2400;

// Phase-offset echoes drawn back-to-front (oldest = index 0)
const ECHO_COUNT = 18;
const ECHO_GAP   = 0.18;   // radians between consecutive echo phases

// Phase animation speed (radians per second)
const PHASE_SPEED = 0.55;

// How long each preset holds before morphing to the next (seconds)
const HOLD_DURATION  = 9;
const MORPH_DURATION = 6;

// Frequency pairs [a, b] for x = sin(a·t + δ), y = sin(b·t)
const PRESETS: [number, number][] = [
  [3, 4],
  [1, 2],
  [2, 3],
  [3, 5],
  [4, 5],
  [1, 3],
  [5, 6],
  [2, 5],
  [3, 7],
  [1, 4],
];

export class LissajousScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time  = 0;
  private phase = 0;

  // Current and target frequency ratios (kept as floats to allow smooth morphing)
  private curA = PRESETS[0][0];
  private curB = PRESETS[0][1];
  private tgtA = PRESETS[0][0];
  private tgtB = PRESETS[0][1];

  private presetIdx  = 0;
  private stageTimer = 0;     // time within current stage
  private morphing   = false; // false = holding, true = morphing

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
  }

  public async hide(): Promise<void> { /* nothing */ }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time  += dt;
    this.phase += dt * PHASE_SPEED;
    this.stageTimer += dt;

    this.tickMorph();

    const g  = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const cx = this.w / 2;
    const cy = this.h / 2;
    const rx = this.w * 0.44;
    const ry = this.h * 0.44;
    const a  = this.curA;
    const b  = this.curB;

    // Draw echoes oldest → newest so newer ones render on top
    for (let e = 0; e < ECHO_COUNT; e++) {
      const ageFrac = e / (ECHO_COUNT - 1);         // 0=oldest, 1=newest
      const delta   = this.phase - (ECHO_COUNT - 1 - e) * ECHO_GAP;
      const alpha   = ageFrac * ageFrac;            // quadratic fade-in toward newest

      if (alpha < 0.005) continue;

      // Color: newest echo tracks the palette; older echoes lag behind
      const colorT   = (this.time * 0.08 + ageFrac * 0.3) % 1;
      const colorIdx = Math.floor(colorT * ACCENT.length) % ACCENT.length;
      const color    = ACCENT[colorIdx];

      // Build the curve as a flat xy array
      const pts = sampleCurve(a, b, delta, cx, cy, rx, ry, POINTS);

      // Glow pass (wide, low alpha)
      tracePath(g, pts);
      g.stroke({ width: 6, color, alpha: alpha * 0.06 });

      // Core pass
      tracePath(g, pts);
      g.stroke({ width: 1.2, color, alpha: alpha * 0.75 });
    }

    // Subtle vignette
    drawVignette(g, cx, cy, this.w, this.h);
  }

  // ─── Morph state machine: hold → morph → hold → … ────────────────────────

  private tickMorph(): void {
    const limit = this.morphing ? MORPH_DURATION : HOLD_DURATION;
    if (this.stageTimer < limit) {
      if (this.morphing) {
        const t  = smoothstep(this.stageTimer / MORPH_DURATION);
        this.curA = lerp(this.presetCur()[0], this.tgtA, t);
        this.curB = lerp(this.presetCur()[1], this.tgtB, t);
      }
      return;
    }

    this.stageTimer = 0;
    if (this.morphing) {
      // Morph finished — snap and hold
      this.curA = this.tgtA;
      this.curB = this.tgtB;
      this.morphing = false;
    } else {
      // Hold finished — pick next preset and start morphing
      this.presetIdx = (this.presetIdx + 1) % PRESETS.length;
      [this.tgtA, this.tgtB] = PRESETS[this.presetIdx];
      this.morphing = true;
    }
  }

  private presetCur(): [number, number] {
    // The preset we were holding before the current morph started
    const prev = (this.presetIdx - (this.morphing ? 1 : 0) + PRESETS.length) % PRESETS.length;
    return PRESETS[prev];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sampleCurve(
  a: number, b: number, delta: number,
  cx: number, cy: number, rx: number, ry: number,
  n: number,
): Float32Array {
  const pts = new Float32Array(n * 2);
  // 2π covers a full Lissajous period for coprime integer ratios;
  // for non-integer morphing phases it traces a dense quasiperiodic path.
  const tMax = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * tMax;
    pts[i * 2]     = cx + rx * Math.sin(a * t + delta);
    pts[i * 2 + 1] = cy + ry * Math.sin(b * t);
  }
  return pts;
}

function tracePath(g: Graphics, pts: Float32Array): void {
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    g.lineTo(pts[i], pts[i + 1]);
  }
}

function drawVignette(g: Graphics, cx: number, cy: number, w: number, h: number): void {
  const r = Math.hypot(cx, cy) * 1.1;
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    g.circle(cx, cy, r * (1 - t * 0.5)).fill({ color: BG, alpha: (1 - t) * 0.06 });
  }
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smoothstep(t: number): number { return t * t * (3 - 2 * t); }
