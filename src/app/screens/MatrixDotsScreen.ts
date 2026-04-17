import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Crust / Mocha palette ─────────────────────────────────────────
const C_CRUST     = 0x11111b;
const C_MANTLE    = 0x181825;
const C_BASE      = 0x1e1e2e;
const C_SURFACE0  = 0x313244;
const C_OVERLAY0  = 0x6c7086;
const C_SUBTEXT   = 0xa6adc8;

const C_ROSEWATER = 0xf5e0dc;
const C_FLAMINGO  = 0xf2cdcd;
const C_PINK      = 0xf5c2e7;
const C_MAUVE     = 0xcba6f7;
const C_RED       = 0xf38ba8;
const C_PEACH     = 0xfab387;
const C_YELLOW    = 0xf9e2af;
const C_GREEN     = 0xa6e3a1;
const C_TEAL      = 0x94e2d5;
const C_SKY       = 0x89dceb;
const C_SAPPHIRE  = 0x74c7ec;
const C_BLUE      = 0x89b4fa;
const C_LAVENDER  = 0xb4befe;

const ACCENT_COLORS = [
  C_ROSEWATER, C_FLAMINGO, C_PINK, C_MAUVE, C_RED,
  C_PEACH, C_YELLOW, C_GREEN, C_TEAL, C_SKY, C_SAPPHIRE, C_BLUE, C_LAVENDER,
];

// ── Config ────────────────────────────────────────────────────────────────────
const DOT_SPACING    = 28;
const DOT_BASE_R     = 1.8;
const DOT_LIT_R      = 3.8;
const DOT_BASE_ALPHA = 0.38;

const PARTICLE_COUNT   = 22;
const PARTICLE_SPEED   = 55;
const PARTICLE_RADIUS  = 5;
const REPEL_DIST       = 120;
const REPEL_STRENGTH   = 3200;

const ACTIVATION_RADIUS = 90;
const FADE_SPEED        = 1.4; // alpha units per second for decay
const NEIGHBOR_SPREAD   = 0.55; // fraction of activation passed to neighbors

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dot {
  col: number;
  row: number;
  x: number;
  y: number;
  color: number;
  alpha: number;   // 0..1, 0 = base grey state
  targetAlpha: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  trail: Array<{ x: number; y: number }>;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class MatrixDotsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;

  private dots: Dot[] = [];
  private dotCols = 0;
  private dotRows = 0;

  private particles: Particle[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.buildDotGrid();
    this.spawnParticles();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.buildDotGrid();
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  private buildDotGrid(): void {
    this.dots = [];
    const cols = Math.ceil(this.w / DOT_SPACING) + 1;
    const rows = Math.ceil(this.h / DOT_SPACING) + 1;
    this.dotCols = cols;
    this.dotRows = rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.dots.push({
          col: c,
          row: r,
          x: c * DOT_SPACING,
          y: r * DOT_SPACING,
          color: C_OVERLAY0,
          alpha: 0,
          targetAlpha: 0,
        });
      }
    }
  }

  private dotIndex(col: number, row: number): number {
    if (col < 0 || col >= this.dotCols || row < 0 || row >= this.dotRows) return -1;
    return row * this.dotCols + col;
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = PARTICLE_SPEED * (0.5 + Math.random());
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
        trail: [],
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;

    this.tickParticles(dt);
    this.applyRepulsion(dt);
    this.activateDots();
    this.fadeDots(dt);
    this.draw();
  }

  private tickParticles(dt: number): void {
    for (const p of this.particles) {
      // Record trail position
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap around canvas
      if (p.x < -PARTICLE_RADIUS)  p.x += this.w + PARTICLE_RADIUS * 2;
      if (p.x > this.w + PARTICLE_RADIUS) p.x -= this.w + PARTICLE_RADIUS * 2;
      if (p.y < -PARTICLE_RADIUS)  p.y += this.h + PARTICLE_RADIUS * 2;
      if (p.y > this.h + PARTICLE_RADIUS) p.y -= this.h + PARTICLE_RADIUS * 2;
    }
  }

  private applyRepulsion(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;

        if (dist2 < 1) continue;
        if (dist2 > REPEL_DIST * REPEL_DIST) continue;

        const dist = Math.sqrt(dist2);
        const force = REPEL_STRENGTH / dist2;
        const nx = dx / dist;
        const ny = dy / dist;

        a.vx += nx * force * dt;
        a.vy += ny * force * dt;
        b.vx -= nx * force * dt;
        b.vy -= ny * force * dt;

        // Clamp speed to keep things from blowing up
        const maxSpd = PARTICLE_SPEED * 3.5;
        const asp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        if (asp > maxSpd) { a.vx = (a.vx / asp) * maxSpd; a.vy = (a.vy / asp) * maxSpd; }
        const bsp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (bsp > maxSpd) { b.vx = (b.vx / bsp) * maxSpd; b.vy = (b.vy / bsp) * maxSpd; }
      }
    }
  }

  private activateDots(): void {
    for (const p of this.particles) {
      const col0 = Math.round(p.x / DOT_SPACING);
      const row0 = Math.round(p.y / DOT_SPACING);
      const reach = Math.ceil(ACTIVATION_RADIUS / DOT_SPACING) + 1;

      for (let dr = -reach; dr <= reach; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          const idx = this.dotIndex(col0 + dc, row0 + dr);
          if (idx < 0) continue;
          const dot = this.dots[idx];
          const ddx = dot.x - p.x;
          const ddy = dot.y - p.y;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist > ACTIVATION_RADIUS) continue;

          // Activation falls off with distance (1 at center, 0 at radius)
          const strength = Math.pow(1 - dist / ACTIVATION_RADIUS, 1.8);

          if (strength > 0.01) {
            // Primary activation
            if (strength > dot.targetAlpha) {
              dot.color = p.color;
              dot.targetAlpha = Math.min(1, strength);
            }

            // Neighbor cascade — each activated dot lights its grid neighbors slightly
            if (strength > 0.35) {
              const neighborAlpha = strength * NEIGHBOR_SPREAD;
              const neighbors = [
                this.dotIndex(dot.col - 1, dot.row),
                this.dotIndex(dot.col + 1, dot.row),
                this.dotIndex(dot.col, dot.row - 1),
                this.dotIndex(dot.col, dot.row + 1),
                this.dotIndex(dot.col - 1, dot.row - 1),
                this.dotIndex(dot.col + 1, dot.row - 1),
                this.dotIndex(dot.col - 1, dot.row + 1),
                this.dotIndex(dot.col + 1, dot.row + 1),
              ];
              for (const ni of neighbors) {
                if (ni < 0) continue;
                const nd = this.dots[ni];
                if (neighborAlpha > nd.targetAlpha) {
                  nd.color = p.color;
                  nd.targetAlpha = neighborAlpha;
                }
              }
            }
          }
        }
      }
    }
  }

  private fadeDots(dt: number): void {
    for (const dot of this.dots) {
      if (dot.targetAlpha > dot.alpha) {
        dot.alpha = Math.min(dot.targetAlpha, dot.alpha + FADE_SPEED * dt * 4);
      } else {
        dot.alpha = Math.max(0, dot.alpha - FADE_SPEED * dt);
        dot.targetAlpha = Math.max(0, dot.targetAlpha - FADE_SPEED * 0.6 * dt);
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.gfx;
    g.clear();

    // Background
    g.rect(0, 0, this.w, this.h).fill({ color: C_CRUST });

    // Subtle vignette
    this.drawVignette(g);

    // Dots
    this.drawDots(g);

    // Connections between lit dots
    this.drawConnections(g);

    // Particle trails + bodies
    this.drawParticles(g);
  }

  private drawVignette(g: Graphics): void {
    // Four corner-fading rectangles to darken edges
    const vSize = Math.min(this.w, this.h) * 0.45;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const alpha = (1 - t) * (1 - t) * 0.22;
        const thickness = vSize * (1 - t);
        if (side === 0) g.rect(0, 0, thickness, this.h).fill({ color: C_MANTLE, alpha });
        if (side === 1) g.rect(this.w - thickness, 0, thickness, this.h).fill({ color: C_MANTLE, alpha });
        if (side === 2) g.rect(0, 0, this.w, thickness).fill({ color: C_MANTLE, alpha });
        if (side === 3) g.rect(0, this.h - thickness, this.w, thickness).fill({ color: C_MANTLE, alpha });
      }
    }
  }

  private drawDots(g: Graphics): void {
    for (const dot of this.dots) {
      if (dot.alpha > 0.005) {
        // Lit dot: colored with glow
        const r = DOT_BASE_R + (DOT_LIT_R - DOT_BASE_R) * dot.alpha;
        // Outer glow
        g.circle(dot.x, dot.y, r * 3.5).fill({ color: dot.color, alpha: dot.alpha * 0.12 });
        g.circle(dot.x, dot.y, r * 2).fill({ color: dot.color, alpha: dot.alpha * 0.22 });
        // Core
        g.circle(dot.x, dot.y, r).fill({ color: dot.color, alpha: DOT_BASE_ALPHA + dot.alpha * (1 - DOT_BASE_ALPHA) });
        // White specular for fully lit dots
        if (dot.alpha > 0.5) {
          g.circle(dot.x, dot.y, r * 0.45).fill({ color: 0xffffff, alpha: dot.alpha * 0.25 });
        }
      } else {
        // Dim grey base dot
        g.circle(dot.x, dot.y, DOT_BASE_R).fill({ color: C_OVERLAY0, alpha: DOT_BASE_ALPHA });
      }
    }
  }

  private drawConnections(g: Graphics): void {
    // Connect each lit dot to its immediate grid neighbors (right + down only to avoid duplicates)
    const CONNECTION_THRESHOLD = 0.08;
    for (const dot of this.dots) {
      if (dot.alpha < CONNECTION_THRESHOLD) continue;

      const neighbors = [
        this.dotIndex(dot.col + 1, dot.row),
        this.dotIndex(dot.col, dot.row + 1),
        this.dotIndex(dot.col + 1, dot.row + 1),
        this.dotIndex(dot.col - 1, dot.row + 1),
      ];

      for (const ni of neighbors) {
        if (ni < 0) continue;
        const nd = this.dots[ni];
        if (nd.alpha < CONNECTION_THRESHOLD) continue;

        const avgAlpha = (dot.alpha + nd.alpha) * 0.5;
        // Blend colors: use the brighter dot's color
        const color = dot.alpha >= nd.alpha ? dot.color : nd.color;

        // Subtle glow line
        g.moveTo(dot.x, dot.y)
          .lineTo(nd.x, nd.y)
          .stroke({ width: 1.8, color, alpha: avgAlpha * 0.12 });

        // Core line
        g.moveTo(dot.x, dot.y)
          .lineTo(nd.x, nd.y)
          .stroke({ width: 0.7, color, alpha: avgAlpha * 0.45 });
      }
    }
  }

  private drawParticles(g: Graphics): void {
    for (const p of this.particles) {
      // Trail
      const tLen = p.trail.length;
      for (let i = 1; i < tLen; i++) {
        const t = i / tLen;
        const alpha = t * t * 0.55;
        const width = t * PARTICLE_RADIUS * 1.2;
        const prev = p.trail[i - 1];
        const curr = p.trail[i];
        g.moveTo(prev.x, prev.y)
          .lineTo(curr.x, curr.y)
          .stroke({ width: Math.max(0.5, width), color: p.color, alpha });
      }

      // Glow halo
      g.circle(p.x, p.y, PARTICLE_RADIUS * 4).fill({ color: p.color, alpha: 0.07 });
      g.circle(p.x, p.y, PARTICLE_RADIUS * 2.2).fill({ color: p.color, alpha: 0.18 });

      // Core body
      g.circle(p.x, p.y, PARTICLE_RADIUS).fill({ color: p.color, alpha: 0.92 });

      // Bright center
      g.circle(p.x, p.y, PARTICLE_RADIUS * 0.45).fill({ color: 0xffffff, alpha: 0.7 });
    }
  }
}
