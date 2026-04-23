import type { Ticker } from "pixi.js";
import { Container, Graphics, FillGradient, BlurFilter } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CRUST = 0x11111b;
const MANTLE = 0x181825;
const MAUVE = 0xcba6f7;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const SKY = 0x89dceb;

// ── Configuration ─────────────────────────────────────────────────────────────
const TEXT_PARTICLE_STEP = 10;
const RETURN_FORCE = 0.05; // Spring force back to home
const FRICTION = 0.93; // Viscosity
const JITTER = 0.05;

// Molecular Forces
const COHESION_DIST = 18;
const COHESION_STRENGTH = 0.08;
const REPULSION_DIST = 12;
const REPULSION_STRENGTH = 0.2;

// Hydrodynamic Surface
const WAVE_LAYERS = [
  { freq: 0.004, amp: 10, speed: 0.8 },
  { freq: 0.008, amp: 5, speed: 1.5 },
  { freq: 0.012, amp: 3, speed: 2.5 },
];

// Background
const BG_PARTICLE_N = 120;
const BG_VORTEX_STRENGTH = 0.02;
const BG_DRIFT_SPEED = 0.4;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  radius: number;
  alpha: number;
  color: number;
  glow: number;
}

interface BgParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: number;
  depth: number; // 0 to 1
  angle: number;
}

export class WorxbendMolecularScreen extends Container {
  public static assetBundles: string[] = ["main"];

  private readonly bgGfx = new Graphics();
  private readonly bgBlurGfx = new Graphics();
  private readonly textGfx = new Graphics();
  private readonly membraneGfx = new Graphics();

  private textParticles: Particle[] = [];
  private bgParticles: BgParticle[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;
  private bgGradient: FillGradient | null = null;
  private blurFilter = new BlurFilter();

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.bgBlurGfx);
    this.addChild(this.membraneGfx);
    this.addChild(this.textGfx);

    this.blurFilter.blur = 4;
    this.bgBlurGfx.filters = [this.blurFilter];
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
    this._initBgParticles();
    this._initTextParticles();
  }

  private _initBgParticles(): void {
    this.bgParticles = [];
    for (let i = 0; i < BG_PARTICLE_N; i++) {
      this.bgParticles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: 0,
        vy: 0,
        radius: 1 + Math.random() * 3,
        alpha: 0.1 + Math.random() * 0.3,
        color: Math.random() > 0.5 ? BLUE : SAPPHIRE,
        depth: Math.random(),
        angle: Math.random() * Math.PI * 2,
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
            x: x + (Math.random() - 0.5) * 50,
            y: y + (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            homeX: x,
            homeY: y,
            radius: 1.5 + Math.random() * 1.5,
            alpha: 0.8 + Math.random() * 0.2,
            color: Math.random() > 0.7 ? MAUVE : SKY,
            glow: 0.5 + Math.random() * 0.5,
          });
        }
      }
    }
  }

  private _getSurfaceDisplacement(
    x: number,
    y: number,
  ): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    for (const layer of WAVE_LAYERS) {
      const angle =
        this.time * layer.speed + x * layer.freq + y * layer.freq * 0.5;
      dx += Math.cos(angle) * layer.amp;
      dy += Math.sin(angle) * layer.amp;
    }
    return { dx, dy };
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this.bgGfx.clear();
    this.bgBlurGfx.clear();
    this.membraneGfx.clear();
    this.textGfx.clear();

    // 1. Background Fill
    if (this.bgGradient) {
      this.bgGfx.rect(0, 0, this.w, this.h).fill(this.bgGradient);
    }

    // 2. Background Particles (Vortex tracers)
    const centerX = this.w / 2;
    const centerY = this.h / 2;

    for (const p of this.bgParticles) {
      // Vortex movement
      const dxCenter = p.x - centerX;
      const dyCenter = p.y - centerY;
      const distCenter =
        Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter) || 1;

      // Tangential force
      const tx = -dyCenter / distCenter;
      const ty = dxCenter / distCenter;

      // Base drift + Vortex + Depth scale
      const speedScale = 1.5 - p.depth; // Deeper = slower
      p.vx =
        (tx * BG_VORTEX_STRENGTH * distCenter * 0.1 + BG_DRIFT_SPEED) *
        speedScale;
      p.vy = ty * BG_VORTEX_STRENGTH * distCenter * 0.1 * speedScale;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap around
      if (p.x < -100) p.x = this.w + 100;
      if (p.x > this.w + 100) p.x = -100;
      if (p.y < -100) p.y = this.h + 100;
      if (p.y > this.h + 100) p.y = -100;

      // Bokeh effect: deeper = more blurred and smaller/dimmer
      const bokehAlpha = p.alpha * (1 - p.depth * 0.5);
      const bokehRadius = p.radius * (1 - p.depth * 0.3);

      if (p.depth > 0.5) {
        this.bgBlurGfx.circle(p.x, p.y, bokehRadius);
        this.bgBlurGfx.fill({ color: p.color, alpha: bokehAlpha });
      } else {
        this.bgGfx.circle(p.x, p.y, bokehRadius);
        this.bgGfx.fill({ color: p.color, alpha: bokehAlpha });
      }
    }

    // 3. Text Particles
    for (let i = 0; i < this.textParticles.length; i++) {
      const p = this.textParticles[i];

      // A. Surface displacement (Partial submerge distortion)
      const disp = this._getSurfaceDisplacement(p.homeX, p.homeY);
      const targetX = p.homeX + disp.dx;
      const targetY = p.homeY + disp.dy;

      // B. Spring to target
      const dxHome = targetX - p.x;
      const dyHome = targetY - p.y;
      p.vx += dxHome * RETURN_FORCE * dt;
      p.vy += dyHome * RETURN_FORCE * dt;

      // C. Inter-particle forces (Molecular lattice)
      // We only check a few neighbors for performance
      const checkRange = 15;
      const start = Math.max(0, i - checkRange);
      const end = Math.min(this.textParticles.length, i + checkRange);

      for (let j = start; j < end; j++) {
        if (i === j) continue;
        const p2 = this.textParticles[j];
        const dx = p2.x - p.x;
        const dy = p2.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < COHESION_DIST * COHESION_DIST) {
          const dist = Math.sqrt(distSq) || 0.1;

          // Cohesion (Membrane pull)
          const pull = (dist - COHESION_DIST * 0.8) * COHESION_STRENGTH;
          p.vx += (dx / dist) * pull * dt;
          p.vy += (dy / dist) * pull * dt;

          // Repulsion (Micro-buffer)
          if (dist < REPULSION_DIST) {
            const push = (REPULSION_DIST - dist) * REPULSION_STRENGTH;
            p.vx -= (dx / dist) * push * dt;
            p.vy -= (dy / dist) * push * dt;
          }

          // Visual membrane
          const alpha = (1 - dist / COHESION_DIST) * 0.2;
          this.membraneGfx.moveTo(p.x, p.y);
          this.membraneGfx.lineTo(p2.x, p2.y);
          this.membraneGfx.stroke({ color: p.color, width: 1, alpha });
        }
      }

      // D. Physics integration
      p.vx *= FRICTION;
      p.vy *= FRICTION;
      p.vx += (Math.random() - 0.5) * JITTER;
      p.vy += (Math.random() - 0.5) * JITTER;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // E. Drawing with glow
      const flicker = Math.sin(this.time * 5 + i * 0.5) * 0.15;
      const glowAlpha = p.alpha * (0.8 + flicker);
      this.textGfx.circle(p.x, p.y, p.radius);
      this.textGfx.fill({ color: p.color, alpha: glowAlpha });

      // Optional: Add a second pass for core brightness
      this.textGfx.circle(p.x, p.y, p.radius * 0.4);
      this.textGfx.fill({ color: 0xffffff, alpha: glowAlpha * 0.9 });
    }
  }
}
