import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { TAU, randRange as rand } from "../../lib/math";

const NEBULA_PALETTE = [
  0x6d28d9, 0x4f46e5, 0x1d4ed8, 0x9333ea, 0x0891b2, 0xc026d3,
] as const;
const STAR_PALETTE = [0xe2e8f0, 0xcbd5e1, 0xc4b5fd, 0xbae6fd] as const;
const FLOAT_PALETTE = [
  0xa78bfa, 0x818cf8, 0x60a5fa, 0xc084fc, 0x38bdf8,
] as const;

const N_STARS = 240;
const N_FLOAT = 90;

function pick<T>(arr: readonly T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function softBlob(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  a: number,
): void {
  for (const t of [1.0, 0.72, 0.5, 0.32, 0.18]) {
    g.circle(cx, cy, r * t).fill({ color, alpha: a });
  }
}

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: number;
  ph: number;
  ts: number;
};
type Float = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: number;
  life: number;
  ml: number;
};
type NCloud = {
  bx: number;
  by: number;
  r: number;
  color: number;
  a: number;
  ph: number;
  ps: number;
  ox: number;
  oy: number;
  sats: { dx: number; dy: number; r: number; af: number }[];
};
type Planet = {
  x: number;
  y: number;
  r: number;
  col: number;
  glow: number;
  ph: number;
  amp: number;
  spd: number;
};

export class LofiSpaceScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bg = new Graphics();
  private readonly neb = new Graphics();
  private readonly fog = new Graphics();
  private readonly moo = new Graphics();
  private readonly pln = new Graphics();
  private readonly str = new Graphics();
  private readonly flt = new Graphics();

  private w = 1920;
  private h = 1080;
  private t = 0;

  private stars: Star[] = [];
  private floats: Float[] = [];
  private clouds: NCloud[] = [];
  private planets: Planet[] = [];

  constructor() {
    super();
    for (const g of [
      this.bg,
      this.neb,
      this.fog,
      this.moo,
      this.pln,
      this.str,
      this.flt,
    ]) {
      this.addChild(g);
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.build();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.build();
  }

  private build(): void {
    const W = this.w,
      H = this.h;

    this.stars = Array.from(
      { length: N_STARS },
      (): Star => ({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-1.2, 1.2),
        vy: rand(-0.5, 0.5),
        r: rand(0.4, 2.0),
        color: pick(STAR_PALETTE),
        ph: rand(0, TAU),
        ts: rand(0.35, 1.4),
      }),
    );

    this.clouds = Array.from(
      { length: NEBULA_PALETTE.length },
      (_, i): NCloud => {
        const r = rand(W * 0.1, W * 0.22);
        return {
          bx: rand(W * 0.05, W * 0.95),
          by: rand(H * 0.05, H * 0.95),
          r,
          color: NEBULA_PALETTE[i],
          a: rand(0.018, 0.032),
          ph: rand(0, TAU) + i * 1.05,
          ps: rand(0.04, 0.1),
          ox: rand(W * 0.02, W * 0.055),
          oy: rand(H * 0.018, H * 0.045),
          sats: Array.from({ length: 3 }, () => ({
            dx: rand(-r * 0.55, r * 0.55),
            dy: rand(-r * 0.45, r * 0.45),
            r: rand(r * 0.28, r * 0.62),
            af: rand(0.45, 0.85),
          })),
        };
      },
    );

    this.planets = [
      {
        x: W * 0.78,
        y: H * 0.64,
        r: Math.min(W, H) * 0.026,
        col: 0xfbbf24,
        glow: 0xfde68a,
        ph: rand(0, TAU),
        amp: H * 0.005,
        spd: 0.18,
      },
      {
        x: W * 0.12,
        y: H * 0.76,
        r: Math.min(W, H) * 0.015,
        col: 0xf87171,
        glow: 0xfca5a5,
        ph: rand(0, TAU),
        amp: H * 0.004,
        spd: 0.25,
      },
      {
        x: W * 0.88,
        y: H * 0.33,
        r: Math.min(W, H) * 0.009,
        col: 0x34d399,
        glow: 0x6ee7b7,
        ph: rand(0, TAU),
        amp: H * 0.003,
        spd: 0.31,
      },
    ];

    this.floats = Array.from({ length: N_FLOAT }, () => this.mkFloat(true));
  }

  private mkFloat(scatter = false): Float {
    const ml = rand(6, 16);
    return {
      x: rand(0, this.w),
      y: scatter ? rand(0, this.h) : this.h + rand(5, 30),
      vx: rand(-8, 8),
      vy: rand(-18, -5),
      r: rand(0.7, 2.2),
      color: pick(FLOAT_PALETTE),
      life: scatter ? rand(0, ml) : ml,
      ml,
    };
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.t += dt;
    this.drawBg();
    this.drawNebula(dt);
    this.drawFog();
    this.drawMoon();
    this.drawPlanets(dt);
    this.drawStars(dt);
    this.drawFloats(dt);
  }

  private drawBg(): void {
    const g = this.bg;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x020209 });
    g.rect(0, 0, this.w, this.h * 0.38).fill({ color: 0x05031a, alpha: 0.3 });
    g.rect(0, this.h * 0.72, this.w, this.h * 0.28).fill({
      color: 0x000003,
      alpha: 0.35,
    });
  }

  private drawNebula(dt: number): void {
    const g = this.neb;
    g.clear();
    for (const c of this.clouds) {
      c.ph += c.ps * dt;
      const cx = c.bx + c.ox * Math.sin(c.ph);
      const cy = c.by + c.oy * Math.cos(c.ph * 0.73);
      softBlob(g, cx, cy, c.r, c.color, c.a);
      for (const s of c.sats) {
        softBlob(g, cx + s.dx, cy + s.dy, s.r, c.color, c.a * s.af);
      }
    }
  }

  private drawFog(): void {
    const g = this.fog;
    g.clear();
    const bands = [
      { yr: 0.15, hr: 0.35, col: 0x7c3aed },
      { yr: 0.5, hr: 0.38, col: 0x1d4ed8 },
      { yr: 0.7, hr: 0.28, col: 0x4f46e5 },
    ];
    for (const b of bands) {
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 0.11 + b.yr * 5);
      const yOff = Math.sin(this.t * 0.065 + b.yr * 3.5) * this.h * 0.03;
      g.rect(0, this.h * b.yr + yOff, this.w, this.h * b.hr).fill({
        color: b.col,
        alpha: 0.015 * pulse,
      });
    }
  }

  private drawMoon(): void {
    const W = this.w,
      H = this.h;
    const mx = W * 0.78;
    const my = H * 0.15 + Math.sin(this.t * 0.07) * H * 0.003;
    const mr = Math.min(W, H) * 0.065;
    const g = this.moo;
    g.clear();

    for (let i = 7; i >= 1; i--) {
      const gr = mr * (1 + i * 0.4);
      const ga = (0.018 * (8 - i)) / 7;
      g.circle(mx, my, gr).fill({ color: 0x93c5fd, alpha: ga });
    }
    g.circle(mx, my, mr * 1.25).fill({ color: 0xbfdbfe, alpha: 0.12 });
    g.circle(mx, my, mr * 1.12).fill({ color: 0xdbeafe, alpha: 0.17 });

    g.circle(mx, my, mr).fill({ color: 0xf8f4e8 });
    g.circle(mx - mr * 0.1, my - mr * 0.07, mr * 0.9).fill({
      color: 0xfdf8f2,
      alpha: 0.55,
    });

    g.circle(mx + mr * 0.28, my - mr * 0.16, mr * 0.13).fill({
      color: 0xe4dcc8,
      alpha: 0.5,
    });
    g.circle(mx - mr * 0.3, my + mr * 0.22, mr * 0.1).fill({
      color: 0xddd5c0,
      alpha: 0.44,
    });
    g.circle(mx + mr * 0.08, my + mr * 0.36, mr * 0.075).fill({
      color: 0xe0d8c4,
      alpha: 0.38,
    });
  }

  private drawPlanets(dt: number): void {
    const g = this.pln;
    g.clear();
    for (const p of this.planets) {
      p.ph += p.spd * dt;
      const py = p.y + Math.sin(p.ph) * p.amp;
      for (let i = 5; i >= 1; i--) {
        g.circle(p.x, py, p.r * (1 + i * 0.5)).fill({
          color: p.glow,
          alpha: 0.012 + 0.004 * (5 - i),
        });
      }
      g.circle(p.x, py, p.r * 1.18).fill({ color: p.glow, alpha: 0.12 });
      g.circle(p.x, py, p.r).fill({ color: p.col });
      g.circle(p.x + p.r * 0.2, py + p.r * 0.12, p.r * 0.8).fill({
        color: 0x000000,
        alpha: 0.22,
      });
    }
  }

  private drawStars(dt: number): void {
    const W = this.w,
      H = this.h;
    const g = this.str;
    g.clear();
    for (const s of this.stars) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < -5) s.x += W + 10;
      else if (s.x > W + 5) s.x -= W + 10;
      if (s.y < -5) s.y += H + 10;
      else if (s.y > H + 5) s.y -= H + 10;
      s.ph += s.ts * dt;
      const alpha = 0.15 + 0.72 * (0.5 + 0.5 * Math.sin(s.ph));
      if (s.r > 1.4) {
        g.circle(s.x, s.y, s.r * 3).fill({
          color: s.color,
          alpha: alpha * 0.07,
        });
        g.circle(s.x, s.y, s.r * 1.5).fill({
          color: s.color,
          alpha: alpha * 0.18,
        });
      }
      g.circle(s.x, s.y, s.r).fill({ color: s.color, alpha });
    }
  }

  private drawFloats(dt: number): void {
    const W = this.w;
    const g = this.flt;
    g.clear();
    for (let i = 0; i < this.floats.length; i++) {
      const p = this.floats[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y < -10 || p.x < -10 || p.x > W + 10) {
        this.floats[i] = this.mkFloat();
        continue;
      }
      const lr = p.life / p.ml;
      const alpha = Math.sin(lr * Math.PI) * 0.65;
      if (alpha < 0.008) continue;
      g.circle(p.x, p.y, p.r * 3.5).fill({
        color: p.color,
        alpha: alpha * 0.09,
      });
      g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha });
    }
  }
}
