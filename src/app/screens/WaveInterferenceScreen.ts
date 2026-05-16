import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ─── Phosphor oscilloscope palette ───────────────────────────────────────────
const BG = 0x000c08;
const C_GRID = 0x031a0c;
const C_CREST_LO = 0x003c1e;
const C_CREST_HI = 0x33ff88;
const C_CREST_PEAK = 0xd8ffc0;
const C_TROUGH = 0x07001c;
const C_WAVEFRONT = 0x00ffdd;
const C_RESONANCE = 0xff9922;
const C_PARTICLE = 0x55ff44;

// ─── Simulation constants ─────────────────────────────────────────────────────
const WAVE_SPEED = 260; // px / s
const GRID_COLS = 80;
const GRID_ROWS = 45;
const AMP_SCALE = 2.8; // expected max |amplitude| for normalization
const RES_DECAY = 0.9975;
const RES_THRESH = 0.42;
const PARTICLE_N = 180;

// ─── Emitter table ────────────────────────────────────────────────────────────
// Frequencies in harmonic ratios: 1, 1, 2, 3/2, 2/3
const EMITTER_TABLE = [
  { fx: 0.18, fy: 0.5, freq: 1.0, amp: 1.0, color: 0x00ff88, orbit: false },
  { fx: 0.82, fy: 0.5, freq: 1.0, amp: 1.0, color: 0x00ff88, orbit: false },
  { fx: 0.5, fy: 0.15, freq: 2.0, amp: 0.75, color: 0x00aaff, orbit: false },
  { fx: 0.28, fy: 0.8, freq: 1.5, amp: 0.8, color: 0x77ff00, orbit: false },
  { fx: 0.5, fy: 0.5, freq: 0.67, amp: 0.65, color: 0xff8822, orbit: true },
] as const;

interface Emitter {
  x: number;
  y: number;
  fx: number;
  fy: number;
  freq: number;
  amp: number;
  k: number;
  omega: number;
  phase: number;
  color: number;
  orbit: boolean;
  orbitAngle: number;
}

interface WaveParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class WaveInterferenceScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfxBg = new Graphics();
  private readonly gfxField = new Graphics();
  private readonly gfxFx = new Graphics();

  private w = 1920;
  private h = 1080;
  private t = 0;
  private cw = 24;
  private ch = 24;

  private readonly ampGrid = new Float32Array(GRID_COLS * GRID_ROWS);
  private readonly resGrid = new Float32Array(GRID_COLS * GRID_ROWS);

  private readonly emitters: Emitter[] = [];
  private readonly particles: WaveParticle[] = [];

  constructor() {
    super();
    this.addChild(this.gfxBg);
    this.addChild(this.gfxField);
    this.addChild(this.gfxFx);
    this.initEmitters();
    this.initParticles();
  }

  private initEmitters(): void {
    for (const d of EMITTER_TABLE) {
      this.emitters.push({
        x: d.fx * 1920,
        y: d.fy * 1080,
        fx: d.fx,
        fy: d.fy,
        freq: d.freq,
        amp: d.amp,
        k: (2 * Math.PI * d.freq) / WAVE_SPEED,
        omega: 2 * Math.PI * d.freq,
        phase: Math.random() * Math.PI * 2,
        color: d.color,
        orbit: d.orbit,
        orbitAngle: Math.random() * Math.PI * 2,
      });
    }
  }

  private initParticles(): void {
    for (let i = 0; i < PARTICLE_N; i++) {
      this.particles.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        vx: 0,
        vy: 0,
      });
    }
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.cw = w / GRID_COLS;
    this.ch = h / GRID_ROWS;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const d = EMITTER_TABLE[i];
      if (!e.orbit) {
        e.x = d.fx * w;
        e.y = d.fy * h;
      }
    }
    this.redrawBg();
  }

  private redrawBg(): void {
    const { w, h, cw, ch } = this;
    const g = this.gfxBg;
    g.clear();
    g.rect(0, 0, w, h).fill({ color: BG });
    for (let c = 0; c <= GRID_COLS; c++) {
      g.moveTo(c * cw, 0)
        .lineTo(c * cw, h)
        .stroke({ color: C_GRID, alpha: 0.4, width: 0.5 });
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      g.moveTo(0, r * ch)
        .lineTo(w, r * ch)
        .stroke({ color: C_GRID, alpha: 0.4, width: 0.5 });
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.t += dt;
    this.stepEmitters(dt);
    this.computeAmpGrid();
    this.updateResGrid();
    this.updateParticles(dt);
    this.drawField();
    this.drawFx();
  }

  private stepEmitters(dt: number): void {
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      if (!e.orbit) continue;
      const d = EMITTER_TABLE[i];
      e.orbitAngle += 0.22 * dt;
      e.x = d.fx * this.w + Math.cos(e.orbitAngle) * 160;
      e.y = d.fy * this.h + Math.sin(e.orbitAngle) * 160;
    }
  }

  private computeAmpGrid(): void {
    const { cw, ch, t } = this;
    const amp = this.ampGrid;
    const em = this.emitters;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;

    for (let row = 0; row < rows; row++) {
      const wy = (row + 0.5) * ch;
      for (let col = 0; col < cols; col++) {
        const wx = (col + 0.5) * cw;
        let a = 0;
        for (const e of em) {
          const dx = wx - e.x;
          const dy = wy - e.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const falloff = 1.0 / (1.0 + d * 0.0018);
          a += e.amp * Math.sin(e.k * d - e.omega * t + e.phase) * falloff;
        }
        amp[row * cols + col] = a;
      }
    }
  }

  private updateResGrid(): void {
    const amp = this.ampGrid;
    const res = this.resGrid;
    const len = GRID_COLS * GRID_ROWS;
    for (let i = 0; i < len; i++) {
      res[i] = res[i] * RES_DECAY + Math.abs(amp[i]) * 0.016;
    }
  }

  private updateParticles(dt: number): void {
    const { w, h, cw, ch } = this;
    const amp = this.ampGrid;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;

    for (const p of this.particles) {
      const ci = Math.min(cols - 2, Math.max(1, (p.x / cw) | 0));
      const ri = Math.min(rows - 2, Math.max(1, (p.y / ch) | 0));

      const gx = (amp[ri * cols + ci + 1] - amp[ri * cols + ci - 1]) * 20;
      const gy = (amp[(ri + 1) * cols + ci] - amp[(ri - 1) * cols + ci]) * 20;

      p.vx = p.vx * 0.93 + gx * dt;
      p.vy = p.vy * 0.93 + gy * dt;
      p.x += p.vx * dt + (Math.random() - 0.5) * 6 * dt;
      p.y += p.vy * dt + (Math.random() - 0.5) * 6 * dt;

      if (p.x < 0) p.x += w;
      else if (p.x >= w) p.x -= w;
      if (p.y < 0) p.y += h;
      else if (p.y >= h) p.y -= h;
    }
  }

  private drawField(): void {
    const { cw, ch } = this;
    const g = this.gfxField;
    const amp = this.ampGrid;
    const res = this.resGrid;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const dotR = Math.min(cw, ch) * 0.56;
    g.clear();

    for (let row = 0; row < rows; row++) {
      const cy = (row + 0.5) * ch;
      for (let col = 0; col < cols; col++) {
        const cx = (col + 0.5) * cw;
        const a = amp[row * cols + col];
        const r = res[row * cols + col];
        const norm = Math.max(-1, Math.min(1, a / AMP_SCALE));

        if (norm > 0.04) {
          const color =
            norm < 0.6
              ? lerpColor(C_CREST_LO, C_CREST_HI, norm / 0.6)
              : lerpColor(C_CREST_HI, C_CREST_PEAK, (norm - 0.6) / 0.4);
          const alpha = 0.12 + norm * 0.82;
          const rr = dotR * (0.45 + norm * 0.55);
          g.circle(cx, cy, rr).fill({ color, alpha });
        } else if (norm < -0.08) {
          const tNeg = -norm;
          g.circle(cx, cy, dotR * 0.4).fill({
            color: C_TROUGH,
            alpha: tNeg * 0.28,
          });
        }

        if (r > RES_THRESH) {
          const ra = Math.min(0.45, (r - RES_THRESH) * 1.5);
          g.circle(cx, cy, dotR * 0.25).fill({ color: C_RESONANCE, alpha: ra });
        }
      }
    }

    // Wave-front contour lines at zero-crossings
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < cols - 1; col++) {
        const a00 = amp[row * cols + col];
        const a10 = amp[row * cols + col + 1];
        const a01 = amp[(row + 1) * cols + col];
        const x0 = col * cw;
        const y0 = row * ch;

        if (a00 > 0 !== a10 > 0) {
          const tx =
            x0 + (cw * Math.abs(a00)) / (Math.abs(a00) + Math.abs(a10));
          const str = Math.min(1, (Math.abs(a00) + Math.abs(a10)) / AMP_SCALE);
          g.moveTo(tx, y0)
            .lineTo(tx, y0 + ch)
            .stroke({ color: C_WAVEFRONT, alpha: str * 0.5, width: 1 });
        }
        if (a00 > 0 !== a01 > 0) {
          const ty =
            y0 + (ch * Math.abs(a00)) / (Math.abs(a00) + Math.abs(a01));
          const str = Math.min(1, (Math.abs(a00) + Math.abs(a01)) / AMP_SCALE);
          g.moveTo(x0, ty)
            .lineTo(x0 + cw, ty)
            .stroke({ color: C_WAVEFRONT, alpha: str * 0.5, width: 1 });
        }
      }
    }
  }

  private drawFx(): void {
    const { w, h, t } = this;
    const g = this.gfxFx;
    g.clear();

    // Emitter rings + cores
    for (const e of this.emitters) {
      const lambda = WAVE_SPEED / e.freq;
      const phaseOff = e.phase / e.k;
      const ringBase =
        (((WAVE_SPEED * t + phaseOff) % lambda) + lambda) % lambda;
      const maxR = Math.hypot(w, h) * 0.7;

      for (let r = ringBase; r < maxR; r += lambda) {
        const alpha = (1 - r / maxR) * 0.55;
        if (alpha < 0.02) break;
        g.circle(e.x, e.y, r).stroke({ color: e.color, alpha, width: 1 });
      }

      g.circle(e.x, e.y, 32).fill({ color: e.color, alpha: 0.06 });
      g.circle(e.x, e.y, 16).fill({ color: e.color, alpha: 0.15 });
      g.circle(e.x, e.y, 6).fill({ color: e.color, alpha: 0.95 });
      g.circle(e.x, e.y, 2.5).fill({ color: 0xffffff, alpha: 1 });
    }

    // Particles riding the wave gradient
    for (const p of this.particles) {
      const ci = Math.min(GRID_COLS - 1, Math.max(0, (p.x / this.cw) | 0));
      const ri = Math.min(GRID_ROWS - 1, Math.max(0, (p.y / this.ch) | 0));
      const a = this.ampGrid[ri * GRID_COLS + ci];
      const brightness = Math.max(0, a / AMP_SCALE);
      const alpha = 0.1 + brightness * 0.75;
      const pr = 1.0 + brightness * 2.2;
      g.circle(p.x, p.y, pr).fill({ color: C_PARTICLE, alpha });
    }

    this.drawFFT(g);
  }

  private drawFFT(g: Graphics): void {
    const { w, h, t } = this;
    const PW = 200;
    const PH = 110;
    const PX = w - PW - 18;
    const PY = h - PH - 18;

    g.rect(PX - 6, PY - 6, PW + 12, PH + 12)
      .fill({ color: 0x000000, alpha: 0.72 })
      .stroke({ color: C_WAVEFRONT, alpha: 0.22, width: 1 });

    g.moveTo(PX, PY + PH)
      .lineTo(PX + PW, PY + PH)
      .stroke({ color: 0x112211, alpha: 1, width: 1 });
    g.moveTo(PX, PY)
      .lineTo(PX, PY + PH)
      .stroke({ color: 0x112211, alpha: 1, width: 1 });

    const barW = 26;
    const gap = 8;
    const total = this.emitters.length * (barW + gap) - gap;
    let bx = PX + (PW - total) / 2;

    for (const e of this.emitters) {
      const pulse = Math.max(0, Math.sin(e.omega * t + e.phase));
      const barH = 8 + pulse * (PH - 18);
      const by = PY + PH - barH;

      g.rect(bx, by, barW, barH).fill({ color: e.color, alpha: 0.45 });
      g.rect(bx, by, barW, 3).fill({ color: 0xffffff, alpha: 0.85 });
      g.rect(bx + barW / 2 - 1, PY + PH + 1, 2, 4).fill({
        color: e.color,
        alpha: 0.7,
      });

      bx += barW + gap;
    }
  }
}

function lerpColor(c1: number, c2: number, t: number): number {
  const s = Math.max(0, Math.min(1, t));
  const r = Math.round(((c1 >> 16) & 0xff) * (1 - s) + ((c2 >> 16) & 0xff) * s);
  const g = Math.round(((c1 >> 8) & 0xff) * (1 - s) + ((c2 >> 8) & 0xff) * s);
  const b = Math.round((c1 & 0xff) * (1 - s) + (c2 & 0xff) * s);
  return (r << 16) | (g << 8) | b;
}
