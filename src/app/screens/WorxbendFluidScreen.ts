import type { Ticker } from "pixi.js";
import { Container, Graphics, FillGradient } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CRUST = 0x11111b;
const MANTLE = 0x181825;
const MAUVE = 0xcba6f7;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const SKY = 0x89dceb;

// ── Configuration ─────────────────────────────────────────────────────────────
const TEXT_PARTICLE_STEP = 10; // Denser for more "liquid" feel
const RETURN_STRENGTH = 0.04; 
const DAMPING = 0.94; // Viscous friction
const SPRING_OVERSHOOT = 0.08;

const BOND_DIST = 12;
const BOND_STRENGTH = 0.03;
const MAX_BOND_RANGE = 20;
const COHESION_DIST = 15;

const BG_PARTICLE_N = 120; // More for richer depth
const BG_MAX_RADIUS = 3.5;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  radius: number;
  baseRadius: number;
  alpha: number;
  color: number;
  phase: number;
  uniqueSeed: number;
}

interface BgParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: number;
  z: number; // For depth/bokeh effect
}

interface Vortex {
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export class WorxbendFluidScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx = new Graphics();
  private readonly cohesionGfx = new Graphics();
  private readonly textGfx = new Graphics();

  private textParticles: Particle[] = [];
  private bgParticles: BgParticle[] = [];
  private vortices: Vortex[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;
  private bgGradient: FillGradient | null = null;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.cohesionGfx);
    this.addChild(this.textGfx);
  }

  public async show(): Promise<void> {
    this._initElements();
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;

    this.bgGradient = new FillGradient(0, 0, 0, height);
    this.bgGradient.addColorStop(0, CRUST);
    this.bgGradient.addColorStop(1, MANTLE);

    this._initElements();
  }

  private _initElements(): void {
    this._initVortices();
    this._initBgParticles();
    this._initTextParticles();
  }

  private _initVortices(): void {
    this.vortices = [
      { x: this.w * 0.25, y: this.h * 0.5, strength: 0.5, radius: 400 },
      { x: this.w * 0.75, y: this.h * 0.5, strength: -0.4, radius: 500 },
      { x: this.w * 0.5, y: this.h * 0.2, strength: 0.3, radius: 300 },
      { x: this.w * 0.5, y: this.h * 0.8, strength: -0.3, radius: 300 },
    ];
  }

  private _initBgParticles(): void {
    this.bgParticles = [];
    for (let i = 0; i < BG_PARTICLE_N; i++) {
      const z = Math.random(); // 0 = far, 1 = near
      this.bgParticles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: 0,
        vy: 0,
        radius: 0.5 + z * BG_MAX_RADIUS,
        alpha: 0.05 + z * 0.15,
        color: Math.random() > 0.6 ? SAPPHIRE : BLUE,
        z: z,
      });
    }
  }

  private _initTextParticles(): void {
    const text = "WORXBEND";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = this.w;
    canvas.height = this.h;

    const fontSize = 320;
    // Using Silkscreen as requested, bold for better particle density
    ctx.font = `bold ${fontSize}px Silkscreen, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText(text, this.w / 2, this.h / 2);

    const imageData = ctx.getImageData(0, 0, this.w, this.h).data;
    this.textParticles = [];

    for (let y = 0; y < this.h; y += TEXT_PARTICLE_STEP) {
      for (let x = 0; x < this.w; x += TEXT_PARTICLE_STEP) {
        const i = (y * this.w + x) * 4;
        if (imageData[i] > 128) {
          this.textParticles.push({
            x: x + (Math.random() - 0.5) * 30,
            y: y + (Math.random() - 0.5) * 30,
            vx: 0,
            vy: 0,
            homeX: x,
            homeY: y,
            radius: 1.5,
            baseRadius: 1.5 + Math.random() * 1.5,
            alpha: 0.7 + Math.random() * 0.3,
            color: Math.random() > 0.85 ? MAUVE : BLUE,
            phase: Math.random() * Math.PI * 2,
            uniqueSeed: Math.random() * 1000,
          });
        }
      }
    }
  }

  /**
   * Complex displacement field combining multiple waves for interference
   */
  private _getDisplacement(x: number, y: number, time: number) {
    // Large slow swell
    const w1 = Math.sin(x * 0.0015 + y * 0.001 + time * 0.4);
    // Medium cross-ripple
    const w2 = Math.sin(x * 0.004 - y * 0.003 + time * 1.1 + 2.0);
    // Small sharp interference
    const w3 = Math.sin(x * 0.012 + y * 0.015 + time * 2.3 + 4.5);

    const combined = w1 * 0.6 + w2 * 0.3 + w3 * 0.1;
    // Interference intensity (shimmer)
    const shimmer = Math.pow(Math.abs(w1 * w2), 2) * 2.0 + Math.abs(w3) * 0.5;

    return {
      height: combined, // -1 to 1
      shimmer: shimmer,
      dx: w1 * 12 + w2 * 5,
      dy: w1 * 8 + w3 * 4
    };
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this.bgGfx.clear();
    this.cohesionGfx.clear();
    this.textGfx.clear();

    if (this.bgGradient) {
      this.bgGfx.rect(0, 0, this.w, this.h).fill(this.bgGradient);
    }

    // 1. Background Particles (Vortex & Flow)
    for (const p of this.bgParticles) {
      let flowX = 0.2 * (1 + p.z);
      let flowY = 0.1 * (1 + p.z);

      // Apply Vortex forces
      for (const v of this.vortices) {
        const dx = p.x - v.x;
        const dy = p.y - v.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < v.radius * v.radius) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / v.radius) * v.strength;
          // Tangential velocity (spiral)
          flowX += (-dy / dist) * force * 2;
          flowY += (dx / dist) * force * 2;
        }
      }

      p.vx += (flowX - p.vx) * 0.05 * dt;
      p.vy += (flowY - p.vy) * 0.05 * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap around with soft fade potential (using screen margins)
      if (p.x < -50) p.x = this.w + 50;
      if (p.x > this.w + 50) p.x = -50;
      if (p.y < -50) p.y = this.h + 50;
      if (p.y > this.h + 50) p.y = -50;

      // Bokeh effect: deeper particles are softer and slower
      this.bgGfx.circle(p.x, p.y, p.radius);
      this.bgGfx.fill({ color: p.color, alpha: p.alpha });
    }

    // 2. Text Particles (Submerged Displacement)
    const driftX = Math.sin(this.time * 0.1) * 10;
    const driftY = Math.cos(this.time * 0.08) * 15;

    for (let i = 0; i < this.textParticles.length; i++) {
      const p = this.textParticles[i];
      const disp = this._getDisplacement(p.homeX, p.homeY, this.time);

      // Submerged effect: text swells and distorts with wave height
      const targetRadius = p.baseRadius * (1 + disp.height * 0.4 + disp.shimmer * 0.2);
      p.radius += (targetRadius - p.radius) * 0.1 * dt;

      // Displacement logic
      const targetX = p.homeX + disp.dx + driftX;
      const targetY = p.homeY + disp.dy + driftY;

      // Viscous Spring Physics (Overshoot & Bounce)
      const ax = (targetX - p.x) * RETURN_STRENGTH;
      const ay = (targetY - p.y) * RETURN_STRENGTH;

      p.vx += ax * dt;
      p.vy += ay * dt;

      // Spring overshoot logic
      p.vx += (targetX - p.x) * SPRING_OVERSHOOT * disp.shimmer * 0.1;
      p.vy += (targetY - p.y) * SPRING_OVERSHOOT * disp.shimmer * 0.1;

      // Fluid Turbulence (Micro-shimmer)
      if (disp.shimmer > 1.0) {
        p.vx += (Math.random() - 0.5) * disp.shimmer * 0.5;
        p.vy += (Math.random() - 0.5) * disp.shimmer * 0.5;
      }

      // Lattice Coordination (Near-neighbor bonding)
      const step = 8; // Check a small window of neighbors
      const start = Math.max(0, i - step);
      const end = Math.min(this.textParticles.length, i + step);
      for (let j = start; j < end; j++) {
        if (i === j) continue;
        const p2 = this.textParticles[j];
        const dx = p2.x - p.x;
        const dy = p2.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < MAX_BOND_RANGE * MAX_BOND_RANGE) {
          const dist = Math.sqrt(distSq);
          const diff = dist - BOND_DIST;
          p.vx += (dx / dist) * diff * BOND_STRENGTH * dt;
          p.vy += (dy / dist) * diff * BOND_STRENGTH * dt;

          if (dist < COHESION_DIST) {
            const alpha = (1 - dist / COHESION_DIST) * 0.15 * (0.5 + disp.shimmer * 0.5);
            this.cohesionGfx.moveTo(p.x, p.y);
            this.cohesionGfx.lineTo(p2.x, p2.y);
            this.cohesionGfx.stroke({ color: p.color, width: 1, alpha });
          }
        }
      }

      // Integration with Viscosity
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Render with shimmer-influenced brightness
      const finalAlpha = Math.min(1.0, p.alpha * (1 + disp.shimmer * 0.3));
      const color = disp.shimmer > 1.5 ? SKY : p.color;

      this.textGfx.circle(p.x, p.y, p.radius);
      this.textGfx.fill({ color: color, alpha: finalAlpha });
    }
  }
}
