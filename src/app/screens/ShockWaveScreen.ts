import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

const N_PARTICLES  = 1600;
const GATHER_T     = 4.0;   // seconds gathering before explosion
const HOLD_T       = 0.8;   // pre-explosion glow
const EXPAND_T     = 6.0;   // ejecta flight
const FADE_T       = 2.5;   // fade out
const TOTAL_T      = GATHER_T + HOLD_T + EXPAND_T + FADE_T;

// Shock wave ring
const SHOCK_SPEED  = 420;   // px/s

interface Ejecta {
  x: number; y: number;      // current position
  ox: number; oy: number;    // origin position
  vx: number; vy: number;    // velocity
  speed0: number;            // initial speed
  angle: number;
}

export class ShockWaveScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time    = 0;
  private cycleT  = 0;      // time within current cycle

  private particles: Ejecta[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.reinit();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void { this.w = w; this.h = h; this.reinit(); }

  private reinit(): void {
    this.cycleT = 0;
    const cx    = this.w / 2;
    const cy    = this.h / 2;

    // Particles start scattered near center in a small cloud
    this.particles = [];
    for (let i = 0; i < N_PARTICLES; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const r      = Math.random() * 30;
      const speed0 = 60 + Math.random() * 320;  // ejecta speed varies: inner=fast
      this.particles.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        ox: cx + r * Math.cos(angle),
        oy: cy + r * Math.sin(angle),
        vx: 0, vy: 0,
        speed0,
        angle,
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt     = Math.min(ticker.deltaMS * 0.001, 0.033);
    this.time   += dt;
    this.cycleT += dt;

    if (this.cycleT > TOTAL_T) this.reinit();

    const phase = this.cycleT < GATHER_T ? "gather"
                : this.cycleT < GATHER_T + HOLD_T ? "hold"
                : this.cycleT < GATHER_T + HOLD_T + EXPAND_T ? "expand"
                : "fade";

    const cx = this.w / 2;
    const cy = this.h / 2;

    // Update particles
    if (phase === "gather") {
      const t     = this.cycleT / GATHER_T;
      const drift = 1 - t * t; // slow initial drift slows to rest
      for (const p of this.particles) {
        const dx  = cx - p.x;
        const dy  = cy - p.y;
        const r   = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const pull = 20 * drift;
        p.vx += (dx / r) * pull * dt;
        p.vy += (dy / r) * pull * dt;
        // Damping so they settle
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 2;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
      }
    } else if (phase === "expand") {
      const expandT = this.cycleT - GATHER_T - HOLD_T;
      for (const p of this.particles) {
        if (expandT < 0.05) {
          // Explosion: set velocity on first expand frame
          p.vx = Math.cos(p.angle) * p.speed0;
          p.vy = Math.sin(p.angle) * p.speed0;
        }
        // Decelerate (interstellar medium drag)
        p.vx *= 1 - dt * 0.25;
        p.vy *= 1 - dt * 0.25;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
      }
    }

    // Draw
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const globalAlpha =
      phase === "fade"
        ? Math.max(0, 1 - (this.cycleT - GATHER_T - HOLD_T - EXPAND_T) / FADE_T)
        : 1.0;

    // Ejecta particles
    for (const p of this.particles) {
      const dx   = p.x - cx;
      const dy   = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let color: number;
      let alpha: number;

      if (phase === "gather" || phase === "hold") {
        const tGather = Math.min(this.cycleT / GATHER_T, 1);
        color  = 0xcba6f7; // mauve — contracting cloud
        alpha  = 0.25 + tGather * 0.5;
        alpha *= globalAlpha;
      } else {
        const tExpand = (this.cycleT - GATHER_T - HOLD_T) / EXPAND_T;
        // Color by distance from center: near=white, mid=orange, far=purple
        const distFrac = Math.min(dist / (Math.min(this.w, this.h) * 0.45), 1);
        if (distFrac < 0.35) {
          color = 0xffffff;
        } else if (distFrac < 0.65) {
          color = 0xfab387;  // peach/orange
        } else {
          color = 0xcba6f7;  // mauve/purple
        }
        alpha = (1 - tExpand * 0.6) * globalAlpha * 0.85;
      }

      if (alpha < 0.01) continue;
      g.circle(p.x, p.y, 1.5).fill({ color, alpha });
    }

    // Shock wave ring
    if (phase === "expand" || phase === "fade") {
      const expandT    = this.cycleT - GATHER_T - HOLD_T;
      const shockR     = expandT * SHOCK_SPEED;
      const shockAlpha = Math.max(0, 1 - expandT / EXPAND_T) * globalAlpha;

      if (shockAlpha > 0.01) {
        g.circle(cx, cy, shockR).stroke({ width: 18, color: 0xffffff, alpha: shockAlpha * 0.06 });
        g.circle(cx, cy, shockR).stroke({ width:  6, color: 0x89dceb, alpha: shockAlpha * 0.18 });
        g.circle(cx, cy, shockR).stroke({ width:  1.5, color: 0xffffff, alpha: shockAlpha * 0.8 });
      }
    }

    // Pre-explosion hold: pulsing core glow
    if (phase === "hold" || phase === "gather") {
      const tPulse  = this.time * 5;
      const pulse   = 0.7 + 0.3 * Math.sin(tPulse);
      const coreR   = 8 + (phase === "hold" ? 12 * pulse : 5);

      g.circle(cx, cy, coreR * 5).fill({ color: 0xcba6f7, alpha: 0.04 * pulse });
      g.circle(cx, cy, coreR * 2).fill({ color: 0xf5c2e7, alpha: 0.12 * pulse });
      g.circle(cx, cy, coreR    ).fill({ color: 0xffffff, alpha: 0.9  * pulse });
    }
  }
}
