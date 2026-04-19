import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG        = 0x11111b;
const TAU       = Math.PI * 2;
const N_SAMPLES = 256;
const N_CYCLES  = 56;      // epicycles to show (sorted by amplitude)
const T_PERIOD  = 12;      // seconds for one full shape cycle
const TRACE_LEN = 700;     // max points in trace buffer

const CIRCLE_COLOR = 0x313244; // Surface0 — dim rings
const ARM_COLOR    = 0x89b4fa; // Blue — connecting arms
const TIP_COLOR    = 0xf9e2af; // Yellow — arm tip
const TRACE_COLOR  = 0xa6e3a1; // Green — drawn path

interface Epicycle { freq: number; amp: number; phase: number; }
interface Pt { x: number; y: number; }

// ── Shape samplers ────────────────────────────────────────────────────────────

function starPath(N: number, R: number): Pt[] {
  const inner = R * 0.38;
  const verts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI / 5) - Math.PI / 2;
    const r = i % 2 === 0 ? R : inner;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return Array.from({ length: N }, (_, i) => {
    const t   = (i / N) * 10;
    const idx = Math.floor(t) % 10;
    const f   = t - Math.floor(t);
    const v0  = verts[idx], v1 = verts[(idx + 1) % 10];
    return { x: v0.x + (v1.x - v0.x) * f, y: v0.y + (v1.y - v0.y) * f };
  });
}

function heartPath(N: number, R: number): Pt[] {
  const s = R / 16;
  return Array.from({ length: N }, (_, i) => {
    const t = (i / N) * TAU;
    return {
      x:  s * 16 * Math.pow(Math.sin(t), 3),
      y: -s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    };
  });
}

function trefoilPath(N: number, R: number): Pt[] {
  const s = R / 3;
  return Array.from({ length: N }, (_, i) => {
    const t = (i / N) * TAU;
    return {
      x: s * (Math.sin(t) + 2 * Math.sin(2 * t)),
      y: s * (Math.cos(t) - 2 * Math.cos(2 * t)),
    };
  });
}

const SHAPES = [starPath, heartPath, trefoilPath];

// ── DFT (O(N²), computed once per shape) ─────────────────────────────────────

function computeDFT(pts: Pt[]): Epicycle[] {
  const N   = pts.length;
  const out: Epicycle[] = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (TAU * k * n) / N;
      re += pts[n].x * Math.cos(angle) + pts[n].y * Math.sin(angle);
      im -= pts[n].x * Math.sin(angle) - pts[n].y * Math.cos(angle);
    }
    re /= N; im /= N;
    out.push({ freq: k, amp: Math.sqrt(re * re + im * im), phase: Math.atan2(im, re) });
  }
  return out.sort((a, b) => b.amp - a.amp).slice(0, N_CYCLES);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export class FourierEpicyclesScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private shapeIdx = 0;
  private epicycles: Epicycle[] = [];
  private trace: Pt[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  private get shapeScale(): number { return Math.min(this.w, this.h) * 0.30; }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.loadShape(0);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w; this.h = h;
  }

  private loadShape(idx: number): void {
    this.shapeIdx = idx % SHAPES.length;
    this.time     = 0;
    this.trace    = [];
    const pts = SHAPES[this.shapeIdx](N_SAMPLES, this.shapeScale);
    this.epicycles = computeDFT(pts);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    // Cycle to next shape after one full period
    if (this.time >= T_PERIOD) this.loadShape(this.shapeIdx + 1);

    const progress = this.time / T_PERIOD; // 0→1 over one period
    const cx = this.w / 2, cy = this.h / 2;

    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Advance epicycles and find tip position
    let x = cx, y = cy;
    for (const ep of this.epicycles) {
      const px  = x, py = y;
      const ang = ep.freq * progress * TAU + ep.phase;
      x += ep.amp * Math.cos(ang);
      y += ep.amp * Math.sin(ang);

      // Orbit circle
      g.circle(px, py, ep.amp).stroke({ width: 0.5, color: CIRCLE_COLOR, alpha: 0.55 });
      // Arm
      g.moveTo(px, py).lineTo(x, y).stroke({ width: 1.1, color: ARM_COLOR, alpha: 0.55 });
    }

    // Tip dot
    g.circle(x, y, 4).fill({ color: TIP_COLOR, alpha: 1 });
    g.circle(x, y, 9).fill({ color: TIP_COLOR, alpha: 0.18 });

    // Record trace
    this.trace.push({ x, y });
    if (this.trace.length > TRACE_LEN) this.trace.shift();

    // Draw trace with fade
    const T = this.trace;
    for (let i = 1; i < T.length; i++) {
      const a = i / T.length;
      g.moveTo(T[i - 1].x, T[i - 1].y).lineTo(T[i].x, T[i].y)
        .stroke({ width: 2.2, color: TRACE_COLOR, alpha: a * 0.92 });
    }
  }
}
