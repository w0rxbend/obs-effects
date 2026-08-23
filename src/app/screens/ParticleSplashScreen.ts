import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { randRange as rand } from "../../lib/math";

// ── Catppuccin Mocha palette ──────────────────────────────────────────────────
const C_CRUST = 0x11111b;
const C_MANTLE = 0x181825;
const C_OVERLAY0 = 0x6c7086;

const ACCENT_COLORS = [
  0xf5e0dc, // rosewater
  0xf2cdcd, // flamingo
  0xf5c2e7, // pink
  0xcba6f7, // mauve
  0xf38ba8, // red
  0xfab387, // peach
  0xf9e2af, // yellow
  0xa6e3a1, // green
  0x94e2d5, // teal
  0x89dceb, // sky
  0x74c7ec, // sapphire
  0x89b4fa, // blue
  0xb4befe, // lavender
];

// ── Config ────────────────────────────────────────────────────────────────────
const ORB_COUNT = 55;
const ORB_BASE_RADIUS = 5;
const ORB_MAX_RADIUS = 9;
const ORB_SPEED = 60;
const WANDER_JITTER = 1.8; // radians/s jitter on wander angle
const WANDER_RADIUS = 60; // wander circle radius
const WANDER_DISTANCE = 120; // wander circle distance ahead
const BOUNDARY_FORCE = 340;
const BOUNDARY_MARGIN = 90;
const MAX_SPEED = 130;
const MIN_SPEED = 28;
const CONNECTION_DIST = 200;
const SPLINTER_INTERVAL = [0.6, 1.8]; // seconds min/max between splinter events per orb
const SPLINTER_COUNT = 10;
const SPARK_LIFE = [0.6, 1.2];
const SPARK_SPEED = 90;
const SPARK_RADIUS_MIN = 1.5;
const SPARK_RADIUS_MAX = 3.2;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  radius: number;
  pulsePhase: number;
  pulseSpeed: number;
  wanderAngle: number;
  splinterTimer: number;
  splinterInterval: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  radius: number;
  life: number;
  maxLife: number;
  trail: Array<{ x: number; y: number }>;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class ParticleSplashScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private orbs: Orb[] = [];
  private sparks: Spark[] = [];

  // Slowly drifting attractor that orbs loosely follow
  private attractorX = 0;
  private attractorY = 0;
  private attractorAngle = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.attractorX = this.w * 0.5;
    this.attractorY = this.h * 0.5;
    this.spawnOrbs();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.orbs = [];
    this.sparks = [];
    this.attractorX = width * 0.5;
    this.attractorY = height * 0.5;
    this.spawnOrbs();
  }

  private spawnOrbs(): void {
    for (let i = 0; i < ORB_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = ORB_SPEED * (0.5 + Math.random() * 0.7);
      this.orbs.push({
        x: this.w * 0.1 + Math.random() * this.w * 0.8,
        y: this.h * 0.1 + Math.random() * this.h * 0.8,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: ACCENT_COLORS[i % ACCENT_COLORS.length],
        radius:
          ORB_BASE_RADIUS + Math.random() * (ORB_MAX_RADIUS - ORB_BASE_RADIUS),
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.8 + Math.random() * 1.4,
        wanderAngle: Math.random() * Math.PI * 2,
        splinterTimer: Math.random() * 1.5,
        splinterInterval: rand(SPLINTER_INTERVAL[0], SPLINTER_INTERVAL[1]),
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    this.tickAttractor(dt);
    this.tickOrbs(dt);
    this.tickSparks(dt);
    this.draw();
  }

  // ── Simulation ────────────────────────────────────────────────────────────

  private tickAttractor(dt: number): void {
    this.attractorAngle += dt * 0.18;
    const rx = Math.cos(this.attractorAngle * 0.7) * this.w * 0.28;
    const ry = Math.sin(this.attractorAngle * 0.5) * this.h * 0.22;
    this.attractorX = this.w * 0.5 + rx;
    this.attractorY = this.h * 0.5 + ry;
  }

  private tickOrbs(dt: number): void {
    for (const orb of this.orbs) {
      // Wander steering
      orb.wanderAngle +=
        (Math.random() - 0.5) * 2 * WANDER_JITTER * dt * 60 * dt;
      const speedNow = Math.sqrt(orb.vx * orb.vx + orb.vy * orb.vy);
      const headingX = speedNow > 0.01 ? orb.vx / speedNow : 1;
      const headingY = speedNow > 0.01 ? orb.vy / speedNow : 0;
      const circleCx = orb.x + headingX * WANDER_DISTANCE;
      const circleCy = orb.y + headingY * WANDER_DISTANCE;
      const wanderFx =
        (circleCx + Math.cos(orb.wanderAngle) * WANDER_RADIUS - orb.x) * 0.12;
      const wanderFy =
        (circleCy + Math.sin(orb.wanderAngle) * WANDER_RADIUS - orb.y) * 0.12;

      // Loose attractor pull (very gentle)
      const adx = this.attractorX - orb.x;
      const ady = this.attractorY - orb.y;
      const adist = Math.sqrt(adx * adx + ady * ady) + 1;
      const attractFactor = Math.min(adist / (this.w * 0.4), 1) * 14;
      const attractFx = (adx / adist) * attractFactor;
      const attractFy = (ady / adist) * attractFactor;

      // Soft boundary repulsion
      let bfx = 0,
        bfy = 0;
      if (orb.x < BOUNDARY_MARGIN)
        bfx += BOUNDARY_FORCE * (1 - orb.x / BOUNDARY_MARGIN);
      if (orb.x > this.w - BOUNDARY_MARGIN)
        bfx -= BOUNDARY_FORCE * (1 - (this.w - orb.x) / BOUNDARY_MARGIN);
      if (orb.y < BOUNDARY_MARGIN)
        bfy += BOUNDARY_FORCE * (1 - orb.y / BOUNDARY_MARGIN);
      if (orb.y > this.h - BOUNDARY_MARGIN)
        bfy -= BOUNDARY_FORCE * (1 - (this.h - orb.y) / BOUNDARY_MARGIN);

      orb.vx += (wanderFx + attractFx + bfx) * dt;
      orb.vy += (wanderFy + attractFy + bfy) * dt;

      // Speed clamp
      const spd = Math.sqrt(orb.vx * orb.vx + orb.vy * orb.vy);
      if (spd > MAX_SPEED) {
        orb.vx = (orb.vx / spd) * MAX_SPEED;
        orb.vy = (orb.vy / spd) * MAX_SPEED;
      }
      if (spd < MIN_SPEED && spd > 0.01) {
        orb.vx = (orb.vx / spd) * MIN_SPEED;
        orb.vy = (orb.vy / spd) * MIN_SPEED;
      }

      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;

      // Splinter burst timer
      orb.splinterTimer -= dt;
      if (orb.splinterTimer <= 0) {
        this.emitSplinter(orb);
        orb.splinterTimer = orb.splinterInterval + Math.random() * 0.5;
      }
    }
  }

  private emitSplinter(orb: Orb): void {
    const count = SPLINTER_COUNT + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spd = SPARK_SPEED * (0.4 + Math.random() * 0.9);
      this.sparks.push({
        x: orb.x,
        y: orb.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: orb.color,
        radius: rand(SPARK_RADIUS_MIN, SPARK_RADIUS_MAX),
        life: rand(SPARK_LIFE[0], SPARK_LIFE[1]),
        maxLife: 0,
        trail: [],
      });
      this.sparks[this.sparks.length - 1].maxLife =
        this.sparks[this.sparks.length - 1].life;
    }
  }

  private tickSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 8) s.trail.shift();

      // Deceleration
      s.vx *= 1 - dt * 2.2;
      s.vy *= 1 - dt * 2.2;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;

      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.gfx;
    g.clear();

    g.rect(0, 0, this.w, this.h).fill({ color: C_CRUST });

    this.drawVignette(g);
    this.drawConnections(g);
    this.drawSparks(g);
    this.drawOrbs(g);
  }

  private drawVignette(g: Graphics): void {
    const vSize = Math.min(this.w, this.h) * 0.5;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < 10; i++) {
        const t = i / 10;
        const alpha = (1 - t) * (1 - t) * 0.28;
        const thickness = vSize * (1 - t);
        if (side === 0)
          g.rect(0, 0, thickness, this.h).fill({ color: C_MANTLE, alpha });
        if (side === 1)
          g.rect(this.w - thickness, 0, thickness, this.h).fill({
            color: C_MANTLE,
            alpha,
          });
        if (side === 2)
          g.rect(0, 0, this.w, thickness).fill({ color: C_MANTLE, alpha });
        if (side === 3)
          g.rect(0, this.h - thickness, this.w, thickness).fill({
            color: C_MANTLE,
            alpha,
          });
      }
    }
  }

  private drawConnections(g: Graphics): void {
    for (let i = 0; i < this.orbs.length; i++) {
      for (let j = i + 1; j < this.orbs.length; j++) {
        const a = this.orbs[i];
        const b = this.orbs[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > CONNECTION_DIST) continue;

        const t = 1 - dist / CONNECTION_DIST;
        const alpha = t * t;
        const color = t > 0.5 ? a.color : b.color;

        // Glow line
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ width: 3, color, alpha: alpha * 0.1 });
        // Core line
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ width: 0.8, color, alpha: alpha * 0.5 });
      }
    }
  }

  private drawSparks(g: Graphics): void {
    for (const s of this.sparks) {
      const t = s.life / s.maxLife;
      const alpha = t * t;

      // Trail
      for (let i = 1; i < s.trail.length; i++) {
        const tt = (i / s.trail.length) * alpha;
        const prev = s.trail[i - 1];
        const curr = s.trail[i];
        g.moveTo(prev.x, prev.y)
          .lineTo(curr.x, curr.y)
          .stroke({ width: s.radius * tt, color: s.color, alpha: tt * 0.7 });
      }

      // Core spark
      g.circle(s.x, s.y, s.radius * (0.5 + t * 0.5)).fill({
        color: s.color,
        alpha: alpha * 0.9,
      });
      g.circle(s.x, s.y, s.radius * 2.5 * t).fill({
        color: s.color,
        alpha: alpha * 0.15,
      });
    }
  }

  private drawOrbs(g: Graphics): void {
    for (const orb of this.orbs) {
      const pulse =
        0.85 + 0.15 * Math.sin(this.time * orb.pulseSpeed + orb.pulsePhase);
      const r = orb.radius * pulse;

      // Outer halo
      g.circle(orb.x, orb.y, r * 5.5).fill({ color: orb.color, alpha: 0.04 });
      g.circle(orb.x, orb.y, r * 3.5).fill({ color: orb.color, alpha: 0.09 });
      g.circle(orb.x, orb.y, r * 2).fill({ color: orb.color, alpha: 0.2 });

      // Core
      g.circle(orb.x, orb.y, r).fill({ color: orb.color, alpha: 0.95 });

      // Bright specular dot
      g.circle(orb.x - r * 0.28, orb.y - r * 0.28, r * 0.35).fill({
        color: 0xffffff,
        alpha: 0.55,
      });

      // Outer rim for depth
      g.circle(orb.x, orb.y, r).stroke({
        width: 0.8,
        color: C_OVERLAY0,
        alpha: 0.15,
      });
    }
  }
}
