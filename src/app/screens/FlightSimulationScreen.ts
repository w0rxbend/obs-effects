import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Exhaust palette ───────────────────────────────────────────────────────────
const FIRE_COLS  = [0xffd700, 0xff8c00, 0xff4500, 0xfff0a0, 0xffffff] as const;
const SMOKE_COLS = [0xd8d8d8, 0xe4e4e4, 0xf0efec, 0xc8c8c8] as const;

// ── Rocket types ──────────────────────────────────────────────────────────────
const enum RocketType { SATURN, FALCON, FIREWORK, MISSILE, CARTOON }

interface RocketSpec {
  minSpd: number; maxSpd: number;
  minScl: number; maxScl: number;
  backX:  number;     // local x of engine nozzle (always negative)
  firePS: number;     // fire particles per second
  smokePS: number;
}

const SPECS: Record<RocketType, RocketSpec> = {
  [RocketType.SATURN]:   { minSpd: 140, maxSpd: 240, minScl: 0.40, maxScl: 0.80, backX: -68, firePS: 55, smokePS: 22 },
  [RocketType.FALCON]:   { minSpd: 200, maxSpd: 360, minScl: 0.32, maxScl: 0.72, backX: -70, firePS: 70, smokePS: 28 },
  [RocketType.FIREWORK]: { minSpd:  90, maxSpd: 170, minScl: 0.28, maxScl: 0.56, backX: -42, firePS: 35, smokePS: 12 },
  [RocketType.MISSILE]:  { minSpd: 280, maxSpd: 480, minScl: 0.30, maxScl: 0.62, backX: -62, firePS: 55, smokePS: 18 },
  [RocketType.CARTOON]:  { minSpd:  75, maxSpd: 150, minScl: 0.36, maxScl: 0.70, backX: -52, firePS: 38, smokePS: 15 },
};

const ALL_TYPES: RocketType[] = [
  RocketType.SATURN, RocketType.FALCON, RocketType.FIREWORK,
  RocketType.MISSILE, RocketType.CARTOON,
];

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_ROCKETS   = 5;
const MAX_PARTICLES = 600;
const SPAWN_MIN     = 2.5;
const SPAWN_MAX     = 6.5;

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; targetR: number;
  life: number; maxLife: number;
  color: number;
  smoke: boolean;
}

interface FogPuff {
  x: number; y: number;
  r: number; targetR: number;
  life: number; maxLife: number;
}

interface Rocket {
  cont: Container;
  gfx:  Graphics;
  x: number; y: number;
  angle: number;
  speed: number;
  accel: number;
  scl:   number;
  type:  RocketType;
  fa:    number;   // fire particle accumulator
  sa:    number;   // smoke particle accumulator
}

// ══════════════════════════════════════════════════════════════════════════════
export class FlightSimulationScreen extends Container {
  public static assetBundles = ["default"];

  private readonly fogGfx     = new Graphics();
  private readonly exhaustGfx = new Graphics();
  private readonly rocketLayer = new Container();

  private w = 1920;
  private h = 1080;

  private rockets:   Rocket[]   = [];
  private particles: Particle[] = [];
  private fog:       FogPuff[]  = [];
  private spawnT = 1.5; // first rocket after 1.5 s

  constructor() {
    super();
    this.addChild(this.fogGfx);
    this.addChild(this.exhaustGfx);
    this.addChild(this.rocketLayer);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public async show(): Promise<void> { /* rockets spawn over time */ }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.tickSpawn(dt);
    this.tickRockets(dt);
    this.tickParticles(dt);
    this.tickFog(dt);
    this.redraw();
  }

  public resize(w: number, h: number): void { this.w = w; this.h = h; }

  // ── Spawner ───────────────────────────────────────────────────────────────

  private tickSpawn(dt: number): void {
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.rockets.length < MAX_ROCKETS) {
      this.doSpawn();
      this.spawnT = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    }
  }

  private doSpawn(): void {
    const type  = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
    const spec  = SPECS[type];
    const x     = this.w * (0.06 + Math.random() * 0.88);
    const y     = this.h + 60;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.32;
    const scl   = spec.minScl + Math.random() * (spec.maxScl - spec.minScl);
    const speed = spec.minSpd + Math.random() * (spec.maxSpd - spec.minSpd);

    const cont = new Container();
    const gfx  = new Graphics();
    cont.addChild(gfx);
    paintRocket(gfx, type);

    cont.x = x; cont.y = y;
    cont.scale.set(scl);
    cont.rotation = angle;

    this.rockets.push({ cont, gfx, x, y, angle, speed, accel: speed * 0.25, scl, type, fa: 0, sa: 0 });
    this.rocketLayer.addChild(cont);

    // Launch fog puffs
    const n = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const ml = 1.8 + Math.random() * 1.4;
      this.fog.push({
        x: x + (Math.random() - 0.5) * 70,
        y: y + (Math.random() - 0.5) * 24,
        r: 12 + Math.random() * 16,
        targetR: 55 + Math.random() * 75,
        life: ml, maxLife: ml,
      });
    }
  }

  // ── Rockets ───────────────────────────────────────────────────────────────

  private tickRockets(dt: number): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.speed += r.accel * dt;
      r.x += Math.cos(r.angle) * r.speed * dt;
      r.y += Math.sin(r.angle) * r.speed * dt;
      r.cont.x = r.x;
      r.cont.y = r.y;

      this.emitExhaust(r, dt);

      if (r.y < -220) {
        this.rocketLayer.removeChild(r.cont);
        this.rockets.splice(i, 1);
      }
    }
  }

  private emitExhaust(r: Rocket, dt: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;

    const spec = SPECS[r.type];
    // Engine nozzle world position
    const bx   = spec.backX * r.scl;
    const ex   = r.x + bx * Math.cos(r.angle);
    const ey   = r.y + bx * Math.sin(r.angle);
    // Exhaust direction: opposite of flight
    const edx  = -Math.cos(r.angle);
    const edy  = -Math.sin(r.angle);
    const eAng = Math.atan2(edy, edx);

    // ── Fire ──────────────────────────────────────────────────────────────
    r.fa += spec.firePS * dt;
    let fireCount = Math.floor(r.fa);
    r.fa -= fireCount;
    fireCount = Math.min(fireCount, MAX_PARTICLES - this.particles.length);
    for (let i = 0; i < fireCount; i++) {
      const spd = 90 + Math.random() * 130;
      const a   = eAng + (Math.random() - 0.5) * 0.5;
      const life = 0.25 + Math.random() * 0.45;
      this.particles.push({
        x: ex + (Math.random() - 0.5) * 5 * r.scl,
        y: ey + (Math.random() - 0.5) * 5 * r.scl,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 2 + Math.random() * 4,
        targetR: 0.5,
        life, maxLife: life,
        color: FIRE_COLS[Math.floor(Math.random() * FIRE_COLS.length)],
        smoke: false,
      });
    }

    // ── Smoke ─────────────────────────────────────────────────────────────
    r.sa += spec.smokePS * dt;
    let smokeCount = Math.floor(r.sa);
    r.sa -= smokeCount;
    smokeCount = Math.min(smokeCount, MAX_PARTICLES - this.particles.length);
    for (let i = 0; i < smokeCount; i++) {
      const spd  = 25 + Math.random() * 45;
      const a    = eAng + (Math.random() - 0.5) * 0.75;
      const life = 1.8 + Math.random() * 2.2;
      this.particles.push({
        x: ex + (Math.random() - 0.5) * 12 * r.scl,
        y: ey + (Math.random() - 0.5) * 12 * r.scl,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 7 + Math.random() * 9,
        targetR: 28 + Math.random() * 22,
        life, maxLife: life,
        color: SMOKE_COLS[Math.floor(Math.random() * SMOKE_COLS.length)],
        smoke: true,
      });
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private tickParticles(dt: number): void {
    const drag = Math.pow(0.90, dt * 60);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      if (p.smoke) p.r += (p.targetR - p.r) * 2.5 * dt;
      else         p.r += (p.targetR - p.r) * 4 * dt;
    }
  }

  // ── Fog ───────────────────────────────────────────────────────────────────

  private tickFog(dt: number): void {
    for (let i = this.fog.length - 1; i >= 0; i--) {
      const f = this.fog[i];
      f.life -= dt;
      if (f.life <= 0) { this.fog.splice(i, 1); continue; }
      f.r += (f.targetR - f.r) * 1.8 * dt;
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private redraw(): void {
    // ── Fog puffs ────────────────────────────────────────────────────────
    const fg = this.fogGfx;
    fg.clear();
    for (const f of this.fog) {
      const t     = 1 - f.life / f.maxLife;
      const alpha = 0.38 * (1 - t * t);
      fg.circle(f.x, f.y, f.r).fill({ color: 0xffffff, alpha });
    }

    // ── Exhaust: smoke first (behind fire) ────────────────────────────────
    const eg = this.exhaustGfx;
    eg.clear();
    for (const p of this.particles) {
      if (!p.smoke) continue;
      const t     = p.life / p.maxLife;
      const alpha = t * 0.48;
      eg.circle(p.x, p.y, p.r).fill({ color: p.color, alpha });
    }
    // ── Fire on top ───────────────────────────────────────────────────────
    for (const p of this.particles) {
      if (p.smoke) continue;
      const t     = p.life / p.maxLife;
      const alpha = t * 0.88;
      eg.circle(p.x, p.y, p.r).fill({ color: p.color, alpha });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROCKET PAINT FUNCTIONS
// All drawn in local space, nose pointing RIGHT (+x). Rotation handled by container.
// ══════════════════════════════════════════════════════════════════════════════

function paintRocket(g: Graphics, type: RocketType): void {
  switch (type) {
    case RocketType.SATURN:   paintSaturn(g);   break;
    case RocketType.FALCON:   paintFalcon(g);   break;
    case RocketType.FIREWORK: paintFirework(g); break;
    case RocketType.MISSILE:  paintMissile(g);  break;
    case RocketType.CARTOON:  paintCartoon(g);  break;
  }
}

// ── Saturn V / classic space rocket ──────────────────────────────────────────
function paintSaturn(g: Graphics): void {
  g.clear();

  // Engine bell (drawn first, behind body)
  g.moveTo(-54, -8).lineTo(-68, -14).lineTo(-68, 14).lineTo(-54, 8)
    .fill({ color: 0x707070, alpha: 0.9 });
  g.circle(-68, 0, 3.5).fill({ color: 0x181818, alpha: 0.72 });

  // Fins (behind stage 1)
  g.moveTo(-50, -9).lineTo(-64, -32).lineTo(-44, -9).fill({ color: 0x1a1a2e, alpha: 0.94 });
  g.moveTo(-50,  9).lineTo(-64,  32).lineTo(-44,  9).fill({ color: 0x1a1a2e, alpha: 0.94 });

  // Stage 1 — largest
  g.roundRect(-54, -9, 68, 18, 5).fill({ color: 0xf2f2f2, alpha: 0.97 });
  // Stage 1 black band decor
  g.roundRect(-38, -9, 4, 18, 1).fill({ color: 0x202020, alpha: 0.4 });
  g.roundRect(-18, -9, 4, 18, 1).fill({ color: 0x202020, alpha: 0.4 });

  // Interstage ring
  g.roundRect(12, -9, 5, 18, 2).fill({ color: 0x505050, alpha: 0.6 });

  // Stage 2 — narrower
  g.roundRect(14, -7, 42, 14, 4).fill({ color: 0xeaeaea, alpha: 0.97 });

  // Stage 3 + service module
  g.roundRect(52, -5, 18, 10, 4).fill({ color: 0xd4dce8, alpha: 0.97 });
  // Escape tower
  g.roundRect(66, -1.5, 20, 3, 1.5).fill({ color: 0x2a2a2a, alpha: 0.82 });

  // Nose cone
  g.moveTo(66, -4).lineTo(86, 0).lineTo(66, 4).fill({ color: 0xe8e8e8, alpha: 0.97 });

  // USA stripe on stage 1
  g.roundRect(-44, -2, 28, 4, 2).fill({ color: 0x2244cc, alpha: 0.65 });

  g.roundRect(-54, -9, 68, 18, 5).stroke({ color: 0xc8c8c8, alpha: 0.18, width: 1 });
}

// ── Falcon 9 / modern orbital rocket ─────────────────────────────────────────
function paintFalcon(g: Graphics): void {
  g.clear();

  // Engine cluster bell
  g.moveTo(-58, -8).lineTo(-72, -14).lineTo(-72, 14).lineTo(-58, 8)
    .fill({ color: 0x585858, alpha: 0.9 });
  // 3 nozzle circles
  for (let i = -1; i <= 1; i++) {
    g.circle(-72, i * 5, 3.5).fill({ color: 0x181818, alpha: 0.7 });
  }

  // First stage — main body
  g.roundRect(-58, -6, 100, 12, 6).fill({ color: 0xf5f5f5, alpha: 0.97 });

  // Interstage
  g.roundRect(38, -7, 6, 14, 2).fill({ color: 0xc8c8c8, alpha: 0.82 });

  // Second stage
  g.roundRect(42, -5, 34, 10, 5).fill({ color: 0xf0f0f0, alpha: 0.97 });

  // Fairing / nose
  g.moveTo(74, -4).lineTo(90, 0).lineTo(74, 4).fill({ color: 0xe8e8e8, alpha: 0.97 });

  // Grid fins (folded flat on side of first stage, near top)
  g.roundRect(-4, -10, 10, 4, 1.5).fill({ color: 0xa8a8a8, alpha: 0.78 });
  g.roundRect(-4,  6,  10, 4, 1.5).fill({ color: 0xa8a8a8, alpha: 0.78 });

  // Landing legs (stowed)
  g.moveTo(-52, -6).lineTo(-62, -16).stroke({ color: 0x888888, alpha: 0.55, width: 1.5, cap: "round" });
  g.moveTo(-52,  6).lineTo(-62,  16).stroke({ color: 0x888888, alpha: 0.55, width: 1.5, cap: "round" });

  // SpaceX-style thin black waterline
  g.roundRect(-58, 2, 100, 3, 1.5).fill({ color: 0x181818, alpha: 0.25 });
  g.roundRect(-58, -6, 100, 12, 6).stroke({ color: 0xd0d0d0, alpha: 0.15, width: 1 });
}

// ── Firework rocket ───────────────────────────────────────────────────────────
function paintFirework(g: Graphics): void {
  g.clear();

  // Guide stick (extends backward)
  g.roundRect(-50, -1.5, 24, 3, 1.5).fill({ color: 0x8b6010, alpha: 0.88 });

  // Small tail fins
  g.moveTo(-28, -4).lineTo(-38, -16).lineTo(-26, -4).fill({ color: 0xcc2200, alpha: 0.9 });
  g.moveTo(-28,  4).lineTo(-38,  16).lineTo(-26,  4).fill({ color: 0xcc2200, alpha: 0.9 });

  // Main tube
  g.roundRect(-28, -5, 56, 10, 5).fill({ color: 0xcc2200, alpha: 0.95 });

  // Decorative gold bands
  for (let i = 0; i < 3; i++) {
    g.roundRect(-18 + i * 16, -5, 7, 10, 1.5).fill({ color: 0xffcc00, alpha: 0.6 });
  }

  // Nose cone
  g.moveTo(28, -4).lineTo(42, 0).lineTo(28, 4).fill({ color: 0xdd2200, alpha: 0.95 });

  // Fuse stub at back
  g.roundRect(-34, -1, 8, 2, 1).fill({ color: 0x303030, alpha: 0.8 });
}

// ── Military missile / ICBM ───────────────────────────────────────────────────
function paintMissile(g: Graphics): void {
  g.clear();

  // Rear delta fins
  g.moveTo(-42, -5).lineTo(-58, -26).lineTo(-50, -5).fill({ color: 0x243040, alpha: 0.95 });
  g.moveTo(-42,  5).lineTo(-58,  26).lineTo(-50,  5).fill({ color: 0x243040, alpha: 0.95 });

  // Engine nozzle
  g.moveTo(-50, -5).lineTo(-63, -9).lineTo(-63, 9).lineTo(-50, 5)
    .fill({ color: 0x404040, alpha: 0.9 });
  g.circle(-63, 0, 4.5).fill({ color: 0x181818, alpha: 0.72 });

  // Main body
  g.roundRect(-50, -5.5, 98, 11, 5.5).fill({ color: 0x2c3e50, alpha: 0.97 });

  // Ogive nose
  g.moveTo(48, -5).lineTo(72, 0).lineTo(48, 5).fill({ color: 0x34495e, alpha: 0.97 });

  // Warning / hazard stripes
  g.roundRect(-22, -5.5, 12, 11, 2).fill({ color: 0xffd700, alpha: 0.58 });
  g.roundRect(-4,  -5.5, 12, 11, 2).fill({ color: 0xffd700, alpha: 0.58 });

  // Centre highlight stripe
  g.roundRect(-50, -1.5, 122, 3, 1.5).fill({ color: 0xffffff, alpha: 0.2 });
}

// ── Retro cartoon rocket ──────────────────────────────────────────────────────
function paintCartoon(g: Graphics): void {
  g.clear();

  // Big cartoon fins
  g.moveTo(-32, -12).lineTo(-50, -36).lineTo(-30, -12).fill({ color: 0xff4444, alpha: 0.92 });
  g.moveTo(-32,  12).lineTo(-50,  36).lineTo(-30,  12).fill({ color: 0xff4444, alpha: 0.92 });

  // Engine bell (wide flared style)
  g.moveTo(-38, -12).lineTo(-54, -20).lineTo(-54, 20).lineTo(-38, 12)
    .fill({ color: 0xb0b0b8, alpha: 0.92 });
  g.circle(-54, 0, 6).fill({ color: 0xff4400, alpha: 0.55 });

  // Main body (chunky)
  g.roundRect(-38, -12, 74, 24, 12).fill({ color: 0xd0d0da, alpha: 0.97 });

  // Red nose / cone
  g.moveTo(36, -10).lineTo(58, 0).lineTo(36, 10).fill({ color: 0xff4444, alpha: 0.95 });

  // Portholes
  g.circle(14, -8, 7).fill({ color: 0x1a1a2e, alpha: 0.5 });
  g.circle(14, -8, 5).fill({ color: 0x89b4fa, alpha: 0.72 });
  g.circle(14, -8, 2).fill({ color: 0xffffff, alpha: 0.55 });
  g.circle(-6, -8, 6).fill({ color: 0x1a1a2e, alpha: 0.4 });
  g.circle(-6, -8, 4).fill({ color: 0x89b4fa, alpha: 0.6 });

  // Red accent band
  g.roundRect(-38, -2, 74, 4, 2).fill({ color: 0xff4444, alpha: 0.5 });

  g.roundRect(-38, -12, 74, 24, 12).stroke({ color: 0xa0a0b0, alpha: 0.28, width: 1.5 });
}
