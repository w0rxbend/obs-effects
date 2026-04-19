import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const W         = 800;
const H         = 800;
const CX        = W / 2;
const CY        = H / 2;
const N_CIRCLES = 10;
const N_POINTS  = 160;
const TAU       = Math.PI * 2;

// Rest radii: 240, 260, ... 420 — 20px apart
const REST_R = Array.from({ length: N_CIRCLES }, (_, i) => 240 + i * 20);

const COLORS = [
  0xcba6f7, 0xf38ba8, 0xf2cdcd, 0xfab387, 0xf9e2af,
  0xa6e3a1, 0x94e2d5, 0x74c7ec, 0x89b4fa, 0xb4befe,
];

// Line width: 4.5 (inner) → 1.6 (outer), linear
const WIDTHS = Array.from({ length: N_CIRCLES }, (_, i) =>
  4.5 - i * (4.5 - 1.6) / (N_CIRCLES - 1),
);

// Alpha: 0.88 → 0.75, linear
const ALPHAS = Array.from({ length: N_CIRCLES }, (_, i) =>
  0.88 - i * 0.013,
);

// Physics: outer circles softer (lower stiffness, lower damping)
const STIFFNESS = Array.from({ length: N_CIRCLES }, (_, i) =>
  0.060 - i * 0.0027,  // 0.060 → 0.036
);
const DAMPING = Array.from({ length: N_CIRCLES }, (_, i) =>
  0.940 - i * 0.0044,  // 0.940 → 0.900
);
const TENSION   = 0.12;
const INTER_C   = 0.025;
const MAX_DISP  = 12;   // px — rings are 20px apart, keeps them from crossing
const MAX_VEL   = 2.5;  // px/frame — hard brake on runaway energy

// Traveling wave per circle
const WAVE_AMP   = Array.from({ length: N_CIRCLES }, (_, i) => 3.0 + i * 0.44); // 3 → ~7
const WAVE_SPEED = [-0.0010, 0.0008, -0.0012, 0.0009, -0.0007, 0.0011, -0.0009, 0.0010, -0.0006, 0.0008];
const WAVE_K     = [2, 3, 2, 4, 3, 2, 3, 4, 2, 3]; // wavelength count per ring

export class ElasticRingsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly g = new Graphics();

  private disp:      Float32Array[] = [];
  private vel:       Float32Array[] = [];
  private wavePhase: number[]       = new Array(N_CIRCLES).fill(0);

  // Pre-allocated LUTs and point buffers to avoid per-frame allocations
  private cosLut: Float32Array  = new Float32Array(N_POINTS);
  private sinLut: Float32Array  = new Float32Array(N_POINTS);
  private ptsBuf: number[][]    = [];

  private impTimer = 0;
  private impNext  = 0;
  private ready    = false;

  constructor() {
    super();
    this.addChild(this.g);

    for (let i = 0; i < N_POINTS; i++) {
      const a        = (TAU * i) / N_POINTS;
      this.cosLut[i] = Math.cos(a);
      this.sinLut[i] = Math.sin(a);
    }
    for (let c = 0; c < N_CIRCLES; c++) {
      this.ptsBuf.push(new Array<number>(N_POINTS * 2));
    }
  }

  public async show(): Promise<void> {
    for (let c = 0; c < N_CIRCLES; c++) {
      this.disp.push(new Float32Array(N_POINTS));
      this.vel.push(new Float32Array(N_POINTS));
      this.wavePhase[c] = Math.random() * TAU;
    }
    this.scheduleNextImpulse();
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;

    // Clamp dt to avoid instability during tab-switch/lag spikes
    const dtNorm = Math.min(time.deltaMS, 33) / 16.667;

    for (let c = 0; c < N_CIRCLES; c++) {
      this.wavePhase[c] += WAVE_SPEED[c] * time.deltaMS;
    }

    this.impTimer += time.deltaMS;
    if (this.impTimer >= this.impNext) {
      this.impTimer = 0;
      this.injectImpulse();
      this.scheduleNextImpulse();
    }

    this.stepPhysics(dtNorm);
    this.draw();
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width  - W) / 2);
    this.y = Math.round((height - H) / 2);
  }

  // ── Physics ───────────────────────────────────────────────────────────────

  private scheduleNextImpulse(): void {
    this.impNext = 50 + Math.random() * 180;
  }

  private injectImpulse(): void {
    const c      = Math.floor(Math.random() * N_CIRCLES);
    const center = Math.floor(Math.random() * N_POINTS);
    const mag    = (0.8 + Math.random() * 1.7) * (Math.random() < 0.5 ? 1 : -1);
    const spread = 3 + Math.floor(Math.random() * 5);
    const v      = this.vel[c];
    for (let d = -spread; d <= spread; d++) {
      const idx  = (center + d + N_POINTS) % N_POINTS;
      const w    = Math.exp((-d * d) / (spread * 0.6));
      v[idx]    += mag * w;
    }
  }

  private stepPhysics(dtNorm: number): void {
    const { disp, vel } = this;

    for (let c = 0; c < N_CIRCLES; c++) {
      const d     = disp[c];
      const v     = vel[c];
      const dmpF  = Math.pow(DAMPING[c], dtNorm);  // frame-rate independent damping
      const kAcc  = STIFFNESS[c] * dtNorm;
      const tAcc  = TENSION * dtNorm;
      const iAcc  = INTER_C * dtNorm;
      const dPrev = c > 0             ? disp[c - 1] : null;
      const dNext = c < N_CIRCLES - 1 ? disp[c + 1] : null;

      for (let i = 0; i < N_POINTS; i++) {
        const iPrev = i === 0             ? N_POINTS - 1 : i - 1;
        const iNext = i === N_POINTS - 1  ? 0             : i + 1;

        // Spring toward rest + membrane tension + inter-circle coupling
        let acc = -kAcc * d[i]
                + tAcc * ((d[iPrev] + d[iNext]) * 0.5 - d[i]);

        // Inner circle displacing outward nudges this one outward
        if (dPrev) acc += iAcc * dPrev[i];
        // Outer circle displacing outward nudges this one inward
        if (dNext) acc -= iAcc * dNext[i];

        v[i] = Math.max(-MAX_VEL, Math.min(MAX_VEL, v[i] * dmpF + acc));
        d[i] = Math.max(-MAX_DISP, Math.min(MAX_DISP, d[i] + v[i] * dtNorm));
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const { g, cosLut, sinLut } = this;

    g.clear();

    for (let c = 0; c < N_CIRCLES; c++) {
      const restR = REST_R[c];
      const d     = this.disp[c];
      const wp    = this.wavePhase[c];
      const wAmp  = WAVE_AMP[c];
      const wK    = WAVE_K[c];
      const pts   = this.ptsBuf[c];
      const kFac  = wK * TAU / N_POINTS;

      for (let i = 0; i < N_POINTS; i++) {
        const r        = restR + d[i] + wAmp * Math.sin(kFac * i + wp);
        pts[i * 2]     = CX + cosLut[i] * r;
        pts[i * 2 + 1] = CY + sinLut[i] * r;
      }

      g.poly(pts, true).stroke({
        color: COLORS[c],
        width: WIDTHS[c],
        alpha: ALPHAS[c],
      });
    }
  }
}
