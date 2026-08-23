import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib";
import { clamp, lerp, TAU } from "../../lib/math";

const RING_STEPS = 240;
const SIZE = 600;
const HOLE_R = 240;
const RING_R = 294;

// Catppuccin Mocha Teal (inactive gray-green) → toxic neon green (active)
const C_INACTIVE = { r: 0x94, g: 0xe2, b: 0xd5 };
const C_ACTIVE = { r: 0x39, g: 0xff, b: 0x14 };

function lerpC(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): number {
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return (r << 16) | (g << 8) | bl;
}

function volumeColor(vol: number): number {
  return lerpC(C_INACTIVE, C_ACTIVE, Math.max(0, Math.min(1, vol)));
}

// ── Harmonics ──────────────────────────────────────────────────────────────

interface Harmonic {
  freq: number;
  amp: number;
  speed: number;
  phase: number;
}

// Broad slow swells — give the organic liquid base shape
const SWELL_H: Harmonic[] = [
  { freq: 2, amp: 12, speed: 0.18, phase: 0.0 },
  { freq: 3, amp: 9, speed: -0.26, phase: 1.3 },
  { freq: 4, amp: 7, speed: 0.35, phase: 2.5 },
];

// Mid ripples — add liveness
const RIPPLE_H: Harmonic[] = [
  { freq: 5, amp: 5, speed: 0.55, phase: 0.8 },
  { freq: 7, amp: 3.5, speed: -0.42, phase: 2.1 },
  { freq: 9, amp: 2, speed: 0.71, phase: 3.4 },
  { freq: 11, amp: 1.5, speed: -0.63, phase: 1.0 },
];

// Hot turbulence — activates with volume
const TURB_H: Harmonic[] = [
  { freq: 13, amp: 10, speed: 1.5, phase: 0.6 },
  { freq: 17, amp: 7, speed: -1.2, phase: 2.9 },
  { freq: 6, amp: 15, speed: 0.28, phase: 1.7 },
  { freq: 19, amp: 5, speed: 1.8, phase: 0.3 },
  { freq: 8, amp: 8, speed: -0.9, phase: 3.7 },
];

// ── Ring definitions ───────────────────────────────────────────────────────

interface RingDef {
  baseR: number;
  harmonics: Harmonic[];
  ampScale: number;
  speedBias: number;
  phaseShift: number;
  glowWidth: number;
  coreWidth: number;
  colBias: number; // shift vol for color lookup (so rings have different hues)
  glowAlphaMul: number;
  coreAlphaMul: number;
}

const RINGS: RingDef[] = [
  // ── Deep outer halo ──────────────────────────────────────────────────────
  {
    baseR: RING_R + 42,
    harmonics: [...SWELL_H],
    ampScale: 0.5,
    speedBias: 0.55,
    phaseShift: 0.9,
    glowWidth: 30,
    coreWidth: 1.2,
    colBias: 0.15,
    glowAlphaMul: 0.55,
    coreAlphaMul: 0.4,
  },
  // ── Outer secondary ring ─────────────────────────────────────────────────
  {
    baseR: RING_R + 22,
    harmonics: [...SWELL_H, ...RIPPLE_H.slice(0, 2)],
    ampScale: 0.75,
    speedBias: -0.7,
    phaseShift: 0.5,
    glowWidth: 44,
    coreWidth: 1.8,
    colBias: 0.1,
    glowAlphaMul: 0.7,
    coreAlphaMul: 0.55,
  },
  // ── Main ring A — the bold one ────────────────────────────────────────────
  {
    baseR: RING_R,
    harmonics: [...SWELL_H, ...RIPPLE_H],
    ampScale: 1.0,
    speedBias: 1.0,
    phaseShift: 0.0,
    glowWidth: 90,
    coreWidth: 3.5,
    colBias: 0.0,
    glowAlphaMul: 1.0,
    coreAlphaMul: 1.0,
  },
  // ── Main ring B — counter-phase twin ─────────────────────────────────────
  {
    baseR: RING_R + 4,
    harmonics: [...SWELL_H, ...RIPPLE_H],
    ampScale: 0.9,
    speedBias: -1.0,
    phaseShift: Math.PI,
    glowWidth: 55,
    coreWidth: 2.0,
    colBias: -0.05,
    glowAlphaMul: 0.8,
    coreAlphaMul: 0.75,
  },
  // ── Inner secondary ring ─────────────────────────────────────────────────
  {
    baseR: RING_R - 18,
    harmonics: [...SWELL_H, ...RIPPLE_H.slice(2)],
    ampScale: 0.7,
    speedBias: 0.8,
    phaseShift: 1.2,
    glowWidth: 40,
    coreWidth: 1.6,
    colBias: -0.1,
    glowAlphaMul: 0.7,
    coreAlphaMul: 0.55,
  },
  // ── Deep inner ring ──────────────────────────────────────────────────────
  {
    baseR: RING_R - 38,
    harmonics: [...SWELL_H],
    ampScale: 0.5,
    speedBias: -0.5,
    phaseShift: 2.4,
    glowWidth: 22,
    coreWidth: 1.0,
    colBias: -0.2,
    glowAlphaMul: 0.5,
    coreAlphaMul: 0.35,
  },
];

// ── Particle types ─────────────────────────────────────────────────────────

interface Spark {
  angle: number;
  r: number;
  vr: number; // radial velocity (outward = positive)
  vt: number; // tangential velocity
  age: number;
  maxAge: number;
  size: number;
  alpha: number;
  type: "spark" | "splash";
}

export class HypeMeterCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly gfxGlow = new Graphics();
  private readonly gfxCore = new Graphics();
  private readonly gfxParticles = new Graphics();

  private time = 0;
  private prevVolume = 0;

  private readonly particles: Spark[] = [];

  constructor() {
    super();
    this.world.x = SIZE / 2;
    this.world.y = SIZE / 2;
    this.world.addChild(this.gfxGlow);
    this.world.addChild(this.gfxCore);
    this.world.addChild(this.gfxParticles);
    this.addChild(this.world);
    void obsAudio.connect();
  }

  public async show(): Promise<void> {}

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    this.prevVolume = obsAudio.level;
    obsAudio.update(dt);

    this.tickParticles(dt);
    this.draw();
  }

  // ── Ring geometry ──────────────────────────────────────────────────────────

  private buildRing(def: RingDef): { x: number; y: number }[] {
    const vol = obsAudio.level;
    const pts: { x: number; y: number }[] = [];

    const ampMul = def.ampScale * (1 + vol * 5.5);
    const speedMul = def.speedBias * (1 + vol * 2.2);
    const t = this.time;

    // Turbulence blends in proportionally to volume
    const allH = [
      ...def.harmonics,
      ...TURB_H.map((h) => ({ ...h, amp: h.amp * vol * def.ampScale })),
    ];

    for (let i = 0; i <= RING_STEPS; i++) {
      const a = (i / RING_STEPS) * TAU + def.phaseShift;
      let r = def.baseR;
      for (const h of allH) {
        r +=
          Math.sin(a * h.freq + t * h.speed * speedMul + h.phase) *
          h.amp *
          ampMul;
      }
      r = Math.max(r, HOLE_R + 3);
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return pts;
  }

  // ── Particles ──────────────────────────────────────────────────────────────

  private spawnSpark(_vol: number, rate: number): void {
    const a = Math.random() * TAU;
    const outward = Math.random() > 0.25;
    this.particles.push({
      angle: a,
      r: RING_R + (Math.random() - 0.5) * 30,
      vr: outward
        ? 60 + Math.random() * 120 * rate
        : -(20 + Math.random() * 60 * rate),
      vt: (Math.random() - 0.5) * 40 * rate,
      age: 0,
      maxAge: 0.3 + Math.random() * 0.7,
      size: 0.6 + Math.random() * 2.5 * rate,
      alpha: 0.55 + Math.random() * 0.45,
      type: "spark",
    });
  }

  private spawnSplashBurst(angle: number, vol: number): void {
    const count = 6 + Math.floor(vol * 12);
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const a = angle + spread;
      const speed = 30 + Math.random() * 160 * vol;
      const dir = Math.random() > 0.4 ? 1 : -1;
      this.particles.push({
        angle: a,
        r: RING_R + (Math.random() - 0.5) * 10,
        vr: dir * speed * (0.5 + Math.random() * 0.5),
        vt: (Math.random() - 0.5) * speed * 0.6,
        age: 0,
        maxAge: 0.25 + Math.random() * 0.55,
        size: 1 + Math.random() * 4 * vol,
        alpha: 0.7 + Math.random() * 0.3,
        type: "splash",
      });
    }
  }

  private tickParticles(dt: number): void {
    const vol = obsAudio.level;

    // Continuous spark stream — scales aggressively with volume
    if (vol > 0.12) {
      const rate = clamp((vol - 0.12) / 0.88, 0, 1);
      const count = Math.floor(rate * rate * 28) + (vol > 0.3 ? 2 : 0);
      for (let i = 0; i < count; i++) this.spawnSpark(vol, rate);
    }

    // Burst on volume peak (transient attack)
    const attack = obsAudio.level - this.prevVolume;
    if (attack > 0.04 && vol > 0.25) {
      const burstCount = 1 + Math.floor(attack * 12);
      for (let b = 0; b < burstCount; b++) {
        this.spawnSplashBurst(Math.random() * TAU, vol);
      }
    }

    // Age + integrate
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.particles.splice(i, 1);
        continue;
      }
      p.r += p.vr * dt;
      p.angle += (p.vt / Math.max(p.r, 1)) * dt;
      p.vr *= 0.88;
      p.vt *= 0.9;
    }

    if (this.particles.length > 600)
      this.particles.splice(0, this.particles.length - 600);
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  private draw(): void {
    const vol = obsAudio.level;
    const gc = this.gfxGlow;
    const gn = this.gfxCore;
    const gp = this.gfxParticles;
    gc.clear();
    gn.clear();
    gp.clear();

    const intensity = 0.35 + vol * 0.65;

    // ── All ring lines ──────────────────────────────────────────────────────
    for (const def of RINGS) {
      const col = volumeColor(clamp(vol + def.colBias, 0, 1));
      const pts = this.buildRing(def);
      const glowW = def.glowWidth * (1 + vol * 0.9);

      // Outer halo
      gc.poly(pts, true).stroke({
        color: col,
        width: glowW,
        alpha: 0.028 * def.glowAlphaMul * intensity,
        cap: "round",
        join: "round",
      });
      // Mid glow
      gc.poly(pts, true).stroke({
        color: col,
        width: glowW * 0.45,
        alpha: 0.07 * def.glowAlphaMul * intensity,
        cap: "round",
        join: "round",
      });
      // Inner bloom
      gc.poly(pts, true).stroke({
        color: col,
        width: glowW * 0.18,
        alpha: 0.22 * def.glowAlphaMul * intensity,
        cap: "round",
        join: "round",
      });
      // Core line — gets significantly bolder when audio activates
      gn.poly(pts, true).stroke({
        color: col,
        width: def.coreWidth * (1 + vol * 3.0),
        alpha: lerp(0.35, 0.95, vol) * def.coreAlphaMul,
        cap: "round",
        join: "round",
      });
      // Bright white highlight on top of core (main rings only)
      if (def.glowAlphaMul >= 0.9) {
        gn.poly(pts, true).stroke({
          color: 0xffffff,
          width: def.coreWidth * 0.45,
          alpha: lerp(0.15, 0.65, vol) * def.coreAlphaMul,
          cap: "round",
          join: "round",
        });
      }
    }

    // ── Inner rim at hole edge — static bold black border ───────────────────
    gc.circle(0, 0, HOLE_R).stroke({
      color: 0x303446,
      width: 12,
      alpha: 0.45,
    });
    gn.circle(0, 0, HOLE_R).stroke({
      color: 0x303446,
      width: 6,
      alpha: 1.0,
    });

    // ── Particles ──────────────────────────────────────────────────────────
    const pCol = volumeColor(vol);
    for (const p of this.particles) {
      const life = p.age / p.maxAge;
      const fadeIn = clamp(p.age / 0.04, 0, 1);
      const fadeOut = clamp(1 - life * life, 0, 1);
      const fade = fadeIn * fadeOut;
      if (fade < 0.015) continue;

      const sx = Math.cos(p.angle) * p.r;
      const sy = Math.sin(p.angle) * p.r;
      const sz = p.size * (1 - life * 0.5);

      if (p.type === "splash") {
        // Larger glowing blobs
        gp.circle(sx, sy, sz * 2.8).fill({
          color: pCol,
          alpha: fade * p.alpha * 0.22,
        });
        gp.circle(sx, sy, sz * 1.2).fill({
          color: pCol,
          alpha: fade * p.alpha * 0.6,
        });
        gp.circle(sx, sy, sz * 0.5).fill({
          color: 0xffffff,
          alpha: fade * p.alpha * 0.9,
        });
      } else {
        // Sharp sparks
        gp.circle(sx, sy, sz * 1.6).fill({
          color: pCol,
          alpha: fade * p.alpha * 0.28,
        });
        gp.circle(sx, sy, sz * 0.7).fill({
          color: 0xffffff,
          alpha: fade * p.alpha * 0.85,
        });
      }
    }
  }

  public resize(width: number, height: number): void {
    const padding = 220;
    const availCSS =
      Math.min(window.innerWidth, window.innerHeight) - padding * 2;
    const cssScale = availCSS / SIZE;
    const distortX = window.innerWidth / width;
    const distortY = window.innerHeight / height;
    this.scale.x = cssScale / distortX;
    this.scale.y = cssScale / distortY;
    this.x = Math.round((width - SIZE * this.scale.x) / 2);
    this.y = Math.round((height - SIZE * this.scale.y) / 2);
  }
}
