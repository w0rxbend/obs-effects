import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const C = {
  crust: 0x11111b,
  surface1: 0x45475a,
  overlay2: 0x9399b2,
  text: 0xcdd6f4,
  lavender: 0xb4befe,
  blue: 0x89b4fa,
  teal: 0x94e2d5,
  peach: 0xfab387,
  red: 0xf38ba8,
  mauve: 0xcba6f7,
} as const;

const K_FIELD = 80_000;
const TRAIL_LEN = 18;
const N_POSITIVE = 60;
const N_NEGATIVE = 60;
const N_NEUTRAL = 60;
const TOTAL_PARTICLES = N_POSITIVE + N_NEGATIVE + N_NEUTRAL;
const MAX_PULSE_RINGS = 8;
const PULSE_INTERVAL = 90; // frames
const N_FIELD_LINES = 24;
const RK4_STEP = 4;
const RK4_MAX_STEPS = 600;

interface Vec2 {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  charge: number;
  color: number;
  radius: number;
  age: number;
  maxLife: number;
  trail: Vec2[];
}

interface PulseRing {
  x: number;
  y: number;
  r: number;
  age: number;
  maxAge: number;
  color: number;
}

function getField(x: number, y: number, pN: Vec2, pS: Vec2): Vec2 {
  const dxN = x - pN.x,
    dyN = y - pN.y;
  const rN2 = dxN * dxN + dyN * dyN;
  const rN = Math.sqrt(rN2) + 0.001;
  const fN = K_FIELD / (rN2 * rN);

  const dxS = x - pS.x,
    dyS = y - pS.y;
  const rS2 = dxS * dxS + dyS * dyS;
  const rS = Math.sqrt(rS2) + 0.001;
  const fS = K_FIELD / (rS2 * rS);

  return { x: fN * dxN - fS * dxS, y: fN * dyN - fS * dyS };
}

function rk4Step(x: number, y: number, h: number, pN: Vec2, pS: Vec2): Vec2 {
  const dir = (px: number, py: number): Vec2 => {
    const B = getField(px, py, pN, pS);
    const mag = Math.sqrt(B.x * B.x + B.y * B.y) + 0.001;
    return { x: B.x / mag, y: B.y / mag };
  };
  const k1 = dir(x, y);
  const k2 = dir(x + h * k1.x * 0.5, y + h * k1.y * 0.5);
  const k3 = dir(x + h * k2.x * 0.5, y + h * k2.y * 0.5);
  const k4 = dir(x + h * k3.x, y + h * k3.y);
  return {
    x: x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
  };
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r =
    ((c1 >> 16) & 0xff) + (((c2 >> 16) & 0xff) - ((c1 >> 16) & 0xff)) * t;
  const g = ((c1 >> 8) & 0xff) + (((c2 >> 8) & 0xff) - ((c1 >> 8) & 0xff)) * t;
  const b = (c1 & 0xff) + ((c2 & 0xff) - (c1 & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export class MagneticFieldScreen extends Container {
  public static assetBundles: string[] = [];

  // ── Static layers (redrawn only on resize) ──────────────────────────────
  private readonly heatmapGfx = new Graphics();
  private readonly fieldLinesGfx = new Graphics();

  // ── Dynamic layers (cleared every frame) ────────────────────────────────
  private readonly trailsGfx = new Graphics();
  private readonly particlesGfx = new Graphics();
  private readonly pulseGfx = new Graphics();

  // ── Pole glow with blur filter ───────────────────────────────────────────
  private readonly northGlowContainer = new Container();
  private readonly northGlowGfx = new Graphics();
  private readonly southGlowContainer = new Container();
  private readonly southGlowGfx = new Graphics();

  // ── Magnet body (masked halves + border) ─────────────────────────────────
  private readonly magnetContainer = new Container();
  private readonly magnetMask = new Graphics();
  private readonly magnetBodyGfx = new Graphics();
  private readonly magnetBorderGfx = new Graphics();

  // ── Pole labels ──────────────────────────────────────────────────────────
  private readonly labelN: Text;
  private readonly labelS: Text;

  // ── State ────────────────────────────────────────────────────────────────
  private w = 1920;
  private h = 1080;
  private time = 0;
  private pN: Vec2 = { x: 760, y: 540 };
  private pS: Vec2 = { x: 1160, y: 540 };

  private readonly particles: Particle[] = [];
  private readonly pulseRings: PulseRing[] = [];
  private pulseTimer = 0;
  private pulseColorToggle = false;

  constructor() {
    super();

    // Blur filters for pole glow
    const blurN = new BlurFilter();
    blurN.blur = 18;
    this.northGlowContainer.filters = [blurN];
    this.northGlowContainer.addChild(this.northGlowGfx);

    const blurS = new BlurFilter();
    blurS.blur = 18;
    this.southGlowContainer.filters = [blurS];
    this.southGlowContainer.addChild(this.southGlowGfx);

    // Magnet body: mask clips halves to the rounded-rect outline
    this.magnetContainer.addChild(this.magnetMask);
    this.magnetContainer.addChild(this.magnetBodyGfx);
    this.magnetBodyGfx.mask = this.magnetMask;
    this.magnetContainer.addChild(this.magnetBorderGfx);

    // Labels
    const labelStyle = new TextStyle({
      fontFamily: "Arial, sans-serif",
      fontSize: 26,
      fontWeight: "bold",
      fill: "#cdd6f4",
    });
    this.labelN = new Text({ text: "N", style: labelStyle });
    this.labelS = new Text({ text: "S", style: labelStyle });

    // Layer order (back → front)
    this.addChild(this.heatmapGfx);
    this.addChild(this.fieldLinesGfx);
    this.addChild(this.trailsGfx);
    this.addChild(this.particlesGfx);
    this.addChild(this.pulseGfx);
    this.addChild(this.northGlowContainer);
    this.addChild(this.southGlowContainer);
    this.addChild(this.magnetContainer);
    this.addChild(this.labelN);
    this.addChild(this.labelS);

    // Pre-allocate particle pool (positions set in syncLayout)
    for (let i = 0; i < TOTAL_PARTICLES; i++) {
      const charge = i < N_POSITIVE ? 1 : i < N_POSITIVE + N_NEGATIVE ? -1 : 0;
      this.particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        charge,
        color: charge === 1 ? C.peach : charge === -1 ? C.teal : C.overlay2,
        radius: charge === 0 ? 2 : 3.5,
        age: 0,
        maxLife: 300 + Math.floor(Math.random() * 400),
        trail: [],
      });
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.syncLayout();
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.syncLayout();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private syncLayout(): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    this.pN = { x: cx - 200, y: cy };
    this.pS = { x: cx + 200, y: cy };

    this.drawHeatmap();
    this.drawFieldLines();
    this.drawMagnetBody();

    // Centre labels in each pole half
    this.labelN.x = cx - 100 - this.labelN.width * 0.5;
    this.labelN.y = cy - this.labelN.height * 0.5;
    this.labelS.x = cx + 100 - this.labelS.width * 0.5;
    this.labelS.y = cy - this.labelS.height * 0.5;

    // Scatter particles across the new layout
    for (const p of this.particles) {
      this.spawnParticle(p, true /* stagger ages */);
    }
  }

  // ── Static layers ─────────────────────────────────────────────────────────

  private drawHeatmap(): void {
    const g = this.heatmapGfx;
    g.clear();
    const STEP = 20;
    const cols = Math.ceil(this.w / STEP);
    const rows = Math.ceil(this.h / STEP);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const px = gx * STEP + STEP * 0.5;
        const py = gy * STEP + STEP * 0.5;
        const B = getField(px, py, this.pN, this.pS);
        const mag = Math.sqrt(B.x * B.x + B.y * B.y);
        const norm = Math.min(1, Math.log1p(mag) / Math.log1p(50));
        const col =
          norm < 0.5
            ? lerpColor(C.crust, C.surface1, norm * 2)
            : lerpColor(C.surface1, C.mauve, (norm - 0.5) * 2);
        g.circle(px, py, 3).fill({ color: col, alpha: 0.05 + norm * 0.1 });
      }
    }
  }

  private drawFieldLines(): void {
    const g = this.fieldLinesGfx;
    g.clear();
    const { pN, pS, w, h } = this;

    for (let i = 0; i < N_FIELD_LINES; i++) {
      const angle = (i / N_FIELD_LINES) * Math.PI * 2;
      let fx = pN.x + Math.cos(angle) * 50;
      let fy = pN.y + Math.sin(angle) * 50;

      const pts: Vec2[] = [{ x: fx, y: fy }];
      let arrowAccum = 60;
      const arrows: { x: number; y: number; a: number }[] = [];

      for (let s = 0; s < RK4_MAX_STEPS; s++) {
        const prev = { x: fx, y: fy };
        const next = rk4Step(fx, fy, RK4_STEP, pN, pS);
        fx = next.x;
        fy = next.y;
        pts.push({ x: fx, y: fy });

        const dx = fx - prev.x,
          dy = fy - prev.y;
        arrowAccum += Math.sqrt(dx * dx + dy * dy);
        if (arrowAccum >= 120) {
          arrowAccum -= 120;
          const B = getField(fx, fy, pN, pS);
          arrows.push({ x: fx, y: fy, a: Math.atan2(B.y, B.x) });
        }

        if (Math.hypot(fx - pS.x, fy - pS.y) < 30) break;
        if (fx < -200 || fx > w + 200 || fy < -200 || fy > h + 200) break;
        const B2 = getField(fx, fy, pN, pS);
        if (Math.sqrt(B2.x * B2.x + B2.y * B2.y) < 2) break;
      }

      if (pts.length < 2) continue;

      // Polyline
      g.moveTo(pts[0].x, pts[0].y);
      for (let pi = 1; pi < pts.length; pi++) {
        g.lineTo(pts[pi].x, pts[pi].y);
      }
      g.stroke({ color: C.mauve, alpha: 0.18, width: 1.2 });

      // Arrowheads
      const AS = 6;
      for (const ar of arrows) {
        const cos = Math.cos(ar.a),
          sin = Math.sin(ar.a);
        const tx = ar.x + cos * AS,
          ty = ar.y + sin * AS;
        const b1x = ar.x + Math.cos(ar.a + 2.6) * AS * 0.5;
        const b1y = ar.y + Math.sin(ar.a + 2.6) * AS * 0.5;
        const b2x = ar.x + Math.cos(ar.a - 2.6) * AS * 0.5;
        const b2y = ar.y + Math.sin(ar.a - 2.6) * AS * 0.5;
        g.moveTo(tx, ty)
          .lineTo(b1x, b1y)
          .lineTo(b2x, b2y)
          .fill({ color: C.lavender, alpha: 0.3 });
      }
    }
  }

  private drawMagnetBody(): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const R = 8; // corner radius

    // Mask = rounded-rect silhouette (stencil; not visually rendered)
    this.magnetMask.clear();
    this.magnetMask
      .roundRect(cx - 200, cy - 30, 400, 60, R)
      .fill({ color: 0xffffff });

    // Two pole halves (clipped by the mask above)
    this.magnetBodyGfx.clear();
    this.magnetBodyGfx
      .rect(cx - 200, cy - 30, 200, 60)
      .fill({ color: C.blue, alpha: 0.85 });
    this.magnetBodyGfx
      .rect(cx, cy - 30, 200, 60)
      .fill({ color: C.red, alpha: 0.85 });

    // Outer border stroke drawn on top
    this.magnetBorderGfx.clear();
    this.magnetBorderGfx
      .roundRect(cx - 200, cy - 30, 400, 60, R)
      .stroke({ color: C.surface1, width: 2 });
  }

  // ── Particle management ───────────────────────────────────────────────────

  private inMagnetZone(x: number, y: number): boolean {
    const cx = this.w * 0.5,
      cy = this.h * 0.5;
    return x > cx - 200 && x < cx + 200 && y > cy - 30 && y < cy + 30;
  }

  private spawnParticle(p: Particle, stagger = false): void {
    const cy = this.h * 0.5;
    let x = 0,
      y = 0;
    let attempts = 0;
    do {
      x = p.charge === 0 ? Math.random() * this.w : Math.random() * this.w;
      y =
        p.charge === 0
          ? cy - 200 + Math.random() * 400
          : Math.random() * this.h;
      attempts++;
    } while (attempts < 30 && this.inMagnetZone(x, y));

    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 2;
    p.vy = (Math.random() - 0.5) * 2;
    p.age = stagger ? Math.floor(Math.random() * p.maxLife) : 0;
    p.trail = [];
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    this.time += ticker.deltaMS / 1000;
    const t = this.time;
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const { pN, pS } = this;

    // ── Pulse ring timer ──────────────────────────────────────────────────
    this.pulseTimer++;
    if (
      this.pulseTimer >= PULSE_INTERVAL &&
      this.pulseRings.length < MAX_PULSE_RINGS
    ) {
      this.pulseTimer = 0;
      this.pulseColorToggle = !this.pulseColorToggle;
      this.pulseRings.push({
        x: pN.x,
        y: pN.y,
        r: 5,
        age: 0,
        maxAge: 80,
        color: this.pulseColorToggle ? C.blue : C.mauve,
      });
    }

    // ── Pole glow (animated alpha, phase-offset between N and S) ─────────
    const gaN = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.8));
    const gaS = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.8 + Math.PI));

    this.northGlowGfx.clear();
    this.northGlowGfx
      .ellipse(pN.x, cy, 120, 80)
      .fill({ color: C.blue, alpha: gaN });

    this.southGlowGfx.clear();
    this.southGlowGfx
      .ellipse(pS.x, cy, 120, 80)
      .fill({ color: C.red, alpha: gaS });

    // ── Particle physics ──────────────────────────────────────────────────
    for (const p of this.particles) {
      p.age++;
      if (p.age >= p.maxLife) {
        this.spawnParticle(p);
        continue;
      }

      // Field force: positive follows field, negative opposes, neutral weakly follows
      const B = getField(p.x, p.y, pN, pS);
      const bmag = Math.sqrt(B.x * B.x + B.y * B.y) + 0.001;
      const nx = B.x / bmag;
      const ny = B.y / bmag;
      const fstr = Math.min(bmag / 200, 2.0);
      const sign = p.charge === 0 ? 0.3 : p.charge;
      p.vx += nx * sign * fstr * 1.2;
      p.vy += ny * sign * fstr * 1.2;

      // Velocity damping
      p.vx *= 0.985;
      p.vy *= 0.985;

      // Speed cap
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 4.5) {
        const inv = 4.5 / speed;
        p.vx *= inv;
        p.vy *= inv;
      }

      // Pole proximity repulsion (prevents collapse into poles)
      for (const pole of [pN, pS]) {
        const ddx = p.x - pole.x,
          ddy = p.y - pole.y;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < 80 && dist > 0.01) {
          const rep = ((80 - dist) / 80) * 2.0;
          p.vx += (ddx / dist) * rep;
          p.vy += (ddy / dist) * rep;
        }
      }

      // Magnet body: push particle out via nearest face
      if (this.inMagnetZone(p.x, p.y)) {
        const dL = p.x - (cx - 200);
        const dR = cx + 200 - p.x;
        const dT = p.y - (cy - 30);
        const dB = cy + 30 - p.y;
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) p.vx -= 2;
        else if (m === dR) p.vx += 2;
        else if (m === dT) p.vy -= 2;
        else p.vy += 2;
      }

      // Canvas soft-bounce at edges
      const M = 20;
      if (p.x < M) p.vx += (M - p.x) * 0.1;
      if (p.x > this.w - M) p.vx -= (p.x - (this.w - M)) * 0.1;
      if (p.y < M) p.vy += (M - p.y) * 0.1;
      if (p.y > this.h - M) p.vy -= (p.y - (this.h - M)) * 0.1;

      p.x += p.vx;
      p.y += p.vy;

      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > TRAIL_LEN) p.trail.shift();
    }

    // ── Draw trails ───────────────────────────────────────────────────────
    const tg = this.trailsGfx;
    tg.clear();
    for (const p of this.particles) {
      if (p.trail.length < 2) continue;
      const la = Math.sin((p.age / p.maxLife) * Math.PI);
      if (la < 0.02) continue;
      tg.moveTo(p.trail[0].x, p.trail[0].y);
      for (let ti = 1; ti < p.trail.length; ti++) {
        tg.lineTo(p.trail[ti].x, p.trail[ti].y);
      }
      tg.stroke({ color: p.color, alpha: 0.3 * la, width: 1.2 });
    }

    // ── Draw particles ────────────────────────────────────────────────────
    const pg = this.particlesGfx;
    pg.clear();
    for (const p of this.particles) {
      const la = Math.sin((p.age / p.maxLife) * Math.PI);
      if (la < 0.02) continue;
      const alpha = p.charge === 0 ? 0.5 * la : la;
      if (p.charge !== 0) {
        pg.circle(p.x, p.y, p.radius * 2.5).fill({
          color: p.color,
          alpha: alpha * 0.15,
        });
      }
      pg.circle(p.x, p.y, p.radius).fill({ color: p.color, alpha });
    }

    // ── Draw pulse rings ──────────────────────────────────────────────────
    const rg = this.pulseGfx;
    rg.clear();
    for (let i = this.pulseRings.length - 1; i >= 0; i--) {
      const ring = this.pulseRings[i];
      ring.r += 2;
      ring.age += 1;
      if (ring.age >= ring.maxAge) {
        this.pulseRings.splice(i, 1);
        continue;
      }
      const alpha = 0.6 * (1 - ring.age / ring.maxAge);
      rg.circle(ring.x, ring.y, ring.r).stroke({
        color: ring.color,
        alpha,
        width: 1.5,
      });
    }
  }
}
