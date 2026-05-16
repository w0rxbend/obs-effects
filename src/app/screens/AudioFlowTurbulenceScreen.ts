import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ─── Palette ─────────────────────────────────────────────────────────────────
const BG = 0x020508;
const C_SLOW = 0x1e3a5f;
const C_MED = 0x0284c7;
const C_FAST = 0x38bdf8;
const C_TURB = 0x7dd3fc;
const C_ICE = 0xbae6fd;
const C_ENERGY = 0xd946ef;
const C_VORTEX = 0xfbbf24;
const C_ATTRAC = 0x34d399;
const C_CORE = 0xe0f2fe;

// ─── Sizes ────────────────────────────────────────────────────────────────────
const MAX_P = 5000;
const MAX_V = 20; // vortex pool
const MAX_A = 5; // attractor pool
const GRID_CELL = 20; // px per field grid cell
const MAX_SPEED = 260;
const DRAG_60 = 0.986;
const LIFE_RATE = 2.4;
const FIELD_SCALE = 88; // curl field → px/s
const MID_DRIFT = 60; // uniform mid-driven current px/s
const VORTEX_LIFE = 4.0;
const ATTRACTOR_R = 200; // falloff radius
const ATTRACTOR_S = 44;
const TRANSIENT_T = 0.21;
const TRANSIENT_CD = 0.32;

// Performance tiers: particle count
const TIERS = [1200, 2200, 3500, 5000] as const;
const INIT_TIER = 2;

// ─── 6-octave trig potential for curl noise ────────────────────────────────
// Each row: [fx, fy, ft,  gx, gy, gt,  amp, phase]
// Octaves 0-1: large scale → bass-modulated
// Octaves 2-3: medium       → mid-modulated
// Octaves 4-5: fine          → high-modulated
const OCT: readonly number[][] = [
  [0.0013, 0.0009, 0.19, 0.00085, 0.0014, 0.23, 1.9, 0.0],
  [0.0021, 0.0017, -0.15, 0.00195, 0.00115, 0.17, 1.3, 2.1],
  [0.0049, 0.0035, 0.32, 0.004, 0.0052, -0.28, 0.75, 1.4],
  [0.0072, 0.0062, -0.26, 0.0066, 0.0078, 0.34, 0.55, 3.7],
  [0.0142, 0.0122, 0.55, 0.013, 0.0148, -0.5, 0.32, 0.9],
  [0.0215, 0.0193, -0.68, 0.0198, 0.022, 0.64, 0.22, 4.2],
] as const;

function potential(
  x: number,
  y: number,
  t: number,
  aB: number,
  aM: number,
  aH: number,
): number {
  const am = [aB, aB, aM, aM, aH, aH];
  let v = 0;
  for (let i = 0; i < 6; i++) {
    const o = OCT[i];
    v +=
      o[6] *
      am[i] *
      Math.sin(x * o[0] + y * o[1] + t * o[2] + o[7]) *
      Math.cos(x * o[3] + y * o[4] + t * o[5]);
  }
  return v;
}

function speedColor(spd: number, en: number): number {
  if (en > 0.55) return C_ENERGY;
  const t = spd / MAX_SPEED;
  if (t < 0.14) return C_SLOW;
  if (t < 0.34) return C_MED;
  if (t < 0.6) return C_FAST;
  if (t < 0.82) return C_TURB;
  return C_ICE;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vortex {
  x: number;
  y: number;
  str: number; // peak tangential speed (px/s)
  r: number; // influence radius
  age: number;
  life: number;
  spin: number; // +1 or -1
  active: boolean;
}

interface Attractor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  str: number;
  active: boolean;
}

// ─── AudioFlowTurbulenceScreen ────────────────────────────────────────────────
export class AudioFlowTurbulenceScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  // ── Particle pools (typed arrays — no per-frame allocation) ─────────────────
  private readonly px = new Float32Array(MAX_P); // pos x
  private readonly py = new Float32Array(MAX_P); // pos y
  private readonly ppx = new Float32Array(MAX_P); // prev x (trail start)
  private readonly ppy = new Float32Array(MAX_P); // prev y
  private readonly pvx = new Float32Array(MAX_P); // vel x
  private readonly pvy = new Float32Array(MAX_P); // vel y
  private readonly plife = new Float32Array(MAX_P); // 0–1 fade
  private readonly pph = new Float32Array(MAX_P); // phase offset
  private readonly pen = new Float32Array(MAX_P); // energy envelope

  // ── Flow field grid (recomputed each frame) ──────────────────────────────────
  private fieldX = new Float32Array(1);
  private fieldY = new Float32Array(1);
  private gcols = 1;
  private grows = 1;

  // ── Object pools ─────────────────────────────────────────────────────────────
  private readonly vortices: Vortex[] = [];
  private readonly attractors: Attractor[] = [];

  // ── Audio ─────────────────────────────────────────────────────────────────────
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bass = 0;
  private mid = 0;
  private high = 0;
  private loudness = 0;
  private prevBass = 0;
  private transCD = 0;
  private midPhase = 0; // slowly rotating directional current angle

  // ── Performance tier ──────────────────────────────────────────────────────────
  private tierIdx = INIT_TIER;
  private activeCount: number = TIERS[INIT_TIER];
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private fpsSample = 60;
  private tierCD = 6;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.initPools();
    void this.initAudio();
  }

  // ── Initialisation ───────────────────────────────────────────────────────────
  private initPools(): void {
    for (let i = 0; i < MAX_P; i++) {
      this.pvx[i] = (Math.random() - 0.5) * 30;
      this.pvy[i] = (Math.random() - 0.5) * 30;
      this.pph[i] = Math.random() * Math.PI * 2;
    }
    for (let i = 0; i < MAX_V; i++) {
      this.vortices.push({
        x: 0,
        y: 0,
        str: 0,
        r: 0,
        age: 0,
        life: 0,
        spin: 1,
        active: false,
      });
    }
    for (let i = 0; i < MAX_A; i++) {
      this.attractors.push({ x: 0, y: 0, vx: 0, vy: 0, str: 0, active: false });
    }
  }

  private async initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.8;
      src.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      // Passive animation at neutral levels when no mic is available
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.resizeGrid();
    this.scatter();
    this.initAttractors();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.resizeGrid();
  }

  private resizeGrid(): void {
    this.gcols = Math.ceil(this.w / GRID_CELL) + 1;
    this.grows = Math.ceil(this.h / GRID_CELL) + 1;
    const size = this.gcols * this.grows;
    if (this.fieldX.length < size) {
      this.fieldX = new Float32Array(size);
      this.fieldY = new Float32Array(size);
    }
  }

  private scatter(): void {
    for (let i = 0; i < MAX_P; i++) {
      this.px[i] = Math.random() * this.w;
      this.py[i] = Math.random() * this.h;
      this.ppx[i] = this.px[i];
      this.ppy[i] = this.py[i];
      this.pvx[i] = 0;
      this.pvy[i] = 0;
      this.plife[i] = 0;
      this.pen[i] = 0;
    }
  }

  private initAttractors(): void {
    const { w, h } = this;
    for (let i = 0; i < MAX_A; i++) {
      const a = this.attractors[i];
      const ang = Math.random() * Math.PI * 2;
      const spd = 14 + Math.random() * 22;
      a.x = w * (0.1 + Math.random() * 0.8);
      a.y = h * (0.1 + Math.random() * 0.8);
      a.vx = Math.cos(ang) * spd;
      a.vy = Math.sin(ang) * spd;
      a.str = ATTRACTOR_S * (0.5 + Math.random() * 0.9);
      a.active = true;
    }
  }

  // ── Main update ──────────────────────────────────────────────────────────────
  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.transCD = Math.max(0, this.transCD - dt);
    this.midPhase += dt * (0.07 + this.mid * 0.22);

    this.readAudio(dt);
    this.adaptPerf(dt);
    this.updateVortices(dt);
    this.updateAttractors(dt);
    this.buildField();
    this.updateParticles(dt);
    this.draw();
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────
  private readAudio(dt: number): void {
    if (!this.analyser || !this.freqData) {
      // Passive breath so the field is never completely dead
      this.bass = 0.08 + Math.sin(this.time * 0.31) * 0.04;
      this.mid = 0.06 + Math.sin(this.time * 0.19) * 0.03;
      this.high = 0.04 + Math.sin(this.time * 0.57) * 0.02;
      this.loudness = 0.05;
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const fd = this.freqData;
    const len = fd.length;

    // Bin width ≈ 43 Hz at 44100 Hz / fftSize 1024
    // Bass  0–200 Hz   → bins  0–4
    // Mid   200–2500   → bins  5–57
    // High  2500–10000 → bins 58–231
    let b = 0;
    for (let i = 0; i < 5; i++) b += fd[i];
    const rawBass = Math.min(b / 5 / 255, 1);

    let m = 0;
    for (let i = 5; i < 58; i++) m += fd[i];
    const rawMid = Math.min(m / 53 / 255, 1);

    let hi = 0;
    for (let i = 58; i < Math.min(232, len); i++) hi += fd[i];
    const rawHigh = Math.min(hi / 174 / 255, 1);

    let ls = 0;
    for (let i = 0; i < len; i++) ls += fd[i];
    const rawLoud = Math.min(ls / len / 255, 1);

    // Fast attack, slow decay envelopes
    this.bass += (rawBass - this.bass) * (rawBass > this.bass ? 0.7 : 0.04);
    this.mid += (rawMid - this.mid) * (rawMid > this.mid ? 0.55 : 0.05);
    this.high += (rawHigh - this.high) * (rawHigh > this.high ? 0.75 : 0.06);
    this.loudness +=
      (rawLoud - this.loudness) * (rawLoud > this.loudness ? 0.5 : 0.05);

    // Bass transient → spawn vortex
    const delta = this.bass - this.prevBass;
    if (delta > TRANSIENT_T && this.transCD <= 0) {
      this.spawnVortex(false);
      this.transCD = TRANSIENT_CD;
    }
    this.prevBass = this.bass;

    // High energy → spawn small turbulence pockets
    if (this.high > 0.5 && Math.random() < this.high * 1.8 * dt) {
      this.spawnVortex(true);
    }
  }

  private spawnVortex(micro: boolean): void {
    for (const v of this.vortices) {
      if (v.active) continue;
      v.x = Math.random() * this.w;
      v.y = Math.random() * this.h;
      v.spin = Math.random() < 0.5 ? 1 : -1;
      v.age = 0;
      if (micro) {
        v.str = 45 + this.high * 85;
        v.r = 50 + Math.random() * 80;
        v.life = 0.6 + Math.random() * 0.9;
      } else {
        v.str = 90 + this.bass * 190;
        v.r = 120 + this.bass * 240;
        v.life = VORTEX_LIFE * (0.55 + Math.random() * 0.85);
      }
      v.active = true;
      return;
    }
  }

  // ── Performance adaptation ───────────────────────────────────────────────────
  private adaptPerf(dt: number): void {
    this.fpsFrames++;
    this.fpsElapsed += dt;
    if (this.fpsElapsed < 1) return;
    this.fpsSample = this.fpsFrames / this.fpsElapsed;
    this.fpsFrames = 0;
    this.fpsElapsed = 0;
    this.tierCD = Math.max(0, this.tierCD - 1);
    if (this.tierCD > 0) return;
    if (this.fpsSample < 48 && this.tierIdx > 0) {
      this.tierIdx--;
      this.tierCD = 4;
    } else if (this.fpsSample > 58 && this.tierIdx < TIERS.length - 1) {
      this.tierIdx++;
      this.tierCD = 8;
    }
    this.activeCount = TIERS[this.tierIdx];
  }

  // ── Systems ───────────────────────────────────────────────────────────────────
  private updateVortices(dt: number): void {
    for (const v of this.vortices) {
      if (!v.active) continue;
      v.age += dt;
      if (v.age >= v.life) v.active = false;
    }
  }

  private updateAttractors(dt: number): void {
    const { w, h } = this;
    for (const a of this.attractors) {
      if (!a.active) continue;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < 0 || a.x > w) {
        a.vx = -a.vx;
        a.x = Math.max(0, Math.min(w, a.x));
      }
      if (a.y < 0 || a.y > h) {
        a.vy = -a.vy;
        a.y = Math.max(0, Math.min(h, a.y));
      }
      // Occasional gentle direction nudge
      if (Math.random() < 0.004) {
        const ang = Math.atan2(a.vy, a.vx) + (Math.random() - 0.5) * 0.5;
        const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        a.vx = Math.cos(ang) * spd;
        a.vy = Math.sin(ang) * spd;
      }
    }
  }

  // ── Field grid ───────────────────────────────────────────────────────────────
  // Precomputes curl of a layered trig-potential noise field.
  // Vortex and attractor contributions are applied per-particle at update time
  // to avoid the O(cells × objects) inner loop.
  private buildField(): void {
    const { gcols, grows, time } = this;
    const EPS = 1.5;
    const loud = 1 + this.loudness * 2.0;
    const aB = (1 + this.bass * 2.8) * loud;
    const aM = (1 + this.mid * 1.8) * loud;
    const aH = (1 + this.high * 2.2) * loud;
    const midDx = Math.cos(this.midPhase) * this.mid * MID_DRIFT;
    const midDy = Math.sin(this.midPhase) * this.mid * MID_DRIFT;

    for (let row = 0; row < grows; row++) {
      for (let col = 0; col < gcols; col++) {
        const wx = col * GRID_CELL;
        const wy = row * GRID_CELL;
        const p0 = potential(wx, wy, time, aB, aM, aH);
        const pDx = potential(wx + EPS, wy, time, aB, aM, aH);
        const pDy = potential(wx, wy + EPS, time, aB, aM, aH);
        // Curl: (∂φ/∂y, -∂φ/∂x)
        const idx = row * gcols + col;
        this.fieldX[idx] = ((pDy - p0) / EPS) * FIELD_SCALE + midDx;
        this.fieldY[idx] = (-(pDx - p0) / EPS) * FIELD_SCALE + midDy;
      }
    }
  }

  // ── Particle physics ──────────────────────────────────────────────────────────
  private updateParticles(dt: number): void {
    const { w, h, gcols, grows, fieldX, fieldY, vortices, attractors } = this;
    const GC = GRID_CELL;
    const drag = Math.pow(DRAG_60, dt * 60);
    const loud = this.loudness;

    // Life ramp (full pool)
    for (let i = 0; i < MAX_P; i++) {
      this.plife[i] =
        i < this.activeCount
          ? Math.min(1, this.plife[i] + LIFE_RATE * dt)
          : Math.max(0, this.plife[i] - LIFE_RATE * dt);
    }

    for (let i = 0; i < MAX_P; i++) {
      if (this.plife[i] <= 0) continue;

      this.ppx[i] = this.px[i];
      this.ppy[i] = this.py[i];

      // Bilinear sample from precomputed grid
      const cx = this.px[i] / GC;
      const cy = this.py[i] / GC;
      const c0 = cx | 0;
      const r0 = cy | 0;
      const c1 = c0 + 1 < gcols ? c0 + 1 : c0;
      const r1 = r0 + 1 < grows ? r0 + 1 : r0;
      const tx = cx - c0;
      const ty = cy - r0;
      const itx = 1 - tx;
      const ity = 1 - ty;
      const i00 = r0 * gcols + c0;
      const i10 = r0 * gcols + c1;
      const i01 = r1 * gcols + c0;
      const i11 = r1 * gcols + c1;
      let fx =
        (fieldX[i00] * itx + fieldX[i10] * tx) * ity +
        (fieldX[i01] * itx + fieldX[i11] * tx) * ty;
      let fy =
        (fieldY[i00] * itx + fieldY[i10] * tx) * ity +
        (fieldY[i01] * itx + fieldY[i11] * tx) * ty;

      // Per-particle vortex contribution
      const pxI = this.px[i];
      const pyI = this.py[i];
      for (const v of vortices) {
        if (!v.active) continue;
        const dx = pxI - v.x;
        const dy = pyI - v.y;
        if (Math.abs(dx) > v.r || Math.abs(dy) > v.r) continue;
        const d2 = dx * dx + dy * dy;
        const r2 = v.r * v.r;
        if (d2 >= r2 || d2 < 1) continue;
        const d = Math.sqrt(d2);
        const t = v.age / v.life;
        const venv = t < 0.12 ? t / 0.12 : t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
        // Rankine vortex profile — rises to peak inside core, falls off outside
        const norm = d / v.r;
        const profile = 4 * norm * (1 - norm) * (1 - norm);
        const tang = (v.str * v.spin * venv * profile) / d;
        fx += -dy * tang;
        fy += dx * tang;
      }

      // Per-particle attractor contribution
      for (const a of attractors) {
        if (!a.active) continue;
        const dx = a.x - pxI;
        const dy = a.y - pyI;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        const pull = a.str * Math.exp(-d / ATTRACTOR_R);
        fx += (dx / d) * pull;
        fy += (dy / d) * pull;
      }

      this.pvx[i] = (this.pvx[i] + fx * dt) * drag;
      this.pvy[i] = (this.pvy[i] + fy * dt) * drag;

      const spd = Math.sqrt(
        this.pvx[i] * this.pvx[i] + this.pvy[i] * this.pvy[i],
      );
      if (spd > MAX_SPEED) {
        const s = MAX_SPEED / spd;
        this.pvx[i] *= s;
        this.pvy[i] *= s;
      }

      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;

      // Toroidal wrap
      if (this.px[i] < 0) this.px[i] += w;
      else if (this.px[i] >= w) this.px[i] -= w;
      if (this.py[i] < 0) this.py[i] += h;
      else if (this.py[i] >= h) this.py[i] -= h;

      // Energy envelope tracks loudness
      this.pen[i] += (loud * 0.75 - this.pen[i]) * 0.12;
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────
  private draw(): void {
    const { w, h } = this;
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, w, h).fill({ color: BG });

    // Attractor ambient glows
    for (const a of this.attractors) {
      if (!a.active) continue;
      const pulse = 0.8 + Math.sin(this.time * 1.3 + a.x * 0.01) * 0.2;
      g.circle(a.x, a.y, 70 * pulse).fill({ color: C_ATTRAC, alpha: 0.03 });
      g.circle(a.x, a.y, 22 * pulse).fill({ color: C_ATTRAC, alpha: 0.12 });
      g.circle(a.x, a.y, 6).fill({ color: C_ATTRAC, alpha: 0.6 });
    }

    // Vortex cores + envelope rings
    for (const v of this.vortices) {
      if (!v.active) continue;
      const t = v.age / v.life;
      const env = t < 0.15 ? t / 0.15 : 1 - t;
      const pr =
        v.r * 0.45 * (1 + 0.12 * Math.sin(this.time * 5.5 + v.x * 0.01));
      g.circle(v.x, v.y, pr).fill({ color: C_VORTEX, alpha: env * 0.04 });
      g.circle(v.x, v.y, 28 * env).fill({ color: C_VORTEX, alpha: env * 0.28 });
      g.circle(v.x, v.y, 11 * env).fill({ color: C_CORE, alpha: env * 0.72 });
    }

    // Particles — trail + core dot
    const T = this.time;
    for (let i = 0; i < MAX_P; i++) {
      const life = this.plife[i];
      if (life <= 0) continue;

      const vx = this.pvx[i];
      const vy = this.pvy[i];
      const spd = Math.sqrt(vx * vx + vy * vy);
      const en = this.pen[i];
      const sT = Math.min(spd / MAX_SPEED, 1);

      const trailA = Math.min(0.72, (0.1 + sT * 0.52 + en * 0.22) * life);
      if (trailA < 0.012) continue;

      const col = speedColor(spd, en);
      const trailW = 0.4 + sT * 1.3 + en * 0.5;

      // Trail line from previous position — skip if wrap teleport occurred
      const tdx = this.px[i] - this.ppx[i];
      const tdy = this.py[i] - this.ppy[i];
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (dist > 0.5 && dist < GRID_CELL * 3) {
        g.moveTo(this.ppx[i], this.ppy[i])
          .lineTo(this.px[i], this.py[i])
          .stroke({ color: col, alpha: trailA, width: trailW });
      }

      // Head glow (only for faster / energetic particles)
      if (sT > 0.28 || en > 0.18) {
        const glowR = 1.4 + sT * 2.8 + en * 2.0;
        g.circle(this.px[i], this.py[i], glowR * 3.5).fill({
          color: col,
          alpha: 0.022 * life,
        });
      }

      // Core dot + inner highlight
      const pulse = 0.78 + Math.sin(T * 2.0 + this.pph[i]) * 0.22;
      const coreR = (0.7 + sT * 1.5 + en * 1.1) * pulse;
      const coreA = (0.45 + sT * 0.45 + en * 0.28) * life;
      g.circle(this.px[i], this.py[i], coreR).fill({
        color: col,
        alpha: coreA,
      });
      g.circle(this.px[i], this.py[i], coreR * 0.38).fill({
        color: C_CORE,
        alpha: coreA * 0.55,
      });
    }
  }
}
