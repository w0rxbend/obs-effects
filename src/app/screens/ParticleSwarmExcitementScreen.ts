import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib/obsAudio";

// ─── Constants ────────────────────────────────────────────────────────────────
const N = 700;
const GRID_CELL = 150;

const R_SEP = 30;
const R_ALI = 90;
const R_COH = 150;
const R_CONN = 58;
const R_SEP2 = R_SEP * R_SEP;
const R_ALI2 = R_ALI * R_ALI;
const R_CONN2 = R_CONN * R_CONN;

const F_SEP = 105;
const F_ALI_BASE = 22;
const F_COH_BASE = 15;
const F_JITTER = 72;

const MAX_SPEED_BASE = 100;
const MAX_SPEED_PEAK = 250;
const DRAG_60 = 0.984;

const BASS_SPIKE_THRESH = 0.06;
const SCATTER_MAG = 600;
const MAX_CONN = 5;

const C_BG = 0x05070d;
const C_CALM = 0x1e4080;
const C_CYAN = 0x00d0ff;
const C_HOT = 0xeef8ff;
const CONN_COLOR = 0x152848;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function energyColor(e: number): number {
  if (e < 0.5) return lerpHex(C_CALM, C_CYAN, e * 2);
  return lerpHex(C_CYAN, C_HOT, (e - 0.5) * 2);
}

// ─── Spatial Grid ─────────────────────────────────────────────────────────────
class Grid {
  private cols = 1;
  private rows = 1;
  private data = new Uint16Array(0);
  private cnt = new Uint16Array(0);
  private readonly CAP = 40;

  resize(w: number, h: number): void {
    this.cols = Math.ceil(w / GRID_CELL) + 1;
    this.rows = Math.ceil(h / GRID_CELL) + 1;
    const total = this.cols * this.rows;
    if (this.data.length < total * this.CAP) {
      this.data = new Uint16Array(total * this.CAP);
      this.cnt = new Uint16Array(total);
    }
  }

  clear(): void {
    this.cnt.fill(0, 0, this.cols * this.rows);
  }

  insert(idx: number, x: number, y: number): void {
    const c = Math.max(0, Math.min(this.cols - 1, (x / GRID_CELL) | 0));
    const r = Math.max(0, Math.min(this.rows - 1, (y / GRID_CELL) | 0));
    const ci = r * this.cols + c;
    const n = this.cnt[ci];
    if (n < this.CAP) {
      this.data[ci * this.CAP + n] = idx;
      this.cnt[ci]++;
    }
  }

  query(x: number, y: number, radius: number, out: Int32Array): number {
    const c0 = Math.max(0, ((x - radius) / GRID_CELL) | 0);
    const c1 = Math.min(this.cols - 1, ((x + radius) / GRID_CELL) | 0);
    const r0 = Math.max(0, ((y - radius) / GRID_CELL) | 0);
    const r1 = Math.min(this.rows - 1, ((y + radius) / GRID_CELL) | 0);
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ci = r * this.cols + c;
        const cnt = this.cnt[ci];
        const base = ci * this.CAP;
        for (let k = 0; k < cnt; k++) out[n++] = this.data[base + k];
      }
    }
    return n;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  phase: number;
  r: number;
}

// ─── ParticleSwarmExcitementScreen ────────────────────────────────────────────
export class ParticleSwarmExcitementScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private prevBass = 0;
  private intensity = 0;

  private readonly particles: Particle[] = [];
  private readonly grid = new Grid();
  private readonly nbuf = new Int32Array(256);
  private readonly connCnt = new Uint8Array(N);
  private swarmCX = 960;
  private swarmCY = 540;

  constructor() {
    super();
    this.addChild(this.gfx);
    void obsAudio.connect();
    this.initParticles();
  }

  private initParticles(): void {
    for (let i = 0; i < N; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        energy: 0,
        phase: Math.random() * Math.PI * 2,
        r: 1.6 + Math.random() * 2.0,
      });
    }
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
    this.scatter();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.swarmCX = w * 0.5;
    this.swarmCY = h * 0.5;
    this.grid.resize(w, h);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.prevBass = obsAudio.bass;
    obsAudio.update(dt);
    this.updateAudio();
    this.updatePhysics(dt);
    this.draw();
  }

  private scatter(): void {
    const { w, h } = this;
    const cx = w * 0.5,
      cy = h * 0.5;
    for (let i = 0; i < N; i++) {
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * Math.min(w, h) * 0.22;
      this.particles[i].x = cx + Math.cos(angle) * rad;
      this.particles[i].y = cy + Math.sin(angle) * rad;
    }
  }

  private updateAudio(): void {
    this.intensity =
      obsAudio.bass * 0.5 + obsAudio.mid * 0.3 + obsAudio.high * 0.2;
  }

  private updatePhysics(dt: number): void {
    const { w, h, particles } = this;
    const drag = Math.pow(DRAG_60, dt * 60);
    const bassSpike = Math.max(0, obsAudio.bass - this.prevBass);

    // Bass shrinks cohesion radius → swarm fragments into sub-flocks
    const cohRadius = R_COH * Math.max(0.38, 1 - obsAudio.bass * 0.58);
    const cohRadius2 = cohRadius * cohRadius;
    const cohStr = F_COH_BASE * (1 + obsAudio.bass * 2.2);
    const aliStr = F_ALI_BASE * (1 + obsAudio.mid * 1.8);
    const jitter = obsAudio.high * F_JITTER;
    const maxSpd =
      MAX_SPEED_BASE + this.intensity * (MAX_SPEED_PEAK - MAX_SPEED_BASE);

    this.grid.clear();
    for (let i = 0; i < N; i++) {
      this.grid.insert(i, particles[i].x, particles[i].y);
    }

    let sumX = 0,
      sumY = 0;
    for (let i = 0; i < N; i++) {
      sumX += particles[i].x;
      sumY += particles[i].y;
    }
    this.swarmCX = sumX / N;
    this.swarmCY = sumY / N;

    for (let i = 0; i < N; i++) {
      const p = particles[i];
      let fx = 0,
        fy = 0;

      const nn = this.grid.query(p.x, p.y, cohRadius, this.nbuf);

      let sepX = 0,
        sepY = 0,
        sepN = 0;
      let aliVX = 0,
        aliVY = 0,
        aliN = 0;
      let cohX = 0,
        cohY = 0,
        cohN = 0;

      for (let k = 0; k < nn; k++) {
        const j = this.nbuf[k];
        if (j === i) continue;
        const q = particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.01 || d2 >= cohRadius2) continue;

        // Cohesion: accumulate local center of mass
        cohX += q.x;
        cohY += q.y;
        cohN++;

        // Alignment: match velocity with moderate-range neighbors
        if (d2 < R_ALI2) {
          aliVX += q.vx;
          aliVY += q.vy;
          aliN++;
        }

        // Separation: push away from very close neighbors
        if (d2 < R_SEP2) {
          const d = Math.sqrt(d2);
          const s = (R_SEP - d) / R_SEP;
          sepX -= (dx / d) * s;
          sepY -= (dy / d) * s;
          sepN++;
        }
      }

      if (sepN > 0) {
        fx += (sepX / sepN) * F_SEP;
        fy += (sepY / sepN) * F_SEP;
      }
      if (aliN > 0) {
        fx += (aliVX / aliN - p.vx) * aliStr;
        fy += (aliVY / aliN - p.vy) * aliStr;
      }
      if (cohN > 0) {
        fx += (cohX / cohN - p.x) * cohStr;
        fy += (cohY / cohN - p.y) * cohStr;
      }

      // Bass spike: radial scatter impulse from swarm centroid
      if (bassSpike > BASS_SPIKE_THRESH) {
        const dx = p.x - this.swarmCX;
        const dy = p.y - this.swarmCY;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const mag = SCATTER_MAG * (bassSpike / BASS_SPIKE_THRESH);
        fx += (dx / d) * mag;
        fy += (dy / d) * mag;
      }

      // Highs: individual velocity jitter
      if (jitter > 1) {
        const angle = Math.random() * Math.PI * 2;
        fx += Math.cos(angle) * jitter;
        fy += Math.sin(angle) * jitter;
      }

      // Weak centering to prevent runaway drift; relaxes at high intensity
      const pullStr = 0.01 * (1 - this.intensity * 0.6);
      fx -= (p.x - w * 0.5) * pullStr;
      fy -= (p.y - h * 0.5) * pullStr;

      p.vx = (p.vx + fx * dt) * drag;
      p.vy = (p.vy + fy * dt) * drag;

      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > maxSpd) {
        const s = maxSpd / spd;
        p.vx *= s;
        p.vy *= s;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < 0) p.x += w;
      else if (p.x >= w) p.x -= w;
      if (p.y < 0) p.y += h;
      else if (p.y >= h) p.y -= h;

      // Energy tracks normalized speed
      const normSpd = spd / maxSpd;
      p.energy += (normSpd - p.energy) * (normSpd > p.energy ? 0.25 : 0.04);
    }
  }

  private draw(): void {
    const { w, h, particles, time } = this;
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, w, h).fill({ color: C_BG });

    // Ambient background glow at swarm centroid
    if (this.intensity > 0.04) {
      const glowR = 120 + this.intensity * 380;
      g.circle(this.swarmCX, this.swarmCY, glowR).fill({
        color: C_CALM,
        alpha: this.intensity * 0.022,
      });
    }

    // Connection web
    this.connCnt.fill(0);
    for (let i = 0; i < N; i++) {
      if (this.connCnt[i] >= MAX_CONN) continue;
      const p = particles[i];
      const nn = this.grid.query(p.x, p.y, R_CONN, this.nbuf);

      for (let k = 0; k < nn; k++) {
        const j = this.nbuf[k];
        if (j <= i) continue;
        if (this.connCnt[i] >= MAX_CONN || this.connCnt[j] >= MAX_CONN)
          continue;

        const q = particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R_CONN2) continue;

        const dist = Math.sqrt(d2);
        const tFrac = 1 - dist / R_CONN;
        const e = (p.energy + q.energy) * 0.5;
        const alpha = tFrac * tFrac * (0.09 + e * 0.28);
        if (alpha < 0.005) continue;

        const color =
          e > 0.2 ? lerpHex(CONN_COLOR, C_CYAN, e * 1.2) : CONN_COLOR;
        g.moveTo(p.x, p.y)
          .lineTo(q.x, q.y)
          .stroke({ color, alpha, width: 0.4 + e * 0.85 });

        this.connCnt[i]++;
        this.connCnt[j]++;
      }
    }

    // Particles
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const e = p.energy;
      const color = energyColor(e);
      const pulse = 0.82 + Math.sin(time * 2.2 + p.phase) * 0.18;

      // Velocity trail
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > 8) {
        const tLen = Math.min(spd * 0.065, 20);
        const tx = p.x - (p.vx / spd) * tLen;
        const ty = p.y - (p.vy / spd) * tLen;
        g.moveTo(tx, ty)
          .lineTo(p.x, p.y)
          .stroke({
            color,
            alpha: (0.07 + e * 0.2) * pulse,
            width: p.r * 0.55,
          });
      }

      // Outer glow
      const glowR = (p.r * 2.8 + e * 11) * pulse;
      g.circle(p.x, p.y, glowR).fill({
        color,
        alpha: (0.03 + e * 0.09) * pulse,
      });

      // Core
      const coreR = p.r * (1 + e * 0.7) * pulse;
      g.circle(p.x, p.y, coreR).fill({ color, alpha: 0.72 + e * 0.28 });

      // Hot center on excited particles
      if (e > 0.35) {
        g.circle(p.x, p.y, coreR * 0.38).fill({
          color: 0xffffff,
          alpha: ((e - 0.35) / 0.65) * 0.55,
        });
      }
    }

    // Bass pulse rings at swarm centroid
    if (obsAudio.bass > 0.08) {
      const r1 = 38 + obsAudio.bass * 95;
      const r2 = r1 * 1.55 + Math.sin(time * 6) * 8;
      g.circle(this.swarmCX, this.swarmCY, r1).stroke({
        color: C_CYAN,
        alpha: obsAudio.bass * 0.18,
        width: 1.5,
      });
      g.circle(this.swarmCX, this.swarmCY, r2).stroke({
        color: C_CYAN,
        alpha: obsAudio.bass * 0.08,
        width: 1.0,
      });
    }
  }
}
