import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerpColor(a: number, b: number, t: number): number {
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

// Color ramp: white-hot core → yellow → orange → red → dark red at age 1
const FIRE_RAMP: [number, number][] = [
  [0.0, 0xffffff],
  [0.12, 0xfff5a8],
  [0.28, 0xffcc00],
  [0.46, 0xff7700],
  [0.63, 0xff2200],
  [0.82, 0xaa0000],
  [1.0, 0x1a0000],
];

function fireColor(age: number): number {
  age = clamp(age, 0, 1);
  for (let i = 1; i < FIRE_RAMP.length; i++) {
    if (age <= FIRE_RAMP[i][0]) {
      const lo = FIRE_RAMP[i - 1],
        hi = FIRE_RAMP[i];
      return lerpColor(lo[1], hi[1], (age - lo[0]) / (hi[0] - lo[0]));
    }
  }
  return FIRE_RAMP[FIRE_RAMP.length - 1][1];
}

function fireAlpha(age: number, type: ParticleType): number {
  const fadeIn = type === "spark" ? 0.02 : 0.04;
  if (age < fadeIn) return age / fadeIn;
  const fadeAt = type === "core" ? 0.65 : type === "flame" ? 0.55 : 0.45;
  if (age > fadeAt) {
    const t = (age - fadeAt) / (1 - fadeAt);
    return Math.pow(1 - t, 2);
  }
  return 1;
}

type ParticleType = "core" | "flame" | "ember" | "spark";

interface FireParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  invLife: number;
  size: number;
  type: ParticleType;
  phase: number;
  turbFreq: number;
  turbAmp: number;
}

const MAX_PARTICLES = 1300;

export class FireballScreen extends Container {
  public static assetBundles: string[] = [];

  // Embers rendered with normal blend; flame/sparks rendered additive for glow
  private readonly gfxEmber = new Graphics();
  private readonly gfxFlame = new Graphics();
  private readonly gfxSpark = new Graphics();

  private cx = 960;
  private cy = 540;
  private time = 0;

  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private bass = 0;
  private mid = 0;
  private high = 0;

  private particles: FireParticle[] = [];
  private emitAccum = 0;

  constructor() {
    super();
    this.gfxFlame.blendMode = "add";
    this.gfxSpark.blendMode = "add";
    this.addChild(this.gfxEmber);
    this.addChild(this.gfxFlame);
    this.addChild(this.gfxSpark);
    void this.initAudio();
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
      this.freqData = new Uint8Array(
        this.analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
    } catch {
      // no mic — fire still animates from idle breath
    }
  }

  private readBands(): { bass: number; mid: number; high: number } {
    if (!this.analyser || !this.freqData) return { bass: 0, mid: 0, high: 0 };
    this.analyser.getByteFrequencyData(this.freqData);
    // fftSize=1024 → binCount=512, bin ≈ 43 Hz @ 44100 Hz
    let bass = 0;
    for (let i = 0; i <= 6; i++) bass += this.freqData[i];
    bass /= 7 * 255;
    let mid = 0;
    for (let i = 7; i <= 92; i++) mid += this.freqData[i];
    mid /= 86 * 255;
    let high = 0;
    for (let i = 93; i <= 324; i++) high += this.freqData[i];
    high /= 232 * 255;
    return { bass, mid, high };
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(w: number, h: number): void {
    this.cx = w / 2;
    this.cy = h / 2;
  }

  private spawnParticle(
    type: ParticleType,
    intensity: number,
    ox: number,
    oy: number,
  ): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const spread = 38 + intensity * 52;
    let x: number,
      y: number,
      vx: number,
      vy: number,
      life: number,
      size: number;

    if (type === "core") {
      x = ox + (Math.random() - 0.5) * spread * 0.3;
      y = oy + (Math.random() - 0.5) * spread * 0.15;
      vx = (Math.random() - 0.5) * 18;
      vy = -(130 + Math.random() * 160 + intensity * 300);
      life = 0.45 + Math.random() * 0.35;
      size = 11 + Math.random() * 13 + intensity * 20;
    } else if (type === "flame") {
      const ang = (Math.random() - 0.5) * 0.65;
      const spd = 110 + Math.random() * 150 + intensity * 220;
      x = ox + (Math.random() - 0.5) * spread;
      y = oy + (Math.random() - 0.5) * spread * 0.22;
      vx = Math.sin(ang) * spd * 0.4 + (Math.random() - 0.5) * 25;
      vy = -(Math.cos(ang) * spd);
      life = 0.75 + Math.random() * 0.95;
      size = 6 + Math.random() * 11 + intensity * 10;
    } else if (type === "ember") {
      const ang = (Math.random() - 0.5) * 1.4;
      const spd = 38 + Math.random() * 75 + intensity * 115;
      x = ox + (Math.random() - 0.5) * spread * 1.15;
      y = oy - Math.random() * spread * 0.35;
      vx = Math.sin(ang) * spd + (Math.random() - 0.5) * 38;
      vy = -(Math.cos(ang) * spd * 0.7);
      life = 0.9 + Math.random() * 1.1;
      size = 1.5 + Math.random() * 3.5;
    } else {
      // spark
      const ang = (Math.random() - 0.5) * Math.PI;
      const spd = 100 + Math.random() * 200 + intensity * 300;
      x = ox + (Math.random() - 0.5) * spread * 0.65;
      y = oy - Math.random() * 18;
      vx = Math.sin(ang) * spd;
      vy = -(Math.abs(Math.cos(ang)) * spd * 0.85);
      life = 0.22 + Math.random() * 0.38;
      size = 1 + Math.random() * 2;
    }

    this.particles.push({
      x,
      y,
      vx,
      vy,
      age: 0,
      invLife: 1 / life,
      size,
      type,
      phase: Math.random() * Math.PI * 2,
      turbFreq: 1.3 + Math.random() * 2.4,
      turbAmp: 12 + Math.random() * 28,
    });
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;

    const raw = this.readBands();
    const br = clamp((raw.bass - 0.01) / 0.99, 0, 1);
    const mr = clamp(raw.mid * 3.5, 0, 1);
    const hr = clamp(raw.high * 5.5, 0, 1);

    this.bass += (br - this.bass) * (br > this.bass ? 0.75 : 0.05);
    this.mid += (mr - this.mid) * (mr > this.mid ? 0.55 : 0.08);
    this.high += (hr - this.high) * (hr > this.high ? 0.85 : 0.14);

    // Slow breath keeps fire alive even without audio
    const breath = 0.28 + 0.09 * Math.sin(this.time * 1.85);
    const intensity = clamp(breath + this.bass * 0.72, 0, 1);

    // Fireball origin gently hovers
    const hoverY = this.cy + Math.sin(this.time * 1.1) * 12;
    const hoverX = this.cx + Math.sin(this.time * 0.67) * 5;

    const sparkBoost = 1 + this.high * 2.5;
    const emitRate = 175 * (0.6 + intensity * 1.4) * sparkBoost;
    this.emitAccum += emitRate * dt;
    while (this.emitAccum >= 1) {
      this.emitAccum--;
      const r = Math.random();
      if (r < 0.12) this.spawnParticle("core", intensity, hoverX, hoverY);
      else if (r < 0.62) this.spawnParticle("flame", intensity, hoverX, hoverY);
      else if (r < 0.84) this.spawnParticle("ember", intensity, hoverX, hoverY);
      else this.spawnParticle("spark", intensity, hoverX, hoverY);
    }

    const turbScale = 1 + this.mid * 1.8;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt * p.invLife;
      if (p.age >= 1) {
        this.particles.splice(i, 1);
        continue;
      }

      const turb =
        Math.sin(this.time * p.turbFreq + p.phase) * p.turbAmp * turbScale;
      const turb2 =
        Math.cos(this.time * p.turbFreq * 0.65 + p.phase + 1.3) *
        p.turbAmp *
        0.35 *
        turbScale;

      if (p.type === "ember" || p.type === "spark") {
        p.vx += turb * dt * 0.55;
        // Gravity makes embers arc and fall
        p.vy += (35 + p.age * 25) * dt;
      } else {
        p.vx += turb * dt;
        p.vy += turb2 * dt * 0.28;
        // Buoyancy peaks when particle is young/hot
        const heat = 1 - p.age;
        p.vy -= heat * 28 * dt;
      }

      const dragBase =
        p.type === "core" ? 0.986 : p.type === "flame" ? 0.989 : 0.985;
      const drag = Math.pow(dragBase, dt * 60);
      p.vx *= drag;
      p.vy *= drag;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    this.draw(intensity, hoverX, hoverY);
  }

  private draw(intensity: number, ox: number, oy: number): void {
    const ge = this.gfxEmber;
    const gf = this.gfxFlame;
    const gs = this.gfxSpark;

    ge.clear();
    gf.clear();
    gs.clear();

    // Ambient halo
    const hr = 50 + intensity * 80;
    gf.circle(ox, oy, hr * 2.8).fill({
      color: 0xff1100,
      alpha: 0.025 + this.bass * 0.04,
    });
    gf.circle(ox, oy, hr * 1.7).fill({
      color: 0xff4400,
      alpha: 0.045 + this.bass * 0.07,
    });
    gf.circle(ox, oy, hr).fill({
      color: 0xffaa00,
      alpha: 0.035 + this.bass * 0.05,
    });

    for (const p of this.particles) {
      const sizeDecay =
        p.type === "core" ? 0.28 : p.type === "flame" ? 0.6 : 0.78;
      const r = p.size * (1 - p.age * sizeDecay);
      if (r < 0.35) continue;
      const col = fireColor(p.age);
      const a = fireAlpha(p.age, p.type);
      if (a < 0.01) continue;

      if (p.type === "spark") {
        gs.circle(p.x, p.y, r * 2.8).fill({ color: 0xffee88, alpha: a * 0.16 });
        gs.circle(p.x, p.y, r).fill({ color: 0xffffff, alpha: a * 0.88 });
      } else if (p.type === "ember") {
        ge.circle(p.x, p.y, r * 2.2).fill({ color: col, alpha: a * 0.22 });
        ge.circle(p.x, p.y, r).fill({ color: col, alpha: a });
      } else {
        // Layered glow: wide soft halo → medium body → sharp core
        gf.circle(p.x, p.y, r * 4.5).fill({ color: col, alpha: a * 0.035 });
        gf.circle(p.x, p.y, r * 2.0).fill({ color: col, alpha: a * 0.18 });
        gf.circle(p.x, p.y, r).fill({ color: col, alpha: a * 0.68 });
        if (p.type === "core" && p.age < 0.22) {
          gf.circle(p.x, p.y, r * 0.42).fill({
            color: 0xffffff,
            alpha: a * 0.92,
          });
        }
      }
    }

    // Central fireball orb — pulses with bass
    const pulse = 0.88 + 0.12 * Math.sin(this.time * 4.5 + 0.7);
    const orbR = (14 + intensity * 20) * pulse;
    gf.circle(ox, oy, orbR * 4.2).fill({
      color: 0xff1100,
      alpha: 0.04 + this.bass * 0.08,
    });
    gf.circle(ox, oy, orbR * 2.6).fill({
      color: 0xff5500,
      alpha: 0.09 + this.bass * 0.13,
    });
    gf.circle(ox, oy, orbR * 1.5).fill({
      color: 0xffaa00,
      alpha: 0.22 + this.bass * 0.26,
    });
    gf.circle(ox, oy, orbR).fill({
      color: 0xffee88,
      alpha: 0.58 + this.bass * 0.28,
    });
    gf.circle(ox, oy, orbR * 0.5).fill({
      color: 0xffffff,
      alpha: 0.9 + this.bass * 0.08,
    });
  }
}
