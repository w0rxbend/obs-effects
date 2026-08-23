import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerp, randRange as rnd, TAU } from "../../lib/math";

const N = 9;
const HORIZON = 0.68;
const C_BG = 0x000000;
const C_BODY = 0x020208;

const PALETTES: Array<[number, number]> = [
  [0x0070d0, 0x50c8ff],
  [0x0058b8, 0x0090ff],
  [0x5500cc, 0xa060ff],
  [0x0080e0, 0x30d8ff],
  [0x3a00b8, 0x7a50ee],
  [0x0065c0, 0x10b0ff],
  [0x5800d0, 0xa050ff],
  [0x005890, 0x00a8cc],
  [0x0060b8, 0x0090ee],
];

interface Mono {
  ox: number;
  oy: number;
  hwF: number;
  hhF: number;
  shF: number;
  dAX: number;
  dAY: number;
  pX: number;
  pY: number;
  fX: number;
  fY: number;
  aAmp: number;
  aPh: number;
  aFq: number;
  bPh: number;
  bFq: number;
  // scale breathing
  ssAmp: number;
  ssFq: number;
  ssPh: number;
  // scan beam
  scanFrac: number; // 0=top 1=bottom; -1=inactive
  scanSpeed: number;
  scanTimer: number;
  scanInterval: number;
  pal: [number, number];
  dep: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  color: number;
}

export class MonolithicBlackGeometryScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly monos: Mono[] = [];
  private readonly particles: Particle[] = [];
  private w = 1920;
  private h = 1080;
  private t = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.spawn();
    this.spawnParticles();
  }

  private spawn(): void {
    for (let i = 0; i < N; i++) {
      const dep = i / (N - 1);
      const scale = 0.55 + dep * 0.8;
      this.monos.push({
        ox: rnd(0.07, 0.93),
        oy: rnd(0.14, HORIZON - 0.05),
        hwF: rnd(0.013, 0.042) * scale,
        hhF: rnd(0.11, 0.3) * scale,
        shF: rnd(0.08, 0.38),
        // drift: 2.5x stronger than original
        dAX: rnd(0.01, 0.04),
        dAY: rnd(0.008, 0.025),
        pX: rnd(0, TAU),
        pY: rnd(0, TAU),
        fX: rnd(0.025, 0.065),
        fY: rnd(0.02, 0.05),
        // rotation: 2x wider arc
        aAmp: rnd(0.03, 0.14),
        aPh: rnd(0, TAU),
        aFq: rnd(0.015, 0.05),
        bPh: rnd(0, TAU),
        bFq: rnd(0.4, 1.1),
        // scale breathing
        ssAmp: rnd(0.04, 0.12),
        ssFq: rnd(0.12, 0.35),
        ssPh: rnd(0, TAU),
        // scan beam
        scanFrac: -1,
        scanSpeed: rnd(0.4, 0.9),
        scanTimer: rnd(1.5, 5),
        scanInterval: rnd(4, 9),
        pal: PALETTES[i % PALETTES.length],
        dep,
      });
    }
    this.monos.sort((a, b) => a.dep - b.dep);
  }

  private spawnParticles(): void {
    const colors = PALETTES.map(([g]) => g);
    for (let i = 0; i < 65; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random() * HORIZON,
        vx: rnd(-0.006, 0.006),
        vy: rnd(-0.004, 0.004),
        r: rnd(0.5, 2.5),
        alpha: rnd(0.06, 0.28),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.t += dt;

    // Advance scan beams
    for (const m of this.monos) {
      if (m.scanFrac >= 0) {
        m.scanFrac += m.scanSpeed * dt;
        if (m.scanFrac > 1) {
          m.scanFrac = -1;
          m.scanTimer = m.scanInterval + rnd(-1, 1);
        }
      } else {
        m.scanTimer -= dt;
        if (m.scanTimer <= 0) m.scanFrac = 0;
      }
    }

    // Drift particles, wrap at boundary
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += HORIZON;
      if (p.y > HORIZON) p.y -= HORIZON;
    }

    this.draw();
  }

  private quad(
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    shear: number,
    angle: number,
  ): [number, number][] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const raw: [number, number][] = [
      [-hw + shear, -hh],
      [hw + shear, -hh],
      [hw - shear, hh],
      [-hw - shear, hh],
    ];
    return raw.map(([lx, ly]) => [
      lx * cos - ly * sin + cx,
      lx * sin + ly * cos + cy,
    ]);
  }

  private glowSeg(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    glow: number,
    core: number,
    alpha: number,
  ): void {
    const g = this.gfx;
    const a = alpha;
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ color: glow, alpha: 0.05 * a, width: 22 });
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ color: glow, alpha: 0.14 * a, width: 9 });
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ color: glow, alpha: 0.34 * a, width: 3.2 });
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ color: core, alpha: 0.88 * a, width: 0.9 });
  }

  private draw(): void {
    const { gfx, monos, particles, w, h, t } = this;
    const hY = h * HORIZON;
    gfx.clear();

    gfx.rect(0, 0, w, h).fill({ color: C_BG });

    // Horizon ambient — breathes gently
    const horizPulse = 0.5 + 0.5 * Math.sin(t * 0.22);
    gfx
      .rect(0, hY - 28, w, 56)
      .fill({ color: 0x003366, alpha: 0.018 + 0.012 * horizPulse });
    gfx
      .rect(0, hY - 10, w, 20)
      .fill({ color: 0x0066aa, alpha: 0.025 + 0.015 * horizPulse });

    // Background particles
    for (const p of particles) {
      gfx
        .circle(p.x * w, p.y * h, p.r)
        .fill({ color: p.color, alpha: p.alpha });
    }

    // Reflections
    for (const m of monos) {
      const cx = (m.ox + Math.sin(t * m.fX + m.pX) * m.dAX) * w;
      const cy = (m.oy + Math.cos(t * m.fY + m.pY) * m.dAY) * h;
      const hw = m.hwF * w;
      const hhScale = 1 + m.ssAmp * Math.sin(t * m.ssFq + m.ssPh);
      const hh = m.hhF * h * hhScale;
      const sh = m.shF * hw;
      const ang = Math.sin(t * m.aFq + m.aPh) * m.aAmp;
      const breath = 0.6 + 0.4 * Math.sin(t * m.bFq + m.bPh);

      const verts = this.quad(cx, cy, hw, hh, sh, ang);
      const refVerts: [number, number][] = verts.map(([vx, vy]) => {
        const dist = hY - vy;
        const ry = hY + dist * 0.82;
        const shimmer = Math.sin(ry * 0.045 + t * 0.55) * 3.0;
        return [vx + shimmer, ry];
      });

      const flat = refVerts.flatMap(([rx, ry]) => [rx, ry]);
      const [gl] = m.pal;
      const rA = (0.1 + 0.07 * m.dep) * breath;

      gfx.poly(flat).fill({ color: C_BODY, alpha: 0.35 * rA });
      for (let i = 0; i < 4; i++) {
        const [x0, y0] = refVerts[i];
        const [x1, y1] = refVerts[(i + 1) % 4];
        gfx
          .moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({ color: gl, alpha: 0.08 * rA, width: 1.2 });
      }
    }

    // Monoliths back → front
    for (const m of monos) {
      const cx = (m.ox + Math.sin(t * m.fX + m.pX) * m.dAX) * w;
      const cy = (m.oy + Math.cos(t * m.fY + m.pY) * m.dAY) * h;
      const hw = m.hwF * w;
      const hhScale = 1 + m.ssAmp * Math.sin(t * m.ssFq + m.ssPh);
      const hh = m.hhF * h * hhScale;
      const sh = m.shF * hw;
      const ang = Math.sin(t * m.aFq + m.aPh) * m.aAmp;
      const breath = 0.6 + 0.4 * Math.sin(t * m.bFq + m.bPh);
      const depthScale = 0.35 + 0.65 * m.dep;

      const verts = this.quad(cx, cy, hw, hh, sh, ang);
      const flat = verts.flatMap(([vx, vy]) => [vx, vy]);
      const [gl, co] = m.pal;

      // Wide ambient glow behind body
      gfx.poly(flat).stroke({ color: gl, alpha: 0.04 * breath, width: 24 });

      // Body
      gfx.poly(flat).fill({ color: C_BODY });

      // Edges with depth-based + directional intensity: top=1.0, sides=0.65, bottom=0.35
      const edgeMult = [1.0, 0.65, 0.35, 0.65];
      for (let i = 0; i < 4; i++) {
        const [x0, y0] = verts[i];
        const [x1, y1] = verts[(i + 1) % 4];
        this.glowSeg(x0, y0, x1, y1, gl, co, edgeMult[i] * breath * depthScale);
      }

      // Crisp top edge highlight
      const [tx0, ty0] = verts[0];
      const [tx1, ty1] = verts[1];
      gfx
        .moveTo(tx0, ty0)
        .lineTo(tx1, ty1)
        .stroke({ color: co, alpha: 0.48 * breath * depthScale, width: 0.6 });

      // Scan beam sweeping through the body
      if (m.scanFrac >= 0 && m.scanFrac <= 1) {
        const [tl, tr, br, bl] = verts;
        // Interpolate left and right scan endpoints along the monolith edges
        const sx0 = lerp(tl[0], bl[0], m.scanFrac);
        const sy0 = lerp(tl[1], bl[1], m.scanFrac);
        const sx1 = lerp(tr[0], br[0], m.scanFrac);
        const sy1 = lerp(tr[1], br[1], m.scanFrac);
        const scanAlpha = depthScale * (1 - Math.abs(m.scanFrac - 0.5) * 1.2);
        gfx
          .moveTo(sx0, sy0)
          .lineTo(sx1, sy1)
          .stroke({ color: gl, alpha: 0.12 * scanAlpha, width: 10 });
        gfx
          .moveTo(sx0, sy0)
          .lineTo(sx1, sy1)
          .stroke({ color: gl, alpha: 0.3 * scanAlpha, width: 3 });
        gfx
          .moveTo(sx0, sy0)
          .lineTo(sx1, sy1)
          .stroke({ color: co, alpha: 0.9 * scanAlpha, width: 0.7 });
      }
    }
  }
}
