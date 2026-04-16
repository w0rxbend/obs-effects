import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ─── colours ──────────────────────────────────────────────────────────────────

const CRUST = 0x11111b;

const ACCENTS = [
  0xcba6f7, // mauve
  0xf38ba8, // red
  0xfab387, // peach
  0xf9e2af, // yellow
  0xa6e3a1, // green
  0x94e2d5, // teal
  0x89dceb, // sky
  0x89b4fa, // blue
  0xb4befe, // lavender
  0xf5c2e7, // pink
];

const BOID_GROUP_RADIUS = 140; // radius used to sense nearby boids for glow
const BOID_GROUP_MAX = 8;      // neighbour count considered "fully grouped"

// ─── particle constants ───────────────────────────────────────────────────────

const PARTICLE_COUNT = 85;
const DECAY = 150;
const PART_SPEED_MIN = 0.15;
const PART_SPEED_MAX = 0.4;

// ─── comet constants ──────────────────────────────────────────────────────────

const COMET_TRAIL_LENGTH = 65;
const COMET_SPEED_MIN = 5;
const COMET_SPEED_MAX = 12;
const COMET_SPAWN_MIN = 400;   // faster spawn cadence — more comets in view
const COMET_SPAWN_MAX = 1400;
const COMET_DOUBLE_CHANCE = 0.50; // 50 % chance of a second comet per burst
const COMET_TRIPLE_CHANCE = 0.20; // bonus 20 % chance of a third (meteor shower)

// comet ↔ boid interaction
const COMET_BOID_RADIUS = 130;       // px — influence zone around comet head
const COMET_BOID_FORCE = 1.1;        // repulsion strength
const COMET_SCATTER_THRESHOLD = 5;   // boids hit in one frame → trigger scatter

// ─── boid constants ───────────────────────────────────────────────────────────

const BOID_COUNT = 42;
const BOID_SPEED_MIN = 0.8;
const BOID_SPEED_MAX = 2.5;

const SEP_RADIUS = 180;  // personal-space bubble — wider so symbols don't overlap
const ALI_RADIUS = 280;
const COH_RADIUS = 380;

const SEP_FORCE = 0.22;  // per-pair spring — dominates cohesion at close range
const ALI_FORCE = 0.03;
const COH_FORCE = 0.005; // gentle pull — flock shape, not a tight clump

const SCATTER_DURATION = 3500;    // ms boids stay scattered after a comet hit

// ─── interfaces ───────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; color: number;
}

interface TrailPoint { x: number; y: number }

interface Comet {
  x: number; y: number;
  vx: number; vy: number;
  color: number;
  trail: TrailPoint[];
}

// Tech/dev Nerd Font codepoints (SymbolsNF)
const BOID_SYMBOLS = [
  '\uF121', '\uF126', '\uF09B', '\uF120', '\uF013',
  '\uF135', '\uF0E7', '\uF259', '\uF292', '\uF188',
  '\uF1C0', '\uF233', '\uF109', '\uF11C', '\uF17C',
  '\uF179', '\uF0AD', '\uF0C3', '\uF1EB',
  '\uF108', '\uF200', '\uF201', '\uF11B', '\uF1B2',
  '\uF1C9', '\uF023', '\uF304', '\uF0E4', '\uF07B',
];

const BOID_PALETTE = [
  0xcba6f7, 0xf38ba8, 0xfab387, 0xf9e2af,
  0x94e2d5, 0x89dceb, 0x89b4fa, 0xb4befe, 0xf5c2e7,
];

interface Boid {
  x: number; y: number;
  vx: number; vy: number;
  density: number; // 0 = isolated, 1 = fully grouped
  node: Text;      // the symbol Text object for this boid
}

// ─── screen ───────────────────────────────────────────────────────────────────

export class BackgroundScreen extends Container {
  public static assetBundles = ["default"];

  private gfx: Graphics;
  private boidCont: Container; // Text symbol nodes for boids — drawn above gfx
  private screenWidth = 0;
  private screenHeight = 0;

  // ambient particles
  private particles: Particle[] = [];

  // comets
  private comets: Comet[] = [];
  private cometTimer = 0;
  private nextCometIn = 1500;

  // boids
  private boids: Boid[] = [];
  private boidState: "flock" | "scatter" = "flock";
  private scatterTimer = 0;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.boidCont = new Container();
    this.addChild(this.gfx);
    this.addChild(this.boidCont);
  }

  public show(): Promise<void> {
    this.spawnParticles();
    this.spawnBoids();
    return Promise.resolve();
  }

  // ─── spawn ──────────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = PART_SPEED_MIN + Math.random() * (PART_SPEED_MAX - PART_SPEED_MIN);
      this.particles.push({
        x: Math.random() * this.screenWidth,
        y: Math.random() * this.screenHeight,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 1.5 + Math.random() * 1.5,
        color: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
      });
    }
  }

  private spawnBoids(): void {
    // destroy any previous nodes
    for (const b of this.boids) b.node.destroy();
    this.boids = [];
    this.boidCont.removeChildren();

    const cx = this.screenWidth * 0.5;
    const cy = this.screenHeight * 0.5;

    for (let i = 0; i < BOID_COUNT; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const speed  = BOID_SPEED_MIN + Math.random() * (BOID_SPEED_MAX - BOID_SPEED_MIN);
      const sym    = BOID_SYMBOLS[i % BOID_SYMBOLS.length];
      const color  = BOID_PALETTE[i % BOID_PALETTE.length];

      const node = new Text({
        text: sym,
        style: new TextStyle({
          fontFamily: "'SymbolsNF', monospace",
          fontSize:   22,
          fill:       color,
          padding:    16,
          dropShadow: { color, blur: 12, distance: 0, alpha: 0.85, angle: 0 },
        }),
      });
      node.anchor.set(0.5);
      node.x = cx + (Math.random() - 0.5) * 200;
      node.y = cy + (Math.random() - 0.5) * 200;
      this.boidCont.addChild(node);

      this.boids.push({
        x: node.x, y: node.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        density: 0,
        node,
      });
    }
  }

  private spawnComet(): void {
    const w = this.screenWidth;
    const h = this.screenHeight;
    const speed = COMET_SPEED_MIN + Math.random() * (COMET_SPEED_MAX - COMET_SPEED_MIN);
    const edge = Math.floor(Math.random() * 4);
    let x: number, y: number, vx: number, vy: number;

    if (edge === 0) {
      x = Math.random() * w; y = -5;
      vx = (Math.random() - 0.5) * speed * 0.6; vy = speed * (0.6 + Math.random() * 0.4);
    } else if (edge === 1) {
      x = w + 5; y = Math.random() * h;
      vx = -speed * (0.6 + Math.random() * 0.4); vy = (Math.random() - 0.5) * speed * 0.6;
    } else if (edge === 2) {
      x = Math.random() * w; y = h + 5;
      vx = (Math.random() - 0.5) * speed * 0.6; vy = -speed * (0.6 + Math.random() * 0.4);
    } else {
      x = -5; y = Math.random() * h;
      vx = speed * (0.6 + Math.random() * 0.4); vy = (Math.random() - 0.5) * speed * 0.6;
    }

    const color = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    this.comets.push({ x, y, vx, vy, trail: [], color });
  }

  // ─── update ─────────────────────────────────────────────────────────────────

  public update(time: Ticker): void {
    const dt = time.deltaTime;
    const w = this.screenWidth;
    const h = this.screenHeight;

    // ambient particles — toroidal wrap
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += w; else if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h; else if (p.y > h) p.y -= h;
    }

    // comet spawn
    this.cometTimer += time.deltaMS;
    if (this.cometTimer >= this.nextCometIn) {
      this.spawnComet();
      if (Math.random() < COMET_DOUBLE_CHANCE)  this.spawnComet(); // double burst
      if (Math.random() < COMET_TRIPLE_CHANCE)  this.spawnComet(); // meteor shower
      this.cometTimer = 0;
      this.nextCometIn = COMET_SPAWN_MIN + Math.random() * (COMET_SPAWN_MAX - COMET_SPAWN_MIN);
    }

    // comet movement + cull
    const margin = COMET_TRAIL_LENGTH * COMET_SPEED_MAX + 20;
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.trail.push({ x: c.x, y: c.y });
      if (c.trail.length > COMET_TRAIL_LENGTH) c.trail.shift();
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (
        (c.x < -margin && c.vx < 0) || (c.x > w + margin && c.vx > 0) ||
        (c.y < -margin && c.vy < 0) || (c.y > h + margin && c.vy > 0)
      ) this.comets.splice(i, 1);
    }

    // recover from scatter after duration expires
    if (this.boidState === "scatter") {
      this.scatterTimer += time.deltaMS;
      if (this.scatterTimer >= SCATTER_DURATION) {
        this.boidState = "flock";
        this.scatterTimer = 0;
      }
    }

    this.applyCometBoidInteraction();
    this.updateBoids(dt);

    this.draw();
  }

  private triggerScatter(): void {
    this.boidState = "scatter";
    for (const b of this.boids) {
      const angle = Math.random() * Math.PI * 2;
      const impulse = 2 + Math.random() * 3;
      b.vx += Math.cos(angle) * impulse;
      b.vy += Math.sin(angle) * impulse;
    }
  }

  private applyCometBoidInteraction(): void {
    for (const c of this.comets) {
      let hitCount = 0;
      for (const b of this.boids) {
        const dx = b.x - c.x;
        const dy = b.y - c.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < COMET_BOID_RADIUS * COMET_BOID_RADIUS && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / COMET_BOID_RADIUS) * COMET_BOID_FORCE;
          b.vx += (dx / dist) * force;
          b.vy += (dy / dist) * force;
          hitCount++;
        }
      }
      // comet blasting through a cluster triggers scatter
      if (this.boidState === "flock" && hitCount >= COMET_SCATTER_THRESHOLD) {
        this.triggerScatter();
      }
    }
  }

  private updateBoids(dt: number): void {
    const w = this.screenWidth;
    const h = this.screenHeight;
    const isScatter = this.boidState === "scatter";

    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];

      let aliX = 0, aliY = 0, aliN = 0;
      let cohX = 0, cohY = 0, cohN = 0;

      for (let j = 0; j < this.boids.length; j++) {
        if (i === j) continue;
        const o = this.boids[j];

        // minimum-image delta on torus
        let dx = o.x - b.x;
        let dy = o.y - b.y;
        if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // separation — applied per-pair so crowding produces more force, not less
        if (dist < SEP_RADIUS && dist > 0) {
          const spring = (SEP_RADIUS - dist) / SEP_RADIUS; // 1 = touching, 0 = edge
          const scale = isScatter ? SEP_FORCE * 4 : SEP_FORCE;
          b.vx -= (dx / dist) * spring * scale;
          b.vy -= (dy / dist) * spring * scale;
        }
        if (!isScatter && dist < ALI_RADIUS) {
          aliX += o.vx; aliY += o.vy; aliN++;
        }
        if (!isScatter && dist < COH_RADIUS) {
          cohX += b.x + dx; cohY += b.y + dy; cohN++;
        }
      }

      // density: how many neighbours are within group radius (0 = alone, 1 = full group)
      let groupN = 0;
      for (let j = 0; j < this.boids.length; j++) {
        if (i === j) continue;
        const o = this.boids[j];
        let dx = o.x - b.x, dy = o.y - b.y;
        if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
        if (dx * dx + dy * dy < BOID_GROUP_RADIUS * BOID_GROUP_RADIUS) groupN++;
      }
      b.density = Math.min(groupN / BOID_GROUP_MAX, 1);

      if (aliN > 0) { b.vx += ((aliX / aliN) - b.vx) * ALI_FORCE; b.vy += ((aliY / aliN) - b.vy) * ALI_FORCE; }
      if (cohN > 0) { b.vx += ((cohX / cohN) - b.x) * COH_FORCE; b.vy += ((cohY / cohN) - b.y) * COH_FORCE; }

      // clamp speed
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const maxSpd = isScatter ? BOID_SPEED_MAX * 2.5 : BOID_SPEED_MAX;
      if (speed > 0.001) {
        if (speed > maxSpd) { b.vx = (b.vx / speed) * maxSpd; b.vy = (b.vy / speed) * maxSpd; }
        else if (speed < BOID_SPEED_MIN) { b.vx = (b.vx / speed) * BOID_SPEED_MIN; b.vy = (b.vy / speed) * BOID_SPEED_MIN; }
      }
    }

    // move + toroidal wrap
    for (const b of this.boids) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0) b.x += w; else if (b.x > w) b.x -= w;
      if (b.y < 0) b.y += h; else if (b.y > h) b.y -= h;
    }
  }

  // ─── draw ───────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.gfx;
    const w = this.screenWidth;
    const h = this.screenHeight;
    g.clear();

    g.rect(0, 0, w, h).fill(CRUST);

    // ambient particle connections — toroidal minimum-image
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j];
        let dx = b.x - a.x; let dy = b.y - a.y;
        if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;

        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = Math.exp(-dist / DECAY);
        if (t < 0.01) continue;

        const lw = 0.3 + t * 2.2;
        const color = lerpColor(a.color, b.color, 0.5);
        const alpha = t * 0.65;

        g.moveTo(a.x, a.y).lineTo(a.x + dx, a.y + dy).stroke({ color, alpha, width: lw });

        if (Math.abs(b.x - a.x) > w / 2 || Math.abs(b.y - a.y) > h / 2) {
          g.moveTo(b.x, b.y).lineTo(b.x - dx, b.y - dy).stroke({ color, alpha, width: lw });
        }
      }
    }

    // ambient dots
    for (const p of this.particles) {
      g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: 0.9 });
    }

    // comet trails + heads
    for (const c of this.comets) {
      const pts: TrailPoint[] = [...c.trail, { x: c.x, y: c.y }];
      if (pts.length < 2) continue;
      const total = pts.length;
      for (let i = 1; i < total; i++) {
        const t = i / total;
        g.moveTo(pts[i - 1].x, pts[i - 1].y)
          .lineTo(pts[i].x, pts[i].y)
          .stroke({ color: c.color, alpha: t * t * 0.85, width: 0.5 + t * 3.5 });
      }
      const head = pts[total - 1];
      g.circle(head.x, head.y, 2.5).fill({ color: c.color, alpha: 1 });
      g.circle(head.x, head.y, 5).fill({ color: c.color, alpha: 0.25 });
    }

    // boid symbols — position Text nodes; scale and alpha driven by density
    for (const b of this.boids) {
      const d = b.density;
      b.node.x = b.x;
      b.node.y = b.y;
      // face the direction of travel
      b.node.rotation = Math.atan2(b.vy, b.vx) + Math.PI * 0.5;
      // grow slightly and brighten when grouped
      b.node.scale.set(0.75 + d * 0.50);
      b.node.alpha = 0.45 + d * 0.50;
    }
  }

  // ─── resize ─────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    if (this.screenWidth > 0 && this.screenHeight > 0) {
      const sx = width / this.screenWidth;
      const sy = height / this.screenHeight;
      for (const p of this.particles) { p.x *= sx; p.y *= sy; }
      for (const b of this.boids) { b.x *= sx; b.y *= sy; }
    }
    this.screenWidth = width;
    this.screenHeight = height;
    if (this.particles.length === 0) this.spawnParticles();
    if (this.boids.length === 0) this.spawnBoids();
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) |
         (Math.round(ag + (bg - ag) * t) << 8) |
          Math.round(ab + (bb - ab) * t);
}
