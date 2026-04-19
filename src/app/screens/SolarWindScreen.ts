import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

// Solar wind particles stream left→right, deflected by planetary magnetosphere
const N_WIND    = 1600;
const WIND_VX   = 145;    // base x-velocity (px/s)
const WIND_LIFE = 16;     // seconds before particle respawns

// Magnetic dipole: planet at screen center
const R_MAG = 130;        // magnetosphere stand-off radius (px)
const B0    = 3_200_000;  // dipole strength (tuned for visible deflection)

// Planet radius (visual + geometric exclusion)
const R_PLANET = 22;

// Sun position: left quarter of screen
const SUN_X_FRAC = 0.05;

interface WindParticle {
  x: number; y: number;
  vx: number; vy: number;
  age: number;
  life: number;
}

export class SolarWindScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private particles: WindParticle[] = [];

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

  private spawn(sunX: number): WindParticle {
    const y    = Math.random() * this.h;
    const vyNoise = (Math.random() - 0.5) * 20;
    return {
      x: sunX,
      y,
      vx: WIND_VX * (0.9 + Math.random() * 0.2),
      vy: vyNoise,
      age: 0,
      life: WIND_LIFE * (0.6 + Math.random() * 0.8),
    };
  }

  private init(): void {
    this.particles = [];
    const sunX = this.w * SUN_X_FRAC;
    for (let i = 0; i < N_WIND; i++) {
      const p    = this.spawn(sunX);
      p.x       += Math.random() * this.w;  // spread across screen at start
      p.age      = Math.random() * p.life;
      this.particles.push(p);
    }
  }

  public update(ticker: Ticker): void {
    const dt   = Math.min(ticker.deltaMS * 0.001, 0.033);
    this.time += dt;

    const cx   = this.w / 2;
    const cy   = this.h / 2;
    const sunX = this.w * SUN_X_FRAC;

    for (const p of this.particles) {
      p.age += dt;
      if (p.age > p.life || p.x > this.w + 20) {
        Object.assign(p, this.spawn(sunX));
        continue;
      }

      // Magnetic dipole field (z-component) from planet at (cx, cy)
      const dx = p.x - cx;
      const dy = p.y - cy;
      const r2 = dx * dx + dy * dy;
      const r  = Math.sqrt(r2);

      if (r > R_PLANET) {
        // 2D dipole: B_z = B0 * (2*cos²θ - 1) / r³  (θ from +x axis = sun direction)
        const cosT  = dx / r;
        const Bz    = B0 * (2 * cosT * cosT - 1) / (r * r * r);

        // Lorentz force: F = q·v×B, projected to 2D (B in z): Fx = vy·Bz, Fy = -vx·Bz
        const charge = 1.0;
        p.vx += charge * p.vy * Bz * dt;
        p.vy -= charge * p.vx * Bz * dt;
      }

      // Bounce off planet surface
      if (r < R_PLANET + 2) {
        const nx = dx / r;
        const ny = dy / r;
        const dot = p.vx * nx + p.vy * ny;
        if (dot < 0) {
          p.vx -= 2 * dot * nx;
          p.vy -= 2 * dot * ny;
        }
        p.x = cx + nx * (R_PLANET + 3);
        p.y = cy + ny * (R_PLANET + 3);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap vertically
      if (p.y < -10) p.y += this.h + 20;
      if (p.y > this.h + 10) p.y -= this.h + 20;
    }

    this.draw(cx, cy, sunX);
  }

  private draw(cx: number, cy: number, sunX: number): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Magnetosphere boundary (faint)
    g.circle(cx, cy, R_MAG).stroke({ width: 1, color: 0xcba6f7, alpha: 0.12 });

    // Solar wind particles
    for (const p of this.particles) {
      // Color: yellow near source, teal in deflected stream, blue in magnetotail
      const dx       = p.x - cx;
      const dy       = p.y - cy;
      const distToP  = Math.sqrt(dx * dx + dy * dy);
      const deflected = distToP < R_MAG * 2.5;
      const behindP   = p.x > cx;

      let r: number, gr: number, b: number;
      if (!deflected) {
        // Raw solar wind: yellow-white
        r = 255; gr = 230; b = 120;
      } else if (behindP) {
        // Magnetotail: cool blue
        r = 100; gr = 180; b = 255;
      } else {
        // Deflecting around: teal-cyan
        r = 80; gr = 220; b = 210;
      }

      const lifeAlpha = Math.min(1, (p.life - p.age) / 2) * 0.7;
      const color = (r << 16) | (gr << 8) | b;
      g.circle(p.x, p.y, 1.5).fill({ color, alpha: lifeAlpha });
    }

    // Planet
    g.circle(cx, cy, R_PLANET * 2.2).fill({ color: 0x89b4fa, alpha: 0.08 });
    g.circle(cx, cy, R_PLANET       ).fill({ color: 0x1e3a5f, alpha: 1.0  });
    g.circle(cx, cy, R_PLANET       ).stroke({ width: 2, color: 0x89b4fa, alpha: 0.6 });

    // Sun (left edge glow)
    for (let i = 5; i >= 1; i--) {
      g.circle(sunX, this.h / 2, i * 28).fill({ color: 0xfdf4d3, alpha: 0.04 / i });
    }
    g.circle(sunX, this.h / 2, 22).fill({ color: 0xfdf4d3, alpha: 1.0 });
    g.circle(sunX, this.h / 2, 12).fill({ color: 0xffffff, alpha: 1.0 });
  }
}
