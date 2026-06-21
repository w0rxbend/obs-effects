import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib/obsAudio";

const TAU = Math.PI * 2;

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

// Color ramp: white-hot core → lime → bright green → deep green → near-black
const FIRE_RAMP: [number, number][] = [
  [0.0, 0xffffff],
  [0.12, 0xccffaa],
  [0.28, 0x66ff00],
  [0.46, 0x00dd00],
  [0.63, 0x007700],
  [0.82, 0x003300],
  [1.0, 0x001100],
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

// ── Fire particles ─────────────────────────────────────────────────────────

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

// ── Lightning ──────────────────────────────────────────────────────────────

interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  branch: boolean;
}

interface LightningBolt {
  segs: LightningSegment[];
  age: number;
  life: number;
  power: number;
}

function buildLightning(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  depth: number,
  spread: number,
  branch: boolean,
  out: LightningSegment[],
): void {
  if (depth === 0) {
    out.push({ x1, y1, x2, y2, branch });
    return;
  }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * spread;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * spread;
  buildLightning(x1, y1, mx, my, depth - 1, spread * 0.55, branch, out);
  buildLightning(mx, my, x2, y2, depth - 1, spread * 0.55, branch, out);
  // Occasional side branch at this midpoint
  if (!branch && depth === 2 && Math.random() < 0.55) {
    const bLen = Math.hypot(x2 - x1, y2 - y1) * (0.3 + Math.random() * 0.35);
    const bAng =
      Math.atan2(y2 - y1, x2 - x1) +
      (Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.55);
    buildLightning(
      mx,
      my,
      mx + Math.cos(bAng) * bLen,
      my + Math.sin(bAng) * bLen,
      depth - 1,
      spread * 0.35,
      true,
      out,
    );
  }
}

function spawnBolt(ox: number, oy: number, power: number): LightningBolt {
  const angle = Math.random() * TAU;
  const len = 90 + Math.random() * 160 + power * 220;
  const segs: LightningSegment[] = [];
  buildLightning(
    ox,
    oy,
    ox + Math.cos(angle) * len,
    oy + Math.sin(angle) * len,
    4,
    len * 0.38,
    false,
    segs,
  );
  return { segs, age: 0, life: 0.07 + Math.random() * 0.11, power };
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_PARTICLES = 1300;
const MAX_BOLTS = 14;

export class GreenFireballScreen extends Container {
  public static assetBundles: string[] = [];

  // Render layers — order matters: ember behind flame, magic+lightning on top
  private readonly gfxEmber = new Graphics();
  private readonly gfxFlame = new Graphics();
  private readonly gfxMagic = new Graphics();
  private readonly gfxLightning = new Graphics();
  private readonly gfxSpark = new Graphics();

  private cx = 960;
  private cy = 540;
  private time = 0;

  private particles: FireParticle[] = [];
  private emitAccum = 0;

  private bolts: LightningBolt[] = [];
  private boltTimer = 0;

  constructor() {
    super();
    this.gfxFlame.blendMode = "add";
    this.gfxMagic.blendMode = "add";
    this.gfxLightning.blendMode = "add";
    this.gfxSpark.blendMode = "add";
    this.addChild(this.gfxEmber);
    this.addChild(this.gfxFlame);
    this.addChild(this.gfxMagic);
    this.addChild(this.gfxLightning);
    this.addChild(this.gfxSpark);
    void obsAudio.connect();
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(w: number, h: number): void {
    this.cx = w / 2;
    this.cy = h / 2;
  }

  // ── Fire particle emission ───────────────────────────────────────────────

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

  // ── Main update ──────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;
    obsAudio.update(dt);

    const breath = 0.28 + 0.09 * Math.sin(this.time * 1.85);
    const intensity = clamp(breath + obsAudio.bass * 0.72, 0, 1);

    const hoverY = this.cy + Math.sin(this.time * 1.1) * 12;
    const hoverX = this.cx + Math.sin(this.time * 0.67) * 5;

    // ── Fire particles ─────────────────────────────────────────────────────
    const sparkBoost = 1 + obsAudio.high * 2.5;
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

    const turbScale = 1 + obsAudio.mid * 1.8;
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
        p.vy += (35 + p.age * 25) * dt;
      } else {
        p.vx += turb * dt;
        p.vy += turb2 * dt * 0.28;
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

    // ── Lightning ──────────────────────────────────────────────────────────
    // Spawn rate speeds up with bass; high-freq adds extra bolts
    const boltInterval = 0.38 - obsAudio.bass * 0.28 - obsAudio.high * 0.08;
    this.boltTimer -= dt;
    if (this.boltTimer <= 0 && this.bolts.length < MAX_BOLTS) {
      const count =
        1 + (obsAudio.bass > 0.55 ? Math.floor(obsAudio.high * 3) : 0);
      for (let k = 0; k < count && this.bolts.length < MAX_BOLTS; k++) {
        this.bolts.push(spawnBolt(hoverX, hoverY, intensity));
      }
      this.boltTimer = Math.max(0.06, boltInterval);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].age += dt;
      if (this.bolts[i].age >= this.bolts[i].life) this.bolts.splice(i, 1);
    }

    this.draw(intensity, hoverX, hoverY);
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  private draw(intensity: number, ox: number, oy: number): void {
    this.drawFire(intensity, ox, oy);
    this.drawMagicSigil(intensity, ox, oy);
    this.drawLightning(ox);
  }

  private drawFire(intensity: number, ox: number, oy: number): void {
    const ge = this.gfxEmber;
    const gf = this.gfxFlame;
    const gs = this.gfxSpark;

    ge.clear();
    gf.clear();
    gs.clear();

    const hr = 50 + intensity * 80;
    gf.circle(ox, oy, hr * 2.8).fill({
      color: 0x003300,
      alpha: 0.025 + obsAudio.bass * 0.04,
    });
    gf.circle(ox, oy, hr * 1.7).fill({
      color: 0x00aa00,
      alpha: 0.045 + obsAudio.bass * 0.07,
    });
    gf.circle(ox, oy, hr).fill({
      color: 0x44ff00,
      alpha: 0.035 + obsAudio.bass * 0.05,
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
        gs.circle(p.x, p.y, r * 2.8).fill({ color: 0xbbff88, alpha: a * 0.16 });
        gs.circle(p.x, p.y, r).fill({ color: 0xffffff, alpha: a * 0.88 });
      } else if (p.type === "ember") {
        ge.circle(p.x, p.y, r * 2.2).fill({ color: col, alpha: a * 0.22 });
        ge.circle(p.x, p.y, r).fill({ color: col, alpha: a });
      } else {
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

    const pulse = 0.88 + 0.12 * Math.sin(this.time * 4.5 + 0.7);
    const orbR = (14 + intensity * 20) * pulse;
    gf.circle(ox, oy, orbR * 4.2).fill({
      color: 0x001100,
      alpha: 0.04 + obsAudio.bass * 0.08,
    });
    gf.circle(ox, oy, orbR * 2.6).fill({
      color: 0x005500,
      alpha: 0.09 + obsAudio.bass * 0.13,
    });
    gf.circle(ox, oy, orbR * 1.5).fill({
      color: 0x00aa00,
      alpha: 0.22 + obsAudio.bass * 0.26,
    });
    gf.circle(ox, oy, orbR).fill({
      color: 0xaaff44,
      alpha: 0.58 + obsAudio.bass * 0.28,
    });
    gf.circle(ox, oy, orbR * 0.5).fill({
      color: 0xffffff,
      alpha: 0.9 + obsAudio.bass * 0.08,
    });
  }

  private drawMagicSigil(intensity: number, ox: number, oy: number): void {
    const gm = this.gfxMagic;
    gm.clear();

    const t = this.time;
    const midBoost = 1 + obsAudio.mid * 0.8;

    // ── Outer hexagon ring ─────────────────────────────────────────────────
    const R1 = (95 + intensity * 45) * 1;
    const rot1 = t * 0.28 * midBoost;
    const hexPts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rot1;
      hexPts.push({ x: ox + Math.cos(a) * R1, y: oy + Math.sin(a) * R1 });
    }
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      gm.moveTo(hexPts[i].x, hexPts[i].y)
        .lineTo(hexPts[next].x, hexPts[next].y)
        .stroke({
          color: 0x00ff66,
          width: 1.2,
          alpha: 0.35 + obsAudio.bass * 0.4,
        });
    }
    // Hexagram diagonals (every-other vertex across)
    for (let i = 0; i < 6; i++) {
      const opp = (i + 3) % 6;
      if (i < opp) {
        gm.moveTo(hexPts[i].x, hexPts[i].y)
          .lineTo(hexPts[opp].x, hexPts[opp].y)
          .stroke({
            color: 0x00ff44,
            width: 0.6,
            alpha: 0.15 + obsAudio.bass * 0.2,
          });
      }
    }

    // ── Inner triangle (counter-rotating) ─────────────────────────────────
    const R2 = (58 + intensity * 28) * 1;
    const rot2 = -t * 0.45 * midBoost + Math.PI / 6;
    const triPts: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rot2;
      triPts.push({ x: ox + Math.cos(a) * R2, y: oy + Math.sin(a) * R2 });
    }
    for (let i = 0; i < 3; i++) {
      const next = (i + 1) % 3;
      gm.moveTo(triPts[i].x, triPts[i].y)
        .lineTo(triPts[next].x, triPts[next].y)
        .stroke({
          color: 0x44ffaa,
          width: 1.0,
          alpha: 0.32 + obsAudio.bass * 0.38,
        });
    }

    // ── Second triangle (inverted, same radius) — forms Star of David ─────
    const rot3 = rot2 + Math.PI;
    const triPts2: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rot3;
      triPts2.push({ x: ox + Math.cos(a) * R2, y: oy + Math.sin(a) * R2 });
    }
    for (let i = 0; i < 3; i++) {
      const next = (i + 1) % 3;
      gm.moveTo(triPts2[i].x, triPts2[i].y)
        .lineTo(triPts2[next].x, triPts2[next].y)
        .stroke({
          color: 0x44ffaa,
          width: 1.0,
          alpha: 0.28 + obsAudio.bass * 0.35,
        });
    }

    // ── Orbiting magic orbs (outer ring, 8 dots) ──────────────────────────
    const R3 = 120 + intensity * 55;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 0.55 * midBoost;
      const pulse = 0.7 + 0.3 * Math.sin(t * 2.8 + i * 0.78);
      const r = (2.5 + intensity * 2.0 + obsAudio.high * 3) * pulse;
      const px = ox + Math.cos(a) * R3;
      const py = oy + Math.sin(a) * R3;
      gm.circle(px, py, r * 4).fill({
        color: 0x00ff44,
        alpha: (0.06 + obsAudio.bass * 0.09) * pulse,
      });
      gm.circle(px, py, r).fill({
        color: 0xccffaa,
        alpha: 0.65 + obsAudio.bass * 0.3,
      });
    }

    // ── Inner orbiting orbs (6 dots, counter-rotating) ────────────────────
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - t * 0.7 * midBoost;
      const pulse = 0.65 + 0.35 * Math.sin(t * 3.5 + i * 1.05);
      const r = (2.0 + intensity * 1.5 + obsAudio.high * 2) * pulse;
      const px = ox + Math.cos(a) * R2;
      const py = oy + Math.sin(a) * R2;
      gm.circle(px, py, r * 3).fill({
        color: 0x44ffaa,
        alpha: (0.05 + obsAudio.bass * 0.08) * pulse,
      });
      gm.circle(px, py, r).fill({
        color: 0xeeffcc,
        alpha: 0.6 + obsAudio.bass * 0.35,
      });
    }

    // ── Vertex glows on hexagon ────────────────────────────────────────────
    for (const pt of hexPts) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 4 + pt.x * 0.01);
      gm.circle(pt.x, pt.y, 8 + obsAudio.bass * 6).fill({
        color: 0x00ff44,
        alpha: (0.08 + obsAudio.bass * 0.12) * pulse,
      });
      gm.circle(pt.x, pt.y, 2.5 + obsAudio.high * 2).fill({
        color: 0xbbffcc,
        alpha: 0.7 + obsAudio.bass * 0.28,
      });
    }

    // ── Outer dashed circle (dotted ring at R3) ───────────────────────────
    const dotN = 48;
    for (let i = 0; i < dotN; i++) {
      const a = (i / dotN) * TAU + t * 0.18;
      // Draw only every other dot to get dashes
      if (i % 3 === 0) continue;
      const px = ox + Math.cos(a) * R3;
      const py = oy + Math.sin(a) * R3;
      gm.circle(px, py, 1.2).fill({
        color: 0x00cc44,
        alpha: 0.3 + obsAudio.bass * 0.35,
      });
    }
  }

  private drawLightning(ox: number): void {
    const gl = this.gfxLightning;
    gl.clear();

    for (const bolt of this.bolts) {
      const t = 1 - bolt.age / bolt.life;
      // Per-bolt flicker — random each frame for crackling effect
      const flicker = 0.45 + Math.random() * 0.55;
      const baseAlpha = t * t * flicker * (0.55 + bolt.power * 0.45);

      for (const seg of bolt.segs) {
        const alpha = baseAlpha * (seg.branch ? 0.45 : 1.0);
        const coreW = seg.branch ? 0.5 : 1.4;

        // Outer glow
        gl.moveTo(seg.x1, seg.y1)
          .lineTo(seg.x2, seg.y2)
          .stroke({ color: 0x00ff44, width: coreW * 7, alpha: alpha * 0.07 });
        // Mid glow
        gl.moveTo(seg.x1, seg.y1)
          .lineTo(seg.x2, seg.y2)
          .stroke({ color: 0x44ff88, width: coreW * 3, alpha: alpha * 0.22 });
        // Bright core
        gl.moveTo(seg.x1, seg.y1)
          .lineTo(seg.x2, seg.y2)
          .stroke({ color: 0xccffcc, width: coreW, alpha: alpha * 0.85 });
      }

      // Bright flash dot at bolt origin
      const flashR = (3 + bolt.power * 5) * t * flicker;
      gl.circle(ox, this.cy, flashR * 2).fill({
        color: 0x00ff44,
        alpha: baseAlpha * 0.3,
      });
    }
  }
}
