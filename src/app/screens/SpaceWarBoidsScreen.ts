import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Simulation tuning ──────────────────────────────────────────────────────────
const AGENTS_PER_FACTION = 80;
const FACTION_COUNT = 4;
const MAX_SPEED = 2.0;
const MAX_FORCE = 0.1;
const MAX_HP = 4;
const NEIGHBOR_R = 80; // same-faction flocking radius
const SEP_R = 26; // separation radius
const AGGRO_R = 150; // enemy detection radius
const ATTACK_R = 50; // attack range
const ATTACK_CD = 0.5; // seconds between shots
const HIT_LIFE = 0.45; // explosion particle lifetime
const LASER_LIFE = 0.12; // laser beam lifetime
const RESPAWN_MIN = 8; // respawn when faction drops below this
const RESPAWN_BATCH = 8;
const BH_AVOID_R = 190; // black-hole avoidance radius
const BELT_INNER = 300;
const BELT_OUTER = 385;
const DISTRESS_WINDOW = 2.5; // seconds after a hit that an agent counts as "in distress"
const RALLY_R = 210; // radius at which allies sense a distressed flockmate

const FACTION_COLORS: number[] = [
  0xff3355, // Red   — top-left
  0x33aaff, // Cyan  — top-right
  0x33ff77, // Green — bottom-right
  0xffcc22, // Gold  — bottom-left
];

// Corner spawn centres as fractions of screen size (top-left → clockwise)
const SPAWN_CORNERS = [
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 },
];

// ── Data types ─────────────────────────────────────────────────────────────────
interface Agent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  faction: number;
  cooldown: number;
  dead: boolean;
  hp: number;
  lastHitTime: number; // sim-time of last received hit; -10 if never hit
}

interface HitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
}

interface Laser {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  life: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  tp: number; // twinkle phase
  ts: number; // twinkle speed
}

interface Asteroid {
  angle: number;
  angSpeed: number;
  a: number; // orbit semi-axis x
  b: number; // orbit semi-axis y
  r: number; // visual radius
}

// ── Deterministic PRNG (Mulberry32) ───────────────────────────────────────────
class Prng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// ── Spatial hash – O(1) amortised insert, O(k) range query ────────────────────
class SpatialHash {
  private readonly cells = new Map<string, number[]>();
  private readonly cs: number;

  constructor(cellSize: number) {
    this.cs = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(idx: number, x: number, y: number): void {
    const k = `${Math.floor(x / this.cs)},${Math.floor(y / this.cs)}`;
    let c = this.cells.get(k);
    if (!c) {
      c = [];
      this.cells.set(k, c);
    }
    c.push(idx);
  }

  // Writes candidate indices into `out`. Caller filters by actual distance.
  query(x: number, y: number, radius: number, out: number[]): void {
    const cs = this.cs;
    const cx0 = Math.floor((x - radius) / cs);
    const cy0 = Math.floor((y - radius) / cs);
    const cx1 = Math.floor((x + radius) / cs);
    const cy1 = Math.floor((y + radius) / cs);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const c = this.cells.get(`${cx},${cy}`);
        if (c) for (const i of c) out.push(i);
      }
    }
  }
}

// ── Vector helpers ─────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Return (x,y) capped to `max` magnitude, skipping sqrt when possible.
function cap(x: number, y: number, max: number): [number, number] {
  const sq = x * x + y * y;
  if (sq > max * max) {
    const f = max / Math.sqrt(sq);
    return [x * f, y * f];
  }
  return [x, y];
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export class SpaceWarBoidsScreen extends Container {
  public static assetBundles: string[] = [];

  // Rendering layers (back → front)
  private readonly bgGfx = new Graphics(); // solid bg + twinkling stars
  private readonly nebGfx = new Graphics(); // nebulae — redrawn only on resize
  private readonly dynGfx = new Graphics(); // galaxy, black hole, pulsar, belt
  private readonly agGfx = new Graphics(); // agent dots with health visuals
  private readonly fxGfx = new Graphics(); // lasers and hit sparks

  private w = 1920;
  private h = 1080;
  private time = 0;

  // Background anchor points (updated in layout())
  private bhX = 0; // black hole
  private bhY = 0;
  private psX = 0; // pulsar
  private psY = 0;
  private gcX = 0; // galaxy centre
  private gcY = 0;

  private stars: Star[] = [];
  private asteroids: Asteroid[] = [];
  private agents: Agent[] = [];
  private hits: HitParticle[] = [];
  private lasers: Laser[] = [];

  // Cell size matches AGGRO_R; RALLY_R queries span a slightly wider cell range
  private readonly hash = new SpatialHash(AGGRO_R);
  private readonly nbuf: number[] = []; // reused neighbour index buffer

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.nebGfx);
    this.addChild(this.dynGfx);
    this.addChild(this.agGfx);
    this.addChild(this.fxGfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.layout();
    this.buildStars();
    this.buildAsteroids();
    this.buildAgents();
    this.drawNebulae();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.layout();
    this.buildStars();
    this.buildAsteroids();
    this.drawNebulae();
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;
    this.step(dt);
    this.render();
  }

  // ── Initialisation ────────────────────────────────────────────────────────
  private layout(): void {
    this.bhX = this.w * 0.72;
    this.bhY = this.h * 0.28;
    this.psX = this.w * 0.18;
    this.psY = this.h * 0.74;
    this.gcX = this.w * 0.5;
    this.gcY = this.h * 0.5;
  }

  private buildStars(): void {
    const rng = new Prng(1337);
    this.stars = [];
    for (let i = 0; i < 560; i++) {
      this.stars.push({
        x: rng.next() * this.w,
        y: rng.next() * this.h,
        r: rng.next() * 1.3 + 0.3,
        alpha: rng.next() * 0.55 + 0.25,
        tp: rng.next() * Math.PI * 2,
        ts: rng.next() * 2.5 + 0.5,
      });
    }
  }

  private buildAsteroids(): void {
    const rng = new Prng(2023);
    const mid = (BELT_INNER + BELT_OUTER) * 0.5;
    const hRatio = this.h / this.w;
    this.asteroids = [];
    for (let i = 0; i < 58; i++) {
      const spread = (rng.next() - 0.5) * (BELT_OUTER - BELT_INNER);
      this.asteroids.push({
        angle: rng.next() * Math.PI * 2,
        angSpeed: (rng.next() * 0.006 + 0.003) * (rng.next() > 0.5 ? 1 : -1),
        a: mid + spread,
        b: (mid + spread) * hRatio * 0.7,
        r: rng.next() * 2.2 + 0.8,
      });
    }
  }

  private buildAgents(): void {
    const rng = new Prng(31337);
    this.agents = [];
    for (let f = 0; f < FACTION_COUNT; f++) {
      const corner = SPAWN_CORNERS[f];
      const zx = this.w * corner.x;
      const zy = this.h * corner.y;
      const spread = Math.min(this.w, this.h) * 0.07; // tighter cluster per faction
      for (let i = 0; i < AGENTS_PER_FACTION; i++) {
        const va = rng.next() * Math.PI * 2;
        this.agents.push({
          x: clamp(zx + (rng.next() - 0.5) * spread * 2, 20, this.w - 20),
          y: clamp(zy + (rng.next() - 0.5) * spread * 2, 20, this.h - 20),
          vx: Math.cos(va) * MAX_SPEED * (rng.next() * 0.6 + 0.4),
          vy: Math.sin(va) * MAX_SPEED * (rng.next() * 0.6 + 0.4),
          faction: f,
          cooldown: rng.next() * ATTACK_CD,
          dead: false,
          hp: MAX_HP,
          lastHitTime: -10,
        });
      }
    }
  }

  private drawNebulae(): void {
    const g = this.nebGfx;
    g.clear();
    const defs = [
      { x: 0.15, y: 0.2, r: 340, c: 0x3311aa, a: 0.07 },
      { x: 0.82, y: 0.78, r: 380, c: 0x1a0033, a: 0.09 },
      { x: 0.64, y: 0.11, r: 230, c: 0x002255, a: 0.08 },
      { x: 0.27, y: 0.83, r: 270, c: 0x440011, a: 0.07 },
      { x: 0.5, y: 0.5, r: 460, c: 0x0d0022, a: 0.13 },
    ];
    for (const d of defs) {
      const cx = d.x * this.w;
      const cy = d.y * this.h;
      for (let l = 3; l >= 1; l--) {
        g.circle(cx, cy, (d.r * l) / 2).fill({ color: d.c, alpha: d.a / l });
      }
    }
  }

  // ── Simulation update ─────────────────────────────────────────────────────
  private step(dt: number): void {
    // 1. Remove dead agents (in-place compaction)
    let w = 0;
    for (let i = 0; i < this.agents.length; i++) {
      if (!this.agents[i].dead) this.agents[w++] = this.agents[i];
    }
    this.agents.length = w;

    // 2. Count surviving agents per faction before the main loop
    const counts = new Int32Array(FACTION_COUNT);
    for (const a of this.agents) counts[a.faction]++;

    // 3. Build spatial hash
    this.hash.clear();
    for (let i = 0; i < this.agents.length; i++) {
      this.hash.insert(i, this.agents[i].x, this.agents[i].y);
    }

    // 4. Boids + combat — fixed snapshot length to keep spawns out of this frame
    const snapLen = this.agents.length;
    for (let ai = 0; ai < snapLen; ai++) {
      const a = this.agents[ai];
      a.cooldown = Math.max(0, a.cooldown - dt);

      // Query with RALLY_R (larger) so the same pass covers flocking + combat + rescue
      this.nbuf.length = 0;
      this.hash.query(a.x, a.y, RALLY_R, this.nbuf);

      // ── Steering accumulators ──────────────────────────────────────────────
      let sepX = 0,
        sepY = 0; // separation
      let alX = 0,
        alY = 0,
        alN = 0; // alignment
      let chX = 0,
        chY = 0,
        chN = 0; // cohesion
      let tgDist = Infinity,
        tgX = 0,
        tgY = 0; // nearest enemy unit vector
      let attackEnemy: Agent | null = null;
      // Nearest distressed ally — drives rally-to-help behaviour
      let distressX = 0,
        distressY = 0,
        distressD2 = Infinity;

      for (const j of this.nbuf) {
        const b = this.agents[j];
        if (b === a || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0) continue;

        if (b.faction === a.faction) {
          // ── Same faction: separation + alignment + cohesion ──────────────
          if (d2 < SEP_R * SEP_R) {
            const d = Math.sqrt(d2);
            sepX -= dx / d;
            sepY -= dy / d;
          }
          if (d2 < NEIGHBOR_R * NEIGHBOR_R) {
            alX += b.vx;
            alY += b.vy;
            alN++;
            chX += b.x;
            chY += b.y;
            chN++;
          }
          // ── Rally: detect distressed flockmates ──────────────────────────
          // A flockmate is "in distress" when it was hit within DISTRESS_WINDOW
          if (d2 < RALLY_R * RALLY_R) {
            const sinceHit = this.time - b.lastHitTime;
            if (
              sinceHit >= 0 &&
              sinceHit < DISTRESS_WINDOW &&
              d2 < distressD2
            ) {
              distressD2 = d2;
              distressX = b.x;
              distressY = b.y;
            }
          }
        } else if (d2 < AGGRO_R * AGGRO_R) {
          // ── Enemy faction: track nearest for targeting ────────────────────
          if (d2 < tgDist) {
            tgDist = d2;
            const d = Math.sqrt(d2);
            tgX = dx / d;
            tgY = dy / d;
            if (d2 < ATTACK_R * ATTACK_R) attackEnemy = b;
          }
        }
      }

      // ── Assemble steering force ────────────────────────────────────────────
      let stX = 0,
        stY = 0;

      // Separation: flee too-close flockmates at full speed
      if (sepX !== 0 || sepY !== 0) {
        const [fx, fy] = cap(
          sepX * MAX_SPEED - a.vx,
          sepY * MAX_SPEED - a.vy,
          MAX_FORCE * 1.8,
        );
        stX += fx;
        stY += fy;
      }

      // Alignment: match average velocity of neighbours
      if (alN > 0) {
        const [avx, avy] = cap(alX / alN, alY / alN, MAX_SPEED);
        const [fx, fy] = cap(avx - a.vx, avy - a.vy, MAX_FORCE);
        stX += fx;
        stY += fy;
      }

      // Priority: enemy targeting > rally to help > normal cohesion
      if (tgDist !== Infinity) {
        // Seek nearest enemy at full speed
        const [fx, fy] = cap(
          tgX * MAX_SPEED - a.vx,
          tgY * MAX_SPEED - a.vy,
          MAX_FORCE * 1.3,
        );
        stX += fx;
        stY += fy;
      } else if (distressD2 !== Infinity) {
        // Rally: steer toward the nearest distressed ally.
        // Once close enough the attacker enters AGGRO_R and targeting takes over.
        const rdx = distressX - a.x;
        const rdy = distressY - a.y;
        const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
        const [fx, fy] = cap(
          (rdx / rd) * MAX_SPEED - a.vx,
          (rdy / rd) * MAX_SPEED - a.vy,
          MAX_FORCE * 1.5,
        );
        stX += fx;
        stY += fy;
      } else if (chN > 0) {
        // Normal cohesion: drift toward centre of mass of flockmates
        const cdx = chX / chN - a.x;
        const cdy = chY / chN - a.y;
        const cd = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        const [fx, fy] = cap(
          (cdx / cd) * MAX_SPEED - a.vx,
          (cdy / cd) * MAX_SPEED - a.vy,
          MAX_FORCE * 0.5,
        );
        stX += fx;
        stY += fy;
      }

      // ── Black hole avoidance: strong radial repulsion ──────────────────────
      const bhdx = a.x - this.bhX;
      const bhdy = a.y - this.bhY;
      const bhdSq = bhdx * bhdx + bhdy * bhdy;
      if (bhdSq < BH_AVOID_R * BH_AVOID_R) {
        const bhd = Math.sqrt(bhdSq) || 1;
        const t = 1 - bhd / BH_AVOID_R;
        const str = t * t * MAX_FORCE * 4.5;
        const [fx, fy] = cap(
          (bhdx / bhd) * str,
          (bhdy / bhd) * str,
          MAX_FORCE * 3,
        );
        stX += fx;
        stY += fy;
      }

      // ── Asteroid belt avoidance: radial push away from belt midline ────────
      const brx = a.x - this.gcX;
      const bry = a.y - this.gcY;
      const brd = Math.sqrt(brx * brx + bry * bry) || 1;
      if (brd > BELT_INNER * 0.82 && brd < BELT_OUTER * 1.18) {
        const midBelt = (BELT_INNER + BELT_OUTER) * 0.5;
        const sign = brd < midBelt ? -1 : 1;
        stX += (brx / brd) * sign * MAX_FORCE * 0.75;
        stY += (bry / brd) * sign * MAX_FORCE * 0.75;
      }

      // ── Integrate ────────────────────────────────────────────────────────────
      a.vx += stX;
      a.vy += stY;
      const [nvx, nvy] = cap(a.vx, a.vy, MAX_SPEED);
      a.vx = nvx;
      a.vy = nvy;
      a.x += a.vx;
      a.y += a.vy;

      // Hard clamp + velocity reflection at screen borders (no wrapping)
      const margin = 8;
      if (a.x < margin) {
        a.x = margin;
        if (a.vx < 0) a.vx *= -0.6;
      } else if (a.x > this.w - margin) {
        a.x = this.w - margin;
        if (a.vx > 0) a.vx *= -0.6;
      }
      if (a.y < margin) {
        a.y = margin;
        if (a.vy < 0) a.vy *= -0.6;
      } else if (a.y > this.h - margin) {
        a.y = this.h - margin;
        if (a.vy > 0) a.vy *= -0.6;
      }

      // ── Combat ─────────────────────────────────────────────────────────────
      if (attackEnemy && !attackEnemy.dead && a.cooldown === 0) {
        const adx = attackEnemy.x - a.x;
        const ady = attackEnemy.y - a.y;
        const al = Math.sqrt(adx * adx + ady * ady) || 1;
        const vl = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1;
        const dot = (a.vx * adx + a.vy * ady) / (vl * al);
        if (dot > 0.35) {
          a.cooldown = ATTACK_CD;
          this.lasers.push({
            x1: a.x,
            y1: a.y,
            x2: attackEnemy.x,
            y2: attackEnemy.y,
            color: FACTION_COLORS[a.faction],
            life: LASER_LIFE,
          });

          // HP damage — allies that detect lastHitTime update will rally next frame
          attackEnemy.hp -= 1;
          attackEnemy.lastHitTime = this.time;

          if (attackEnemy.hp <= 0) {
            attackEnemy.dead = true;
            this.explode(
              attackEnemy.x,
              attackEnemy.y,
              FACTION_COLORS[attackEnemy.faction],
            );
          } else {
            // Non-lethal hit: small spark flash and distress signal to allies
            this.hitFlash(
              attackEnemy.x,
              attackEnemy.y,
              FACTION_COLORS[attackEnemy.faction],
            );
          }
        }
      }
    }

    // 5. Update environment
    for (const ast of this.asteroids) ast.angle += ast.angSpeed;

    // 6. Age and compact hit particles
    w = 0;
    for (let i = 0; i < this.hits.length; i++) {
      const p = this.hits[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life > 0) this.hits[w++] = p;
    }
    this.hits.length = w;

    // 7. Age and compact lasers
    w = 0;
    for (let i = 0; i < this.lasers.length; i++) {
      const l = this.lasers[i];
      l.life -= dt;
      if (l.life > 0) this.lasers[w++] = l;
    }
    this.lasers.length = w;

    // 8. Respawn depleted factions after the main loop
    for (let f = 0; f < FACTION_COUNT; f++) {
      if (counts[f] < RESPAWN_MIN) this.spawn(f, RESPAWN_BATCH);
    }
  }

  private spawn(faction: number, count: number): void {
    const rng = new Prng(((Date.now() % 65521) + faction * 7919) >>> 0);
    const corner = SPAWN_CORNERS[faction];
    const zx = this.w * corner.x;
    const zy = this.h * corner.y;
    const spread = Math.min(this.w, this.h) * 0.06;
    for (let i = 0; i < count; i++) {
      const va = rng.next() * Math.PI * 2;
      this.agents.push({
        x: clamp(zx + (rng.next() - 0.5) * spread * 2, 20, this.w - 20),
        y: clamp(zy + (rng.next() - 0.5) * spread * 2, 20, this.h - 20),
        vx: Math.cos(va) * MAX_SPEED,
        vy: Math.sin(va) * MAX_SPEED,
        faction,
        cooldown: rng.next() * ATTACK_CD,
        dead: false,
        hp: MAX_HP,
        lastHitTime: -10,
      });
    }
  }

  // Full death explosion — 7 sparks
  private explode(x: number, y: number, color: number): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.7;
      const spd = Math.random() * 2.8 + 0.6;
      this.hits.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: HIT_LIFE,
        maxLife: HIT_LIFE,
        color,
      });
    }
  }

  // Non-lethal hit flash — 3 sparks, short lifetime; sets lastHitTime on the target
  // so allies within RALLY_R will detect distress next frame.
  private hitFlash(x: number, y: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * 1.8 + 0.4;
      this.hits.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: HIT_LIFE * 0.45,
        maxLife: HIT_LIFE * 0.45,
        color,
      });
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  private render(): void {
    this.drawBg();
    this.drawDyn();
    this.drawAgents();
    this.drawFx();
  }

  private drawBg(): void {
    const g = this.bgGfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x010108 });
    for (const s of this.stars) {
      const tw = Math.sin(this.time * s.ts + s.tp) * 0.22;
      const a = clamp(s.alpha + tw, 0.06, 1.0);
      g.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: a });
    }
  }

  private drawDyn(): void {
    const g = this.dynGfx;
    g.clear();

    // ── Rotating galaxy spiral ─────────────────────────────────────────────
    const rot = this.time * 0.012;
    const gcx = this.gcX;
    const gcy = this.gcY;
    const armHues = [0x5522aa, 0x224488, 0x886622];
    for (let arm = 0; arm < 3; arm++) {
      const ao = (arm / 3) * Math.PI * 2;
      const hue = armHues[arm];
      for (let i = 0; i < 110; i++) {
        const t = i / 110;
        const ang = ao + t * Math.PI * 3.5 + rot;
        const dist = t * Math.min(this.w, this.h) * 0.33;
        const px = gcx + Math.cos(ang) * dist;
        const py = gcy + Math.sin(ang) * dist * 0.56;
        g.circle(px, py, (1 - t) * 1.4 + 0.3).fill({
          color: hue,
          alpha: (1 - t) * 0.14 + 0.02,
        });
      }
    }
    g.circle(gcx, gcy, 48).fill({ color: 0x7744bb, alpha: 0.05 });
    g.circle(gcx, gcy, 24).fill({ color: 0x9966dd, alpha: 0.09 });
    g.circle(gcx, gcy, 7).fill({ color: 0xddaaff, alpha: 0.55 });

    // ── Black hole ─────────────────────────────────────────────────────────
    const bpulse = Math.sin(this.time * 0.65) * 0.14 + 0.86;
    const bhR = 36;
    g.circle(this.bhX, this.bhY, bhR * 3.0 * bpulse).fill({
      color: 0xff7733,
      alpha: 0.04,
    });
    g.circle(this.bhX, this.bhY, bhR * 2.0 * bpulse).fill({
      color: 0xcc5522,
      alpha: 0.06,
    });
    g.circle(this.bhX, this.bhY, bhR * 1.45 * bpulse).stroke({
      color: 0xff9944,
      width: 1.8,
      alpha: 0.44,
    });
    g.circle(this.bhX, this.bhY, bhR).fill({ color: 0x000000, alpha: 0.97 });
    g.circle(this.bhX, this.bhY, bhR * 1.06).stroke({
      color: 0xff8833,
      width: 1.2,
      alpha: 0.72,
    });

    // ── Pulsar ─────────────────────────────────────────────────────────────
    const pf = Math.abs(Math.sin(this.time * 8.5 + Math.sin(this.time * 14.3)));
    const pr = 3 + pf * 7;
    g.circle(this.psX, this.psY, pr * 3.8).fill({
      color: 0x44ffff,
      alpha: 0.035 * pf,
    });
    g.circle(this.psX, this.psY, pr * 1.6).fill({
      color: 0x88ffff,
      alpha: 0.13 * pf,
    });
    g.circle(this.psX, this.psY, pr).fill({
      color: 0xffffff,
      alpha: clamp(pf * 0.9, 0, 1),
    });
    if (pf > 0.65) {
      const bl = 70 + pf * 130;
      const ba = ((pf - 0.65) / 0.35) * 0.35;
      g.moveTo(this.psX - bl, this.psY)
        .lineTo(this.psX + bl, this.psY)
        .stroke({ color: 0x44ffff, width: 1.2 + pf * 2.5, alpha: ba });
    }

    // ── Asteroid belt ──────────────────────────────────────────────────────
    for (const ast of this.asteroids) {
      const ax = this.gcX + Math.cos(ast.angle) * ast.a;
      const ay = this.gcY + Math.sin(ast.angle) * ast.b;
      g.circle(ax, ay, ast.r).fill({ color: 0x887766, alpha: 0.62 });
    }
  }

  private drawAgents(): void {
    const g = this.agGfx;
    g.clear();
    for (const a of this.agents) {
      const c = FACTION_COLORS[a.faction];
      const hpFrac = a.hp / MAX_HP; // 1 = full health, 0.25 = 1 HP left

      // Size and opacity scale with remaining health
      const coreR = 1.2 + hpFrac * 1.0;
      const coreAlpha = 0.45 + hpFrac * 0.47;
      const glowAlpha = 0.04 + hpFrac * 0.08;

      // White hit-flash: brief bright ring that fades in 0.25 s
      const sinceHit = this.time - a.lastHitTime;
      const flashFrac =
        sinceHit >= 0 && sinceHit < 0.25 ? 1 - sinceHit / 0.25 : 0;

      // Outer glow
      g.circle(a.x, a.y, 6).fill({ color: c, alpha: glowAlpha });

      // Hit-flash ring (white)
      if (flashFrac > 0) {
        g.circle(a.x, a.y, coreR + 2.8).fill({
          color: 0xffffff,
          alpha: flashFrac * 0.55,
        });
      }

      // Core dot
      g.circle(a.x, a.y, coreR).fill({ color: c, alpha: coreAlpha });

      // Critical-HP warning: pulsing red halo so allies can see who needs help
      if (a.hp === 1) {
        const pulse = Math.abs(Math.sin(this.time * 5.5 + a.x));
        g.circle(a.x, a.y, 5.5).fill({ color: 0xff2244, alpha: pulse * 0.38 });
      }
    }
  }

  private drawFx(): void {
    const g = this.fxGfx;
    g.clear();
    for (const l of this.lasers) {
      const alpha = clamp(l.life / LASER_LIFE, 0, 1) * 0.88;
      g.moveTo(l.x1, l.y1)
        .lineTo(l.x2, l.y2)
        .stroke({ color: l.color, width: 1.4, alpha });
    }
    for (const p of this.hits) {
      const frac = p.life / p.maxLife;
      g.circle(p.x, p.y, (1 - frac) * 3.5 + 0.4).fill({
        color: p.color,
        alpha: frac * 0.85,
      });
    }
  }
}
