import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

// SPH parameters
const N          = 500;
const H          = 28;     // smoothing length (px)
const H2         = H * H;
const MASS       = 1.0;
const RHO_0      = 4.5;    // rest density
const K_PRESS    = 220;    // pressure stiffness
const MU_VISC    = 0.4;    // viscosity
const GRAVITY    = 30;     // downward px/s²
const COLLISION_V = 85;    // blob approach speed
const RESET_T    = 18;     // seconds before restart

// Spatial grid cell size = H
const CELL = H;

// 2D SPH kernels (normalised for 2D)
const W_POLY6_C    = 4  / (Math.PI * H2 * H2 * H2 * H2);  // = 4/(π h^8)
const W_SPIKY_C    = -30 / (Math.PI * H2 * H2 * H);        // = -30/(π h^5)
const W_VISC_C     = 20  / (3 * Math.PI * H2 * H2 * H);    // = 20/(3π h^5)

function wPoly6(r2: number): number {
  if (r2 >= H2) return 0;
  const x = H2 - r2;
  return W_POLY6_C * x * x * x;
}

function wSpikyGrad(r: number): number { // returns magnitude of ∇W_spiky / |r_vec|
  if (r <= 0 || r >= H) return 0;
  const x = H - r;
  return W_SPIKY_C * x * x / r;  // ∇W = grad * r_vec
}

function wViscLap(r: number): number {
  if (r < 0 || r >= H) return 0;
  return W_VISC_C * (H - r);
}

interface SPHParticle {
  x: number; y: number;
  vx: number; vy: number;
  density: number;
  pressure: number;
}

export class SPHScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time    = 0;
  private cycleT  = 0;

  private particles: SPHParticle[] = [];
  private grid = new Map<number, number[]>();

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void { this.w = w; this.h = h; this.init(); }

  private init(): void {
    this.particles = [];
    this.cycleT    = 0;
    const cx  = this.w / 2;
    const cy  = this.h / 2;
    const n2  = N / 2;
    const br  = 90;  // blob radius

    for (let i = 0; i < n2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = br * Math.sqrt(Math.random());
      this.particles.push({
        x: cx - 220 + r * Math.cos(angle),
        y: cy        + r * Math.sin(angle),
        vx:  COLLISION_V, vy: (Math.random() - 0.5) * 15,
        density: 0, pressure: 0,
      });
    }
    for (let i = 0; i < n2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = br * Math.sqrt(Math.random());
      this.particles.push({
        x: cx + 220 + r * Math.cos(angle),
        y: cy        + r * Math.sin(angle),
        vx: -COLLISION_V, vy: (Math.random() - 0.5) * 15,
        density: 0, pressure: 0,
      });
    }
  }

  private cellKey(x: number, y: number): number {
    return Math.floor(x / CELL) * 100000 + Math.floor(y / CELL);
  }

  private buildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.particles.length; i++) {
      const k = this.cellKey(this.particles[i].x, this.particles[i].y);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(i);
    }
  }

  private neighborIndices(px: number, py: number): number[] {
    const cx    = Math.floor(px / CELL);
    const cy2   = Math.floor(py / CELL);
    const res: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.grid.get((cx + dx) * 100000 + (cy2 + dy));
        if (cell) for (const idx of cell) res.push(idx);
      }
    }
    return res;
  }

  public update(ticker: Ticker): void {
    const dt    = Math.min(ticker.deltaMS * 0.001, 0.016);
    this.time  += dt;
    this.cycleT += dt;

    if (this.cycleT > RESET_T) this.init();

    this.buildGrid();

    // 1. Compute densities
    for (let i = 0; i < this.particles.length; i++) {
      const p   = this.particles[i];
      let rho   = 0;
      for (const j of this.neighborIndices(p.x, p.y)) {
        const q  = this.particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        rho += MASS * wPoly6(dx * dx + dy * dy);
      }
      p.density  = rho;
      p.pressure = K_PRESS * (rho - RHO_0);
    }

    // 2. Compute forces and integrate
    for (let i = 0; i < this.particles.length; i++) {
      const p  = this.particles[i];
      let fx = 0;
      let fy = GRAVITY * MASS;

      if (p.density > 0.001) {
        for (const j of this.neighborIndices(p.x, p.y)) {
          if (i === j) continue;
          const q  = this.particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const r2 = dx * dx + dy * dy;
          if (r2 >= H2 || r2 < 0.0001) continue;
          const r  = Math.sqrt(r2);

          // Pressure force
          const pAvg = (p.pressure / (p.density * p.density) +
                        q.pressure / (q.density * q.density + 0.001));
          const sg   = wSpikyGrad(r);
          fx += -MASS * pAvg * sg * dx;
          fy += -MASS * pAvg * sg * dy;

          // Viscosity force
          const lap = wViscLap(r);
          const qd  = Math.max(q.density, 0.001);
          fx += MU_VISC * MASS * (q.vx - p.vx) / qd * lap;
          fy += MU_VISC * MASS * (q.vy - p.vy) / qd * lap;
        }
      }

      // Integrate velocity + position
      p.vx += (fx / Math.max(p.density, 0.5)) * dt;
      p.vy += (fy / Math.max(p.density, 0.5)) * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;

      // Elastic walls
      const margin = H;
      if (p.x < margin)          { p.x = margin;          p.vx *= -0.4; }
      if (p.x > this.w - margin) { p.x = this.w - margin; p.vx *= -0.4; }
      if (p.y < margin)          { p.y = margin;           p.vy *= -0.4; }
      if (p.y > this.h - margin) { p.y = this.h - margin;  p.vy *= -0.4; }
    }

    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    for (const p of this.particles) {
      // Color by density: sparse=deep blue, medium=mauve, dense=white/yellow
      const d  = Math.max(0, Math.min(p.density / (RHO_0 * 2.5), 1));
      let r: number, gr: number, b: number;
      if (d < 0.5) {
        const t = d * 2;
        r  = Math.round(137 + (203 - 137) * t);   // blue → mauve
        gr = Math.round(180 + (166 - 180) * t);
        b  = Math.round(250 + (250 - 250) * t);
      } else {
        const t = (d - 0.5) * 2;
        r  = Math.round(203 + (255 - 203) * t);   // mauve → white
        gr = Math.round(166 + (255 - 166) * t);
        b  = Math.round(250 + (200 - 250) * t);
      }
      const color = (r << 16) | (gr << 8) | b;
      const alpha = 0.35 + d * 0.65;

      g.circle(p.x, p.y, 3.5).fill({ color, alpha: alpha * 0.12 });
      g.circle(p.x, p.y, 1.8).fill({ color, alpha });
    }
  }
}
