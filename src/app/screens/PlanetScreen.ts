import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Palette (Catppuccin Mocha) ────────────────────────────────────────────────
const SUN_CORE = 0xf9e2af;
const SUN_MID = 0xfab387;
const SUN_CORONA = 0xfe640b;
const CATT_ROSEWATER = 0xf5e0dc;
const CATT_FLAMINGO = 0xf2cdcd;
const CATT_PEACH = 0xfab387;
const CATT_YELLOW = 0xf9e2af;
const CATT_GREEN = 0xa6e3a1;
const CATT_RED = 0xf38ba8;
const CATT_SKY = 0x89dceb;
const CATT_BLUE = 0x89b4fa;
const CATT_MAUVE = 0xcba6f7;
const CATT_LAVENDER = 0xb4befe;
const CATT_TEAL = 0x94e2d5;
const CATT_OVERLAY0 = 0x6c7086;
const CATT_SURFACE0 = 0x313244;
const CATT_BASE = 0x1e1e2e;
const CATT_CRUST = 0x11111b;

const STAR_COLORS = [
  0xffffff, 0xcdd6f4, CATT_LAVENDER, CATT_BLUE, CATT_SKY, CATT_ROSEWATER,
  CATT_YELLOW,
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const STAR_COUNT = 220;
const ASTEROID_COUNT = 80;
const SOLAR_SCALE = 0.38; // fraction of min(w,h)/2 for outermost orbit

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  color: number;
}

interface Moon {
  angle: number;
  speed: number;
  orbitR: number;
  size: number;
  color: number;
}

interface PlanetDef {
  orbitFrac: number;    // fraction of max orbit radius
  speed: number;        // rad/s (base, scaled by 1/sqrt(r))
  size: number;         // planet radius in pixels (at reference scale)
  color: number;
  atmoColor: number;
  hasRings: boolean;
  ringColor: number;
  moons: Array<{ orbitFrac: number; speed: number; size: number; color: number }>;
  trailLen: number;
}

interface Planet {
  angle: number;
  speed: number;
  orbitR: number;
  size: number;
  color: number;
  atmoColor: number;
  hasRings: boolean;
  ringColor: number;
  pulsePhase: number;
  moons: Moon[];
  trail: Array<{ x: number; y: number }>;
  trailLen: number;
}

interface Asteroid {
  angle: number;
  speed: number;
  orbitR: number;
  offsetR: number;
  size: number;
  alpha: number;
  color: number;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  trailPoints: Array<{ x: number; y: number }>;
}

// ── Planet definitions (orbit fractions from 0.12 to 1.0) ────────────────────
const PLANET_DEFS: PlanetDef[] = [
  {
    orbitFrac: 0.12, speed: 2.4, size: 5, color: CATT_ROSEWATER,
    atmoColor: CATT_FLAMINGO, hasRings: false, ringColor: 0, trailLen: 22,
    moons: [],
  },
  {
    orbitFrac: 0.20, speed: 1.7, size: 8, color: CATT_PEACH,
    atmoColor: CATT_YELLOW, hasRings: false, ringColor: 0, trailLen: 26,
    moons: [],
  },
  {
    orbitFrac: 0.30, speed: 1.2, size: 9, color: CATT_GREEN,
    atmoColor: CATT_BLUE, hasRings: false, ringColor: 0, trailLen: 30,
    moons: [
      { orbitFrac: 0.09, speed: 5.5, size: 2.5, color: CATT_OVERLAY0 },
    ],
  },
  {
    orbitFrac: 0.40, speed: 0.85, size: 7, color: CATT_RED,
    atmoColor: CATT_FLAMINGO, hasRings: false, ringColor: 0, trailLen: 32,
    moons: [
      { orbitFrac: 0.07, speed: 7, size: 1.5, color: CATT_OVERLAY0 },
      { orbitFrac: 0.12, speed: 4, size: 1.5, color: CATT_SURFACE0 },
    ],
  },
  {
    orbitFrac: 0.60, speed: 0.50, size: 20, color: CATT_PEACH,
    atmoColor: CATT_YELLOW, hasRings: false, ringColor: 0, trailLen: 38,
    moons: [
      { orbitFrac: 0.05, speed: 6, size: 3, color: CATT_FLAMINGO },
      { orbitFrac: 0.08, speed: 4.2, size: 2.5, color: CATT_ROSEWATER },
      { orbitFrac: 0.12, speed: 2.8, size: 3.5, color: CATT_OVERLAY0 },
      { orbitFrac: 0.16, speed: 1.9, size: 2, color: CATT_SURFACE0 },
    ],
  },
  {
    orbitFrac: 0.74, speed: 0.35, size: 17, color: CATT_YELLOW,
    atmoColor: CATT_PEACH, hasRings: true, ringColor: CATT_YELLOW, trailLen: 42,
    moons: [
      { orbitFrac: 0.06, speed: 5, size: 2.5, color: CATT_ROSEWATER },
      { orbitFrac: 0.10, speed: 3, size: 3, color: CATT_OVERLAY0 },
    ],
  },
  {
    orbitFrac: 0.87, speed: 0.22, size: 13, color: CATT_SKY,
    atmoColor: CATT_TEAL, hasRings: true, ringColor: CATT_TEAL, trailLen: 45,
    moons: [
      { orbitFrac: 0.07, speed: 4, size: 2, color: CATT_LAVENDER },
      { orbitFrac: 0.12, speed: 2.2, size: 2, color: CATT_BLUE },
    ],
  },
  {
    orbitFrac: 1.00, speed: 0.14, size: 12, color: CATT_BLUE,
    atmoColor: CATT_MAUVE, hasRings: false, ringColor: 0, trailLen: 48,
    moons: [
      { orbitFrac: 0.06, speed: 3.5, size: 2, color: CATT_LAVENDER },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerpColor(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export class PlanetScreen extends Container {
  public static assetBundles = ["main"];

  // layers
  private readonly bgGfx = new Graphics();
  private readonly starGfx = new Graphics();
  private readonly orbitRingGfx = new Graphics();
  private readonly asteroidGfx = new Graphics();
  private readonly trailGfx = new Graphics();
  private readonly planetGfx = new Graphics();
  private readonly sunGfx = new Graphics();
  private readonly cometGfx = new Graphics();

  private readonly stars: Star[] = [];
  private readonly planets: Planet[] = [];
  private readonly asteroids: Asteroid[] = [];
  private readonly comets: Comet[] = [];

  private time = 0;
  private w = 0;
  private h = 0;
  private maxOrbitR = 0;
  private cometTimer = 0;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.starGfx);
    this.addChild(this.orbitRingGfx);
    this.addChild(this.asteroidGfx);
    this.addChild(this.trailGfx);
    this.addChild(this.planetGfx);
    this.addChild(this.cometGfx);
    this.addChild(this.sunGfx);
  }

  public async show(): Promise<void> {
    this.spawnStars();
    this.buildPlanets();
    this.spawnAsteroids();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    this.drawBackground();
    this.drawStars(dt);
    this.drawOrbitRings();
    this.updatePlanets(dt);
    this.drawAsteroids(dt);
    this.drawComets(dt);
    this.drawSun();

    this.cometTimer += dt;
    if (this.cometTimer > 8 + Math.random() * 6) {
      this.cometTimer = 0;
      this.spawnComet();
    }
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width * 0.5;
    this.y = height * 0.5;
    this.maxOrbitR = Math.min(width, height) * 0.5 * SOLAR_SCALE;
    this.rebuildPlanets();
    this.rebuildAsteroids();
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground(): void {
    this.bgGfx.clear();
    const r = Math.max(this.w, this.h);
    this.bgGfx.rect(-this.w * 0.5, -this.h * 0.5, this.w, this.h)
      .fill({ color: CATT_CRUST });
    // subtle nebula hazes
    this.bgGfx.circle(0, 0, r * 0.9).fill({ color: CATT_BASE, alpha: 0.4 });
    const pulse = 1 + 0.01 * Math.sin(this.time * 0.3);
    this.bgGfx.circle(0, 0, r * 0.35 * pulse).fill({ color: CATT_SURFACE0, alpha: 0.25 });
    // faint coloured nebula clouds
    this.bgGfx.circle(-this.w * 0.28, -this.h * 0.18, r * 0.38)
      .fill({ color: CATT_MAUVE, alpha: 0.025 });
    this.bgGfx.circle(this.w * 0.22, this.h * 0.22, r * 0.3)
      .fill({ color: CATT_BLUE, alpha: 0.022 });
    this.bgGfx.circle(-this.w * 0.1, this.h * 0.3, r * 0.25)
      .fill({ color: CATT_TEAL, alpha: 0.018 });
  }

  // ── Stars ─────────────────────────────────────────────────────────────────

  private spawnStars(): void {
    const hw = 1400, hh = 900;
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * hw * 2,
        y: (Math.random() - 0.5) * hh * 2,
        size: 0.3 + Math.random() * 1.8,
        alpha: 0.15 + Math.random() * 0.6,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.4 + Math.random() * 1.8,
        color: randomFrom(STAR_COLORS),
      });
    }
  }

  private drawStars(dt: number): void {
    this.starGfx.clear();
    for (const s of this.stars) {
      s.twinklePhase += s.twinkleSpeed * dt;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(s.twinklePhase));
      const a = s.alpha * tw;
      this.starGfx.circle(s.x, s.y, s.size).fill({ color: s.color, alpha: a });
      if (s.size > 1.1) {
        this.starGfx.circle(s.x, s.y, s.size * 2.5).fill({ color: s.color, alpha: a * 0.12 });
      }
    }
  }

  // ── Orbit rings ───────────────────────────────────────────────────────────

  private drawOrbitRings(): void {
    this.orbitRingGfx.clear();
    if (this.maxOrbitR === 0) return;
    for (const p of this.planets) {
      this.orbitRingGfx.circle(0, 0, p.orbitR)
        .stroke({ color: CATT_OVERLAY0, alpha: 0.07, width: 0.5 });
    }
  }

  // ── Planet building ───────────────────────────────────────────────────────

  private buildPlanets(): void {
    this.planets.length = 0;
    if (this.maxOrbitR === 0) return;
    for (const def of PLANET_DEFS) {
      const orbitR = def.orbitFrac * this.maxOrbitR;
      const moons: Moon[] = def.moons.map(m => ({
        angle: Math.random() * Math.PI * 2,
        speed: m.speed,
        orbitR: m.orbitFrac * def.size * 8,
        size: m.size,
        color: m.color,
      }));
      this.planets.push({
        angle: Math.random() * Math.PI * 2,
        speed: def.speed,
        orbitR,
        size: def.size,
        color: def.color,
        atmoColor: def.atmoColor,
        hasRings: def.hasRings,
        ringColor: def.ringColor,
        pulsePhase: Math.random() * Math.PI * 2,
        moons,
        trail: [],
        trailLen: def.trailLen,
      });
    }
  }

  private rebuildPlanets(): void {
    if (this.planets.length === 0) return;
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      p.orbitR = PLANET_DEFS[i].orbitFrac * this.maxOrbitR;
      // rescale moon orbits
      for (let j = 0; j < p.moons.length; j++) {
        p.moons[j].orbitR = PLANET_DEFS[i].moons[j].orbitFrac * p.size * 8;
      }
      p.trail = [];
    }
  }

  private updatePlanets(dt: number): void {
    if (this.maxOrbitR === 0) return;
    this.trailGfx.clear();
    this.planetGfx.clear();

    for (const p of this.planets) {
      p.angle += p.speed * dt;
      p.pulsePhase += dt * 0.8;

      const px = Math.cos(p.angle) * p.orbitR;
      const py = Math.sin(p.angle) * p.orbitR;

      // record trail
      p.trail.push({ x: px, y: py });
      if (p.trail.length > p.trailLen) p.trail.shift();

      // draw trail
      for (let i = 1; i < p.trail.length; i++) {
        const tf = i / p.trail.length;
        const ta = tf * tf * 0.25;
        const tr = p.trail[i];
        this.trailGfx.circle(tr.x, tr.y, p.size * tf * 0.35)
          .fill({ color: p.color, alpha: ta });
      }

      // atmosphere glow
      const glowPulse = 1 + 0.08 * Math.sin(p.pulsePhase);
      this.planetGfx.circle(px, py, p.size * 2.2 * glowPulse)
        .fill({ color: p.atmoColor, alpha: 0.12 });
      this.planetGfx.circle(px, py, p.size * 1.5 * glowPulse)
        .fill({ color: p.atmoColor, alpha: 0.18 });

      // rings (behind planet — drawn first at this layer)
      if (p.hasRings) {
        const ringW = p.size * 2.4;
        const ringH = p.size * 0.45;
        this.planetGfx.ellipse(px, py, ringW, ringH)
          .stroke({ color: p.ringColor, alpha: 0.55, width: 2.5 });
        this.planetGfx.ellipse(px, py, ringW * 1.35, ringH * 1.35)
          .stroke({ color: p.ringColor, alpha: 0.22, width: 1.2 });
      }

      // planet body
      this.planetGfx.circle(px, py, p.size).fill({ color: p.color });
      // highlight
      this.planetGfx.circle(px - p.size * 0.3, py - p.size * 0.3, p.size * 0.38)
        .fill({ color: 0xffffff, alpha: 0.18 });

      // moons
      for (const m of p.moons) {
        m.angle += m.speed * dt;
        const mx = px + Math.cos(m.angle) * m.orbitR;
        const my = py + Math.sin(m.angle) * m.orbitR;
        this.planetGfx.circle(mx, my, m.size).fill({ color: m.color, alpha: 0.9 });
        this.planetGfx.circle(mx, my, m.size * 1.8).fill({ color: m.color, alpha: 0.1 });
      }
    }
  }

  // ── Sun ───────────────────────────────────────────────────────────────────

  private drawSun(): void {
    this.sunGfx.clear();
    if (this.maxOrbitR === 0) return;
    const sunR = this.maxOrbitR * 0.065;
    const pulse = 1 + 0.04 * Math.sin(this.time * 1.4);
    const flarePulse = 1 + 0.12 * Math.sin(this.time * 0.6);

    // far corona
    this.sunGfx.circle(0, 0, sunR * 4.0 * flarePulse)
      .fill({ color: SUN_CORONA, alpha: 0.03 });
    this.sunGfx.circle(0, 0, sunR * 2.8 * pulse)
      .fill({ color: SUN_MID, alpha: 0.07 });
    this.sunGfx.circle(0, 0, sunR * 1.8 * pulse)
      .fill({ color: SUN_MID, alpha: 0.15 });
    // corona spikes (8 lobes drawn as ellipses at angles)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.time * 0.08;
      const lx = Math.cos(a) * sunR * 1.6 * flarePulse;
      const ly = Math.sin(a) * sunR * 1.6 * flarePulse;
      this.sunGfx.circle(lx, ly, sunR * 0.35)
        .fill({ color: SUN_MID, alpha: 0.2 });
    }
    // body
    this.sunGfx.circle(0, 0, sunR * pulse).fill({ color: SUN_CORE });
    this.sunGfx.circle(0, 0, sunR * 0.65).fill({ color: 0xffffff, alpha: 0.55 });
    // surface hot spots
    for (let i = 0; i < 5; i++) {
      const sa = this.time * 0.22 + i * 1.26;
      const sr = sunR * (0.3 + 0.55 * Math.abs(Math.sin(i * 1.9)));
      this.sunGfx.circle(Math.cos(sa) * sr * 0.55, Math.sin(sa) * sr * 0.55, sunR * 0.14)
        .fill({ color: lerpColor(SUN_MID, SUN_CORE, Math.abs(Math.sin(this.time + i))), alpha: 0.6 });
    }
  }

  // ── Asteroids ─────────────────────────────────────────────────────────────

  private spawnAsteroids(): void {
    if (this.maxOrbitR === 0) return;
    // belt between planet 4 (Mars, frac 0.40) and planet 5 (Jupiter, frac 0.60)
    const innerR = 0.45 * this.maxOrbitR;
    const outerR = 0.55 * this.maxOrbitR;
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const r = innerR + Math.random() * (outerR - innerR);
      this.asteroids.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.18 + Math.random() * 0.22,
        orbitR: r,
        offsetR: (Math.random() - 0.5) * (outerR - innerR) * 0.3,
        size: 0.8 + Math.random() * 2.0,
        alpha: 0.3 + Math.random() * 0.5,
        color: randomFrom([CATT_OVERLAY0, CATT_SURFACE0, CATT_ROSEWATER, CATT_FLAMINGO]),
      });
    }
  }

  private rebuildAsteroids(): void {
    if (this.asteroids.length === 0) return;
    const innerR = 0.45 * this.maxOrbitR;
    const outerR = 0.55 * this.maxOrbitR;
    for (const a of this.asteroids) {
      a.orbitR = innerR + Math.random() * (outerR - innerR);
    }
  }

  private drawAsteroids(dt: number): void {
    this.asteroidGfx.clear();
    if (this.maxOrbitR === 0) return;
    for (const a of this.asteroids) {
      a.angle += a.speed * dt;
      const r = a.orbitR + a.offsetR;
      const ax = Math.cos(a.angle) * r;
      const ay = Math.sin(a.angle) * r;
      this.asteroidGfx.circle(ax, ay, a.size).fill({ color: a.color, alpha: a.alpha });
    }
  }

  // ── Comets ────────────────────────────────────────────────────────────────

  private spawnComet(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5, hh = this.h * 0.5;
    const side = Math.floor(Math.random() * 4);
    let sx: number, sy: number;
    if (side === 0) { sx = -hw - 40; sy = (Math.random() - 0.5) * hh * 2; }
    else if (side === 1) { sx = hw + 40; sy = (Math.random() - 0.5) * hh * 2; }
    else if (side === 2) { sx = (Math.random() - 0.5) * hw * 2; sy = -hh - 40; }
    else { sx = (Math.random() - 0.5) * hw * 2; sy = hh + 40; }
    const targetX = (Math.random() - 0.5) * hw * 0.6;
    const targetY = (Math.random() - 0.5) * hh * 0.6;
    const speed = 280 + Math.random() * 220;
    const dx = targetX - sx, dy = targetY - sy;
    const len = Math.hypot(dx, dy);
    const maxLife = (len / speed) * 3.5;
    this.comets.push({
      x: sx, y: sy,
      vx: (dx / len) * speed, vy: (dy / len) * speed,
      life: 0, maxLife,
      size: 2.5 + Math.random() * 3,
      color: randomFrom([CATT_ROSEWATER, CATT_LAVENDER, CATT_SKY, 0xffffff]),
      trailPoints: [],
    });
  }

  private drawComets(dt: number): void {
    this.cometGfx.clear();
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.life += dt;
      if (c.life >= c.maxLife) { this.comets.splice(i, 1); continue; }

      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.trailPoints.push({ x: c.x, y: c.y });
      if (c.trailPoints.length > 55) c.trailPoints.shift();

      const prog = c.life / c.maxLife;
      const a = (1 - prog) * 0.9;

      // draw tail
      for (let j = 1; j < c.trailPoints.length; j++) {
        const tf = j / c.trailPoints.length;
        const tp = c.trailPoints[j];
        this.cometGfx.circle(tp.x, tp.y, c.size * tf * 0.6)
          .fill({ color: c.color, alpha: tf * tf * a * 0.55 });
      }
      // head glow
      this.cometGfx.circle(c.x, c.y, c.size * 2.8).fill({ color: c.color, alpha: a * 0.2 });
      this.cometGfx.circle(c.x, c.y, c.size).fill({ color: c.color, alpha: a });
      this.cometGfx.circle(c.x, c.y, c.size * 0.4).fill({ color: 0xffffff, alpha: a * 0.8 });
    }
  }
}
