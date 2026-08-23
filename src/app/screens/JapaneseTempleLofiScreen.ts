import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerp, TAU, randRange as rand } from "../../lib/math";

const MOON_BODY = 0xe8f4ff;
const MOON_GLOW_INNER = 0x7aaed4;
const MOON_GLOW_OUTER = 0x162c50;
const LANTERN_CORE = 0xffaa44;
const LANTERN_MID = 0xff7722;
const LANTERN_OUTER = 0xff4400;
const LANTERN_BODY = 0xff8800;
const SAKURA_COLORS = [
  0xffb7c5, 0xff9db5, 0xffd4de, 0xffc2cc, 0xffaabf,
] as const;
const FOG_COOL = 0x0d1f40;
const FOG_WARM = 0x1a0d00;
const STAR_COLORS = [0xddeeff, 0xccddff, 0xeef4ff, 0xbbccee] as const;
const DUST_COLOR = 0xffeecc;
const TEMPLE_DARK = 0x010204;

const N_STARS = 160;
const N_PETALS = 68;
const N_DUST = 48;
const N_FOG_BANDS = 8;
const N_GRAIN = 600;

function pick<T>(arr: readonly T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
  phs: number;
  color: number;
}

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  r: number;
  r2: number;
  color: number;
  alpha: number;
  depth: number;
  swayPh: number;
  swayAmp: number;
  swaySpd: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ph: number;
  phs: number;
  life: number;
  ml: number;
}

interface FogBand {
  yr: number;
  hr: number;
  driftX: number;
  driftSpd: number;
  wavePh: number;
  wavePhs: number;
  waveAmp: number;
  color: number;
  alpha: number;
}

interface Lantern {
  xr: number;
  yr: number;
  r: number;
  ph: number;
  phs: number;
  swayPh: number;
  swaySpd: number;
  swayAmp: number;
}

export class JapaneseTempleLofiScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx = new Graphics();
  private readonly starGfx = new Graphics();
  private readonly moonGfx = new Graphics();
  private readonly templeGfx = new Graphics();
  private readonly fogGfx = new Graphics();
  private readonly lanternGfx = new Graphics();
  private readonly petalGfx = new Graphics();
  private readonly dustGfx = new Graphics();
  private readonly grainGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private t = 0;

  private stars: Star[] = [];
  private petals: Petal[] = [];
  private dust: Dust[] = [];
  private fogBands: FogBand[] = [];
  private lanterns: Lantern[] = [];
  private grainPts: { x: number; y: number; a: number }[] = [];

  constructor() {
    super();
    for (const g of [
      this.bgGfx,
      this.starGfx,
      this.moonGfx,
      this.templeGfx,
      this.fogGfx,
      this.lanternGfx,
      this.petalGfx,
      this.dustGfx,
      this.grainGfx,
    ]) {
      this.addChild(g);
    }
    this.grainPts = Array.from({ length: N_GRAIN }, () => ({
      x: 0,
      y: 0,
      a: 0,
    }));
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
    const W = this.w;
    const H = this.h;

    this.stars = Array.from(
      { length: N_STARS },
      (): Star => ({
        x: rand(0, W),
        y: rand(0, H * 0.75),
        r: rand(0.4, 1.9),
        ph: rand(0, TAU),
        phs: rand(0.28, 1.1),
        color: pick(STAR_COLORS),
      }),
    );

    this.fogBands = Array.from(
      { length: N_FOG_BANDS },
      (_, i): FogBand => ({
        yr: rand(0.0, 0.88),
        hr: rand(0.07, 0.22),
        driftX: rand(0, W),
        driftSpd: rand(5, 22) * (Math.random() < 0.5 ? 1 : -1),
        wavePh: rand(0, TAU),
        wavePhs: rand(0.004, 0.018),
        waveAmp: rand(H * 0.008, H * 0.032),
        color: i < 5 ? FOG_COOL : FOG_WARM,
        alpha: rand(0.028, 0.072),
      }),
    );

    const unit = Math.min(W, H);
    this.lanterns = [
      {
        xr: 0.18,
        yr: 0.1,
        r: unit * 0.019,
        ph: rand(0, TAU),
        phs: rand(0.3, 0.55),
        swayPh: rand(0, TAU),
        swaySpd: rand(0.13, 0.23),
        swayAmp: W * 0.003,
      },
      {
        xr: 0.41,
        yr: 0.065,
        r: unit * 0.024,
        ph: rand(0, TAU),
        phs: rand(0.26, 0.52),
        swayPh: rand(0, TAU),
        swaySpd: rand(0.1, 0.2),
        swayAmp: W * 0.0045,
      },
      {
        xr: 0.59,
        yr: 0.072,
        r: unit * 0.022,
        ph: rand(0, TAU),
        phs: rand(0.24, 0.5),
        swayPh: rand(0, TAU),
        swaySpd: rand(0.12, 0.22),
        swayAmp: W * 0.004,
      },
      {
        xr: 0.82,
        yr: 0.11,
        r: unit * 0.017,
        ph: rand(0, TAU),
        phs: rand(0.32, 0.58),
        swayPh: rand(0, TAU),
        swaySpd: rand(0.16, 0.28),
        swayAmp: W * 0.0028,
      },
    ];

    this.petals = Array.from({ length: N_PETALS }, () => this.mkPetal(true));
    this.dust = Array.from({ length: N_DUST }, () => this.mkDust(true));
  }

  private mkPetal(scatter = false): Petal {
    const depth = rand(0.25, 1.0);
    const sc = 0.38 + depth * 0.62;
    return {
      x: rand(-50, this.w + 50),
      y: scatter ? rand(-50, this.h + 50) : rand(-80, -5),
      vx: rand(-22, 22),
      vy: rand(18, 52) * sc,
      rot: rand(0, TAU),
      vrot: rand(-2.2, 2.2),
      r: rand(3.5, 7.5) * sc,
      r2: rand(2.0, 5.0) * sc,
      color: pick(SAKURA_COLORS),
      alpha: rand(0.52, 0.9) * sc,
      depth,
      swayPh: rand(0, TAU),
      swayAmp: rand(22, 68) * sc,
      swaySpd: rand(0.38, 1.05),
    };
  }

  private mkDust(scatter = false): Dust {
    const ml = rand(10, 26);
    return {
      x: rand(0, this.w),
      y: scatter ? rand(0, this.h) : rand(this.h * 0.2, this.h * 0.85),
      vx: rand(-9, 9),
      vy: rand(-7, -1.5),
      r: rand(0.5, 2.5),
      ph: rand(0, TAU),
      phs: rand(0.28, 1.05),
      life: scatter ? rand(0, ml) : ml,
      ml,
    };
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.t += dt;
    this.drawBg();
    this.drawStars(dt);
    this.drawMoon();
    this.drawTemple();
    this.drawFog(dt);
    this.drawLanterns(dt);
    this.drawPetals(dt);
    this.drawDust(dt);
    this.drawGrain();
  }

  private drawBg(): void {
    const g = this.bgGfx;
    const W = this.w;
    const H = this.h;
    g.clear();
    // Sky gradient via thin horizontal strips
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const r = Math.round(lerp(2, 9, t));
      const gv = Math.round(lerp(4, 9, t));
      const b = Math.round(lerp(14, 22, t));
      g.rect(0, H * (i / bands), W, H / bands + 1).fill({
        color: (r << 16) | (gv << 8) | b,
      });
    }
    // Warm lantern-light pooling at bottom third
    g.rect(0, H * 0.68, W, H * 0.32).fill({ color: 0x1e0500, alpha: 0.22 });
    g.rect(0, H * 0.82, W, H * 0.18).fill({ color: 0x140300, alpha: 0.28 });
  }

  private drawStars(dt: number): void {
    const g = this.starGfx;
    g.clear();
    for (const s of this.stars) {
      s.ph += s.phs * dt;
      const a = 0.1 + 0.7 * (0.5 + 0.5 * Math.sin(s.ph));
      if (s.r > 1.2) {
        g.circle(s.x, s.y, s.r * 3.2).fill({
          color: s.color,
          alpha: a * 0.055,
        });
        g.circle(s.x, s.y, s.r * 1.7).fill({ color: s.color, alpha: a * 0.15 });
      }
      g.circle(s.x, s.y, s.r).fill({ color: s.color, alpha: a });
    }
  }

  private drawMoon(): void {
    const W = this.w;
    const H = this.h;
    const mx = W * 0.72;
    const my = H * 0.16 + Math.sin(this.t * 0.055) * H * 0.002;
    const mr = Math.min(W, H) * 0.076;
    const g = this.moonGfx;
    g.clear();

    // Outer atmospheric haze (8 layers)
    for (let i = 8; i >= 1; i--) {
      const gr = mr * (1 + i * 0.46);
      const ga =
        0.013 *
        ((9 - i) / 8) *
        (0.78 + 0.22 * Math.sin(this.t * 0.08 + i * 0.6));
      g.circle(mx, my, gr).fill({ color: MOON_GLOW_OUTER, alpha: ga });
    }
    // Inner blue corona
    g.circle(mx, my, mr * 1.38).fill({ color: MOON_GLOW_INNER, alpha: 0.12 });
    g.circle(mx, my, mr * 1.2).fill({ color: MOON_GLOW_INNER, alpha: 0.18 });
    g.circle(mx, my, mr * 1.08).fill({ color: 0xbbd8f0, alpha: 0.24 });
    // Moon disc
    g.circle(mx, my, mr).fill({ color: MOON_BODY });
    g.circle(mx - mr * 0.07, my - mr * 0.05, mr * 0.91).fill({
      color: 0xf2faff,
      alpha: 0.42,
    });
    // Surface detail
    g.circle(mx + mr * 0.26, my - mr * 0.2, mr * 0.13).fill({
      color: 0xc5ddf0,
      alpha: 0.38,
    });
    g.circle(mx - mr * 0.34, my + mr * 0.25, mr * 0.1).fill({
      color: 0xcde2f4,
      alpha: 0.32,
    });
    g.circle(mx + mr * 0.06, my + mr * 0.4, mr * 0.08).fill({
      color: 0xc8dff2,
      alpha: 0.28,
    });
  }

  private drawTemple(): void {
    const W = this.w;
    const H = this.h;
    const g = this.templeGfx;
    g.clear();

    const cx = W * 0.5;
    const baseY = H * 0.825;
    const tw = W * 0.11;

    // Pagoda tiers — bottom to top, each narrower with eave overhang
    const tiers: { w: number; h: number; y: number }[] = [];
    let curY = baseY;
    const tierDefs = [
      { wf: 1.0, hf: 0.055 },
      { wf: 0.82, hf: 0.044 },
      { wf: 0.65, hf: 0.036 },
      { wf: 0.5, hf: 0.029 },
      { wf: 0.36, hf: 0.024 },
    ];
    for (const td of tierDefs) {
      tiers.push({ w: tw * td.wf, h: H * td.hf, y: curY });
      curY -= H * td.hf;
    }

    const color = TEMPLE_DARK;
    const alpha = 0.92;
    for (const tier of tiers) {
      // Column body
      g.rect(cx - tier.w * 0.5, tier.y - tier.h, tier.w, tier.h).fill({
        color,
        alpha,
      });
      // Roof eave (wider than body, thin)
      g.rect(
        cx - tier.w * 0.62,
        tier.y - tier.h * 0.18,
        tier.w * 1.24,
        tier.h * 0.22,
      ).fill({ color, alpha });
    }
    // Spire
    const topY = curY + tierDefs[tierDefs.length - 1].hf * H;
    g.rect(cx - W * 0.0035, topY - H * 0.055, W * 0.007, H * 0.055).fill({
      color,
      alpha,
    });
    // Finial bead
    g.circle(cx, topY - H * 0.055, W * 0.004).fill({ color, alpha });

    // Dark ground plane
    g.rect(0, H * 0.84, W, H * 0.16).fill({ color: 0x010103, alpha: 0.94 });
    // Soft fog vignette at ground edge
    g.rect(0, H * 0.78, W, H * 0.07).fill({ color: 0x010103, alpha: 0.55 });
    g.rect(0, H * 0.76, W, H * 0.05).fill({ color: 0x010103, alpha: 0.28 });
  }

  private drawFog(dt: number): void {
    const g = this.fogGfx;
    const W = this.w;
    const H = this.h;
    g.clear();

    for (const b of this.fogBands) {
      b.driftX += b.driftSpd * dt;
      b.wavePh += b.wavePhs * dt;
      const yOff = Math.sin(b.wavePh) * b.waveAmp;
      const pulse = 0.62 + 0.38 * Math.sin(this.t * 0.07 + b.yr * 3.8);
      // Soft-edge band via 5 layered rects (bell-curve alpha cross-section)
      const layers = 5;
      for (let l = 0; l < layers; l++) {
        const lf = (l + 0.5) / layers;
        const edgeFade = Math.sin(lf * Math.PI);
        const fy = H * b.yr + yOff + l * ((H * b.hr) / layers);
        g.rect(0, fy, W, (H * b.hr) / layers).fill({
          color: b.color,
          alpha: b.alpha * pulse * edgeFade,
        });
      }
    }

    // Atmospheric ground fog pool — layered for soft top edge
    const poolPulse = 0.68 + 0.32 * Math.sin(this.t * 0.045);
    const poolLayers: [number, number, number][] = [
      [0.0, 0.14, 0.065],
      [0.04, 0.1, 0.055],
      [0.08, 0.06, 0.04],
      [0.12, 0.03, 0.02],
    ];
    for (const [off, hr, a] of poolLayers) {
      g.rect(0, H * (0.8 + off), W, H * hr).fill({
        color: FOG_COOL,
        alpha: a * poolPulse,
      });
    }
  }

  private drawLanterns(dt: number): void {
    const g = this.lanternGfx;
    const W = this.w;
    const H = this.h;
    g.clear();

    for (const l of this.lanterns) {
      l.ph += l.phs * dt;
      l.swayPh += l.swaySpd * dt;
      const cx = l.xr * W + Math.sin(l.swayPh) * l.swayAmp;
      const cy = l.yr * H + Math.sin(l.swayPh * 0.68) * l.swayAmp * 0.35;
      const pulse = 0.72 + 0.28 * Math.sin(l.ph);
      const r = l.r;

      // Wide atmospheric bloom (10 layers)
      for (let i = 10; i >= 2; i--) {
        const gr = r * (1 + i * 0.58);
        const ga = 0.007 * ((11 - i) / 10) * pulse;
        g.circle(cx, cy, gr).fill({ color: LANTERN_OUTER, alpha: ga });
      }
      // Mid warm glow
      g.circle(cx, cy, r * 2.4).fill({
        color: LANTERN_MID,
        alpha: 0.13 * pulse,
      });
      g.circle(cx, cy, r * 1.6).fill({
        color: LANTERN_CORE,
        alpha: 0.2 * pulse,
      });
      g.circle(cx, cy, r * 1.1).fill({ color: 0xffe0a0, alpha: 0.28 * pulse });

      // Lantern body (rectangle with caps)
      const lw = r * 0.95;
      const lh = r * 1.45;
      g.rect(cx - lw * 0.5, cy - lh * 0.5, lw, lh).fill({
        color: LANTERN_BODY,
        alpha: 0.88 * pulse,
      });
      // Top and bottom dark bands (structure lines)
      g.rect(cx - lw * 0.5, cy - lh * 0.5, lw, lh * 0.14).fill({
        color: 0x220800,
        alpha: 0.75,
      });
      g.rect(cx - lw * 0.5, cy + lh * 0.36, lw, lh * 0.14).fill({
        color: 0x220800,
        alpha: 0.75,
      });
      // Bright inner core
      g.circle(cx, cy, r * 0.62).fill({ color: 0xfff0cc, alpha: 0.94 * pulse });
      g.circle(cx, cy, r * 0.3).fill({ color: 0xffffff, alpha: 0.72 * pulse });

      // Hanging cord
      g.rect(cx - 0.5, cy - lh * 0.5 - H * 0.065, 1, H * 0.065).fill({
        color: 0x554433,
        alpha: 0.55,
      });
    }
  }

  private drawPetals(dt: number): void {
    const W = this.w;
    const H = this.h;
    // Slow wind — two overlapping sine waves
    const windX = Math.sin(this.t * 0.14) * 14 + Math.sin(this.t * 0.39) * 6;
    const g = this.petalGfx;
    g.clear();

    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.swayPh += p.swaySpd * dt;
      const sway = Math.sin(p.swayPh) * p.swayAmp;
      p.x += (p.vx + windX + sway) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;

      if (p.y > H + 30 || p.x < -100 || p.x > W + 100) {
        this.petals[i] = this.mkPetal(false);
        continue;
      }

      // Petal: main lobe + offset secondary lobe = teardrop silhouette
      const ox = Math.cos(p.rot) * p.r2 * 0.55;
      const oy = Math.sin(p.rot) * p.r2 * 0.55;
      // Depth-sorted soft glow
      g.circle(p.x, p.y, p.r * 2.4).fill({
        color: p.color,
        alpha: p.alpha * 0.07,
      });
      // Main lobe
      g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: p.alpha });
      // Secondary lobe
      g.circle(p.x + ox, p.y + oy, p.r2).fill({
        color: p.color,
        alpha: p.alpha * 0.82,
      });
      // Specular highlight
      g.circle(
        p.x - ox * 0.28 + Math.cos(p.rot + 1.3) * p.r * 0.26,
        p.y - oy * 0.28 + Math.sin(p.rot + 1.3) * p.r * 0.26,
        p.r * 0.24,
      ).fill({ color: 0xffeef5, alpha: p.alpha * 0.38 });
    }
  }

  private drawDust(dt: number): void {
    const W = this.w;
    const g = this.dustGfx;
    g.clear();

    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      d.ph += d.phs * dt;
      d.x += (d.vx + Math.sin(d.ph * 0.65) * 4) * dt;
      d.y += d.vy * dt;
      d.life -= dt;

      if (d.life <= 0 || d.y < -10 || d.x < -10 || d.x > W + 10) {
        this.dust[i] = this.mkDust(false);
        continue;
      }

      const lr = d.life / d.ml;
      const alpha = Math.sin(lr * Math.PI) * 0.52;
      if (alpha < 0.008) continue;
      g.circle(d.x, d.y, d.r * 3.2).fill({
        color: DUST_COLOR,
        alpha: alpha * 0.07,
      });
      g.circle(d.x, d.y, d.r).fill({ color: DUST_COLOR, alpha });
    }
  }

  private drawGrain(): void {
    const g = this.grainGfx;
    const W = this.w;
    const H = this.h;
    g.clear();
    for (const p of this.grainPts) {
      p.x = rand(0, W);
      p.y = rand(0, H);
      p.a = rand(0.006, 0.022);
      g.circle(p.x, p.y, 0.55).fill({ color: 0xffffff, alpha: p.a });
    }
  }
}
