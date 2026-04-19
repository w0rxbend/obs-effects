import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG     = 0x11111b;
const GM     = 420_000;   // G × M_star (tuned so orbits fit on screen)
const TRAIL  = 120;       // positions kept per planet trail

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  mass: number;
  radius: number;
  color: number;
  trail: Array<[number, number]>;
  hostIdx: number;  // -1 = star, ≥0 = index of host planet
}

// Planet definitions: [orbital_radius, color, n_moons]
const PLANET_DEFS: [number, number, number][] = [
  [ 95,  0xf38ba8, 1],
  [165,  0xfab387, 2],
  [255,  0x89b4fa, 3],
  [365,  0xa6e3a1, 1],
  [490,  0xcba6f7, 2],
];

const N_DEBRIS    = 200;
const DEBRIS_R    = [290, 330] as const; // inner/outer radius of debris ring

export class OrbitalMechanicsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;

  private planets: Particle[]    = [];
  private moons: Particle[]      = [];
  private debris: Particle[]     = [];

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
    this.planets = [];
    this.moons   = [];
    this.debris  = [];
    const cx = this.w / 2;
    const cy = this.h / 2;

    for (let pi = 0; pi < PLANET_DEFS.length; pi++) {
      const [r, color, nMoons] = PLANET_DEFS[pi];
      const angle0 = Math.random() * Math.PI * 2;
      const vCirc  = Math.sqrt(GM / r);
      // Slight eccentricity: give 90–115 % of circular velocity
      const vScale = 0.90 + Math.random() * 0.25;
      const planet: Particle = {
        x: cx + r * Math.cos(angle0),
        y: cy + r * Math.sin(angle0),
        vx: -Math.sin(angle0) * vCirc * vScale,
        vy:  Math.cos(angle0) * vCirc * vScale,
        mass: 3 + pi,
        radius: 5 + pi,
        color,
        trail: [],
        hostIdx: -1,
      };
      this.planets.push(planet);

      // Moons
      for (let m = 0; m < nMoons; m++) {
        const mr    = 18 + m * 14;
        const mang  = Math.random() * Math.PI * 2;
        const mvOrb = Math.sqrt((GM / (r * r)) * mr) * 0.6; // approx local g
        const moon: Particle = {
          x:  planet.x + mr * Math.cos(mang),
          y:  planet.y + mr * Math.sin(mang),
          vx: planet.vx - Math.sin(mang) * mvOrb,
          vy: planet.vy + Math.cos(mang) * mvOrb,
          mass: 0.3,
          radius: 2.5,
          color: 0x9399b2,  // Catppuccin overlay
          trail: [],
          hostIdx: pi,
        };
        this.moons.push(moon);
      }
    }

    // Debris ring
    for (let i = 0; i < N_DEBRIS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = DEBRIS_R[0] + Math.random() * (DEBRIS_R[1] - DEBRIS_R[0]);
      const vCirc = Math.sqrt(GM / r) * (0.97 + Math.random() * 0.06);
      this.debris.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: -Math.sin(angle) * vCirc,
        vy:  Math.cos(angle) * vCirc,
        mass: 0.01,
        radius: 1,
        color: 0x7f849c,
        trail: [],
        hostIdx: -1,
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.033);
    const cx = this.w / 2;
    const cy = this.h / 2;

    const stepFn = (p: Particle, useHostGrav: boolean): void => {
      // Gravity from central star
      const dx  = cx - p.x;
      const dy  = cy - p.y;
      const r2  = dx * dx + dy * dy + 1;
      const r   = Math.sqrt(r2);
      const acc = GM / r2;
      let ax = (dx / r) * acc;
      let ay = (dy / r) * acc;

      // Additional gravity from host planet (for moons)
      if (useHostGrav && p.hostIdx >= 0) {
        const host = this.planets[p.hostIdx];
        const hx   = host.x - p.x;
        const hy   = host.y - p.y;
        const hr2  = hx * hx + hy * hy + 1;
        const hr   = Math.sqrt(hr2);
        const hAcc = GM * host.mass * 0.08 / hr2; // scaled planet grav
        ax += (hx / hr) * hAcc;
        ay += (hy / hr) * hAcc;
      }

      p.vx += ax * dt;
      p.vy += ay * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
    };

    for (const p of this.planets) {
      if (p.trail.length >= TRAIL) p.trail.shift();
      p.trail.push([p.x, p.y]);
      stepFn(p, false);
    }
    for (const m of this.moons)  stepFn(m, true);
    for (const d of this.debris) stepFn(d, false);

    this.draw(cx, cy);
  }

  private draw(cx: number, cy: number): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Orbital guide circles (faint)
    for (const [r] of PLANET_DEFS) {
      g.circle(cx, cy, r).stroke({ width: 0.4, color: 0x313244, alpha: 0.5 });
    }
    g.circle(cx, cy, (DEBRIS_R[0] + DEBRIS_R[1]) / 2)
      .stroke({ width: DEBRIS_R[1] - DEBRIS_R[0], color: 0x45475a, alpha: 0.08 });

    // Debris
    for (const d of this.debris) {
      g.circle(d.x, d.y, 1).fill({ color: d.color, alpha: 0.55 });
    }

    // Planet trails
    for (const p of this.planets) {
      if (p.trail.length < 2) continue;
      for (let i = 1; i < p.trail.length; i++) {
        const t = i / p.trail.length;
        g.moveTo(p.trail[i - 1][0], p.trail[i - 1][1])
          .lineTo(p.trail[i][0], p.trail[i][1])
          .stroke({ width: 1, color: p.color, alpha: t * 0.5 });
      }
    }

    // Moons
    for (const m of this.moons) {
      g.circle(m.x, m.y, m.radius * 2).fill({ color: m.color, alpha: 0.1 });
      g.circle(m.x, m.y, m.radius    ).fill({ color: m.color, alpha: 0.85 });
    }

    // Planets
    for (const p of this.planets) {
      g.circle(p.x, p.y, p.radius * 3).fill({ color: p.color, alpha: 0.08 });
      g.circle(p.x, p.y, p.radius * 1.6).fill({ color: p.color, alpha: 0.18 });
      g.circle(p.x, p.y, p.radius    ).fill({ color: p.color, alpha: 1.0  });
    }

    // Central star
    for (let i = 6; i >= 1; i--) {
      g.circle(cx, cy, i * 12).fill({ color: 0xfdf4d3, alpha: 0.04 / i });
    }
    g.circle(cx, cy, 14).fill({ color: 0xfdf4d3, alpha: 1.0 });
    g.circle(cx, cy,  7).fill({ color: 0xffffff, alpha: 1.0 });
  }
}
