import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x03050f;

const PALETTE = [
  0x4fc3f7, // light blue
  0x81d4fa, // pale sky
  0xb39ddb, // lavender
  0xe0d7ff, // pale violet
  0xffffff, // white
  0x80cbc4, // teal
  0xce93d8, // light purple
  0x90caf9, // cornflower
  0xb2ebf2, // light cyan
  0x9fa8da, // periwinkle
] as const;

const PARTICLE_COUNT = 1200;
const BASE_SPEED = 0.22;
const BASE_DIST = 88;
const MAX_DIST = 140;
const GRID_CELL = 100;
const SPARKLE_DECAY = 3.8;
const NOISE_FLOOR = 0.03;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function bandAvg(d: Uint8Array, lo: number, hi: number): number {
  let s = 0;
  for (let i = lo; i <= hi; i++) s += d[i];
  const raw = s / ((hi - lo + 1) * 255);
  return Math.max(0, (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR));
}

interface Particle {
  x: number;
  y: number;
  z: number; // 0 = far, 1 = near
  vx: number;
  vy: number;
  color: number;
  baseSize: number;
  sparkle: number;
}

export class ParticleConstellationScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  private particles: Particle[] = [];

  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;

  // Smoothed audio state
  private fieldScale = 1;
  private speedMult = 1;
  private connDist = BASE_DIST;
  private lineVis = 0.5; // 0-1, how strongly lines show

  constructor() {
    super();
    this.addChild(this.gfx);
    void this._initAudio();
  }

  private async _initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser);
      this.analyser = analyser;
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // No mic — idle animation still plays
    }
  }

  private _readAudio(): { bass: number; mid: number; high: number } {
    if (!this.analyser || !this.freqData) return { bass: 0, mid: 0, high: 0 };
    this.analyser.getByteFrequencyData(this.freqData);
    const d = this.freqData;
    // fftSize=1024 @ ~44100 Hz → bin width ≈ 43 Hz
    // bass: 0–215 Hz → bins 0–4
    // mid:  215–2150 Hz → bins 5–49
    // high: 2150–8600 Hz → bins 50–199
    return {
      bass: bandAvg(d, 0, 4),
      mid: bandAvg(d, 5, 49),
      high: bandAvg(d, 50, 199),
    };
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this._spawn();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this._spawn();
  }

  private _spawn(): void {
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => {
      const z = Math.random();
      return {
        x: rand(0, this.w),
        y: rand(0, this.h),
        z,
        vx: rand(-1, 1) * BASE_SPEED,
        vy: rand(-1, 1) * BASE_SPEED,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        baseSize: 0.8 + z * 2.0,
        sparkle: 0,
      };
    });
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;

    const { bass, mid, high } = this._readAudio();
    // Bass → field scale: fast attack, slow release
    const tScale = 1 + bass * 0.24;
    const scaleRate = tScale > this.fieldScale ? 0.55 : 0.05;
    this.fieldScale += (tScale - this.fieldScale) * scaleRate;

    // Mid → speed multiplier
    const tSpeed = 1 + mid * 3.2;
    this.speedMult += (tSpeed - this.speedMult) * 0.1;

    // High → connection distance and line visibility
    const tDist = BASE_DIST + high * (MAX_DIST - BASE_DIST);
    this.connDist += (tDist - this.connDist) * 0.14;

    const tVis = 0.5 + high * 0.5;
    this.lineVis += (tVis - this.lineVis) * 0.18;

    this._updateParticles(dt, high);
    this._draw();
  }

  private _updateParticles(dt: number, high: number): void {
    // Quadratic so sparkles only fire on genuine high-freq content
    const sparkleProb = high * high * 0.09 * dt * 60;

    for (const p of this.particles) {
      const speed = this.speedMult * (0.38 + p.z * 0.72);
      p.x += p.vx * speed;
      p.y += p.vy * speed;

      // Edge wrap with a margin so particles don't pop
      if (p.x < -30) p.x += this.w + 60;
      else if (p.x > this.w + 30) p.x -= this.w + 60;
      if (p.y < -30) p.y += this.h + 60;
      else if (p.y > this.h + 30) p.y -= this.h + 60;

      // Sparkle lifecycle
      if (p.sparkle > 0) {
        p.sparkle = Math.max(0, p.sparkle - SPARKLE_DECAY * dt);
      } else if (Math.random() < sparkleProb) {
        p.sparkle = 0.7 + Math.random() * 0.3;
      }
    }
  }

  // Screen position with depth parallax and field scale from bass
  private _screenX(p: Particle): number {
    const cx = this.w * 0.5;
    return cx + (p.x - cx) * this.fieldScale * (0.94 + p.z * 0.12);
  }

  private _screenY(p: Particle): number {
    const cy = this.h * 0.5;
    return cy + (p.y - cy) * this.fieldScale * (0.94 + p.z * 0.12);
  }

  private _draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const dist = this.connDist;
    const dist2 = dist * dist;
    // Grid cell must be at least dist so a 1-cell-radius search covers all pairs
    const cell = Math.max(dist, GRID_CELL);

    // Pre-compute screen positions once
    const xs = new Float32Array(PARTICLE_COUNT);
    const ys = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < this.particles.length; i++) {
      xs[i] = this._screenX(this.particles[i]);
      ys[i] = this._screenY(this.particles[i]);
    }

    // Spatial grid (string keys, rebuilt every frame)
    const grid = new Map<string, number[]>();
    for (let i = 0; i < this.particles.length; i++) {
      const key = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    // Constellation lines — draw each pair once (j > i)
    const lineAlphaBase = this.lineVis;
    for (let i = 0; i < this.particles.length; i++) {
      const px = xs[i];
      const py = ys[i];
      if (px < -dist || px > this.w + dist || py < -dist || py > this.h + dist)
        continue;

      const gx = Math.floor(px / cell);
      const gy = Math.floor(py / cell);
      const p = this.particles[i];

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${gx + dx},${gy + dy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const ddx = xs[j] - px;
            const ddy = ys[j] - py;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= dist2 || d2 === 0) continue;

            const t = 1 - Math.sqrt(d2) / dist;
            const alpha = t * t * 0.58 * lineAlphaBase;
            g.moveTo(px, py)
              .lineTo(xs[j], ys[j])
              .stroke({ color: p.color, width: 0.5 + t * 0.9, alpha });
          }
        }
      }
    }

    // Particles — far (low z) drawn first so near ones render on top
    const sorted = Array.from({ length: this.particles.length }, (_, i) => i);
    sorted.sort((a, b) => this.particles[a].z - this.particles[b].z);

    for (const i of sorted) {
      const p = this.particles[i];
      const px = xs[i];
      const py = ys[i];
      if (px < -12 || px > this.w + 12 || py < -12 || py > this.h + 12)
        continue;

      const coreAlpha = 0.38 + p.z * 0.52;
      const size = p.baseSize;

      if (p.sparkle > 0) {
        const sa = p.sparkle;
        g.circle(px, py, size * 7).fill({ color: p.color, alpha: sa * 0.09 });
        g.circle(px, py, size * 3.5).fill({ color: p.color, alpha: sa * 0.3 });
        g.circle(px, py, size * 1.3).fill({
          color: 0xffffff,
          alpha: sa * 0.92,
        });
      } else {
        // Soft glow halo + crisp core
        g.circle(px, py, size * 3.8).fill({
          color: p.color,
          alpha: coreAlpha * 0.07,
        });
        g.circle(px, py, size).fill({ color: p.color, alpha: coreAlpha });
      }
    }
  }
}
