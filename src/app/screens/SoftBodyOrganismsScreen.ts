import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ─── Palette ────────────────────────────────────────────────────────────────
const BG = 0x060810;
const COLORS = [
  0x94e2d5, // teal
  0x74c7ec, // sky
  0xcba6f7, // mauve
  0xa6e3a1, // green
  0x89dceb, // sapphire
  0xf5c2e7, // pink
  0xfab387, // peach
  0xf9e2af, // yellow
];

// ─── Config ─────────────────────────────────────────────────────────────────
const N_RING = 14; // membrane point count
const N_ORGS = 8;
const BASE_R = 58;
const R_JITTER = 40;
const DAMPING = 0.985; // Verlet velocity decay per step
const RING_K = 0.18; // circumferential spring stiffness
const DIAG_K = 0.07; // skip-1 diagonal spring stiffness
const SPOKE_K = 0.26; // spoke spring stiffness (drives shape)
const PRESSURE_K = 0.1; // area conservation nudge strength
const FLOAT_SPEED = 22; // max drift px/s
const CONSTRAINT_ITERS = 7;
const WAVE_AMP = 0.3; // spoke rest-length modulation ±fraction
const SPLINE_SUBS = 6; // quadratic bezier samples per segment

/**
 * Fixed simulation step, in seconds. This screen is deliberately frame-rate
 * locked: its motion is tuned to a 60 fps step, so reading the real ticker
 * delta would change the tuned timing.
 */
const FIXED_STEP_SECONDS = 1 / 60;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Spr {
  a: number;
  b: number;
  rest: number;
  k: number;
  spokeFrac?: number; // set on spoke springs: ring-slot / N_RING
}

interface Org {
  pts: Pt[]; // [0..N_RING-1] = ring, [N_RING] = nucleus center
  sprs: Spr[];
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  color: number;
  r: number;
  phase: number;
  nRings: number;
}

// ─── SoftBodyOrganismsScreen ─────────────────────────────────────────────────
export class SoftBodyOrganismsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private t = 0;
  private orgs: Org[] = [];

  // Pre-allocated spline buffer — reused across all draw calls each frame
  private readonly splBuf: Array<{ x: number; y: number }> = Array.from(
    { length: N_RING * SPLINE_SUBS },
    () => ({ x: 0, y: 0 }),
  );

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.spawnAll();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.04);
    this.t += dt;
    this.simulate(dt);
    this.render();
  }

  // ── Initialisation ─────────────────────────────────────────────────────────
  private spawnAll(): void {
    this.orgs = [];
    for (let i = 0; i < N_ORGS; i++) {
      const r = BASE_R + Math.random() * R_JITTER;
      const cx = this.w * 0.12 + Math.random() * this.w * 0.76;
      const cy = this.h * 0.12 + Math.random() * this.h * 0.76;
      this.orgs.push(this.makeOrganism(cx, cy, r, i));
    }
  }

  private makeOrganism(cx: number, cy: number, r: number, idx: number): Org {
    const pts: Pt[] = [];

    // Membrane ring points — slightly jittered radii for organic initial shape
    for (let k = 0; k < N_RING; k++) {
      const a = (k / N_RING) * Math.PI * 2;
      const rk = r * (0.88 + Math.random() * 0.24);
      const x = cx + Math.cos(a) * rk;
      const y = cy + Math.sin(a) * rk;
      pts.push({ x, y, px: x, py: y });
    }
    // Nucleus center point
    pts.push({ x: cx, y: cy, px: cx, py: cy });

    const sprs: Spr[] = [];
    // Circumferential springs
    for (let k = 0; k < N_RING; k++) {
      const j = (k + 1) % N_RING;
      sprs.push({ a: k, b: j, rest: plen(pts[k], pts[j]), k: RING_K });
    }
    // Skip-1 diagonal springs (structural rigidity)
    for (let k = 0; k < N_RING; k++) {
      const j = (k + 2) % N_RING;
      sprs.push({ a: k, b: j, rest: plen(pts[k], pts[j]), k: DIAG_K });
    }
    // Spoke springs — rest lengths are animated to drive membrane oscillation
    for (let k = 0; k < N_RING; k++) {
      sprs.push({
        a: k,
        b: N_RING,
        rest: plen(pts[k], pts[N_RING]),
        k: SPOKE_K,
        spokeFrac: k / N_RING,
      });
    }

    // Seed initial velocity into Verlet by offsetting previous positions
    const vx0 = (Math.random() - 0.5) * FLOAT_SPEED * 1.6;
    const vy0 = (Math.random() - 0.5) * FLOAT_SPEED;
    const dt0 = FIXED_STEP_SECONDS;
    for (const p of pts) {
      p.px = p.x - vx0 * dt0;
      p.py = p.y - vy0 * dt0;
    }

    return {
      pts,
      sprs,
      cx,
      cy,
      vx: vx0,
      vy: vy0,
      color: COLORS[idx % COLORS.length],
      r,
      phase: Math.random() * Math.PI * 2,
      nRings: 1 + Math.floor(Math.random() * 3),
    };
  }

  // ── Simulation ─────────────────────────────────────────────────────────────
  private simulate(dt: number): void {
    for (const o of this.orgs) {
      // Verlet integrate — damped, no explicit external force; shape is driven
      // purely by spring rest-length modulation in resolveConstraints.
      for (const p of o.pts) {
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy;
      }

      // Positional spring constraints
      for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
        this.resolveConstraints(o);
      }

      // Area conservation (pressure)
      this.applyPressure(o);

      // Global drift — slow flow-field perturbation
      const fa = this.flowAngle(o.cx, o.cy);
      o.vx = o.vx * 0.997 + Math.cos(fa) * 8 * dt;
      o.vy = o.vy * 0.997 + Math.sin(fa) * 8 * dt;
      const spd = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
      if (spd > FLOAT_SPEED) {
        o.vx *= FLOAT_SPEED / spd;
        o.vy *= FLOAT_SPEED / spd;
      }

      // Translate all points by global drift (including prev-pos so Verlet
      // internal deformation velocities are unaffected)
      const ddx = o.vx * dt;
      const ddy = o.vy * dt;
      for (const p of o.pts) {
        p.x += ddx;
        p.y += ddy;
        p.px += ddx;
        p.py += ddy;
      }

      // Recompute ring centroid
      let sx = 0,
        sy = 0;
      for (let k = 0; k < N_RING; k++) {
        sx += o.pts[k].x;
        sy += o.pts[k].y;
      }
      o.cx = sx / N_RING;
      o.cy = sy / N_RING;

      // Soft-snap nucleus point toward centroid each frame
      const snap = 0.07;
      const nuc = o.pts[N_RING];
      nuc.x += (o.cx - nuc.x) * snap;
      nuc.y += (o.cy - nuc.y) * snap;
      nuc.px += (o.cx - nuc.px) * snap;
      nuc.py += (o.cy - nuc.py) * snap;

      // Boundary: reverse drift velocity when center leaves margins
      const m = o.r * 0.65;
      if (o.cx < m || o.cx > this.w - m) o.vx *= -0.78;
      if (o.cy < m || o.cy > this.h - m) o.vy *= -0.78;
    }

    // Inter-organism repulsion (center-distance based)
    for (let i = 0; i < this.orgs.length; i++) {
      for (let j = i + 1; j < this.orgs.length; j++) {
        const a = this.orgs[i];
        const b = this.orgs[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minD = (a.r + b.r) * 0.85;
        if (d < minD) {
          const push = ((minD - d) / minD) * 32;
          a.vx -= (dx / d) * push;
          a.vy -= (dy / d) * push;
          b.vx += (dx / d) * push;
          b.vy += (dy / d) * push;
        }
      }
    }
  }

  private resolveConstraints(o: Org): void {
    const t = this.t;
    for (const s of o.sprs) {
      const pa = o.pts[s.a];
      const pb = o.pts[s.b];

      // Animate spoke rest lengths → traveling membrane wave
      let rest = s.rest;
      if (s.spokeFrac !== undefined) {
        const angle = s.spokeFrac * Math.PI * 2;
        const wave =
          Math.sin(angle * 3 - t * 2.0 + o.phase) * WAVE_AMP +
          Math.sin(angle * 5 + t * 1.4 + o.phase * 1.5) * (WAVE_AMP * 0.4);
        rest = s.rest * (1 + wave);
      }

      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const err = ((d - rest) / d) * s.k * 0.5;
      pa.x += dx * err;
      pa.y += dy * err;
      pb.x -= dx * err;
      pb.y -= dy * err;
    }
  }

  private applyPressure(o: Org): void {
    // Shoelace area
    let area = 0;
    for (let k = 0; k < N_RING; k++) {
      const j = (k + 1) % N_RING;
      area += o.pts[k].x * o.pts[j].y - o.pts[j].x * o.pts[k].y;
    }
    area = Math.abs(area) * 0.5;

    const target = Math.PI * o.r * o.r;
    const nudge = ((target - area) / target) * PRESSURE_K * o.r * 0.45;

    for (let k = 0; k < N_RING; k++) {
      const p = o.pts[k];
      const nx = p.x - o.cx;
      const ny = p.y - o.cy;
      const nd = Math.sqrt(nx * nx + ny * ny) || 1;
      p.x += (nx / nd) * nudge;
      p.y += (ny / nd) * nudge;
    }
  }

  private flowAngle(x: number, y: number): number {
    const nx = x / this.w;
    const ny = y / this.h;
    const t = this.t;
    return (
      Math.sin(nx * 3.2 + ny * 2.6 + t * 0.12) * Math.PI +
      Math.cos(nx * 1.8 - ny * 3.9 + t * 0.08) * 1.7
    );
  }

  // ── Spline builder ─────────────────────────────────────────────────────────
  // Midpoint B-spline: for each ring segment k, draws a quadratic bezier from
  // midpoint(P[k-1], P[k]) through P[k] to midpoint(P[k], P[k+1]).
  // All points are scaled toward (cx, cy) by `scale` before sampling.
  // Returns this.splBuf (mutated in-place) — safe because g.poly() is synchronous.
  private buildSpline(
    pts: Pt[],
    cx: number,
    cy: number,
    scale: number,
  ): typeof this.splBuf {
    const SUBS = SPLINE_SUBS;
    let idx = 0;
    for (let k = 0; k < N_RING; k++) {
      const pk = pts[k];
      const pn = pts[(k + 1) % N_RING];
      const pp = pts[(k - 1 + N_RING) % N_RING];

      const sx = cx + (pk.x - cx) * scale;
      const sy = cy + (pk.y - cy) * scale;
      const nx = cx + (pn.x - cx) * scale;
      const ny = cy + (pn.y - cy) * scale;
      const ppx = cx + (pp.x - cx) * scale;
      const ppy = cy + (pp.y - cy) * scale;

      const startX = (ppx + sx) * 0.5;
      const startY = (ppy + sy) * 0.5;
      const endX = (sx + nx) * 0.5;
      const endY = (sy + ny) * 0.5;

      for (let j = 0; j < SUBS; j++) {
        const t = j / SUBS;
        const t1 = 1 - t;
        this.splBuf[idx].x = t1 * t1 * startX + 2 * t1 * t * sx + t * t * endX;
        this.splBuf[idx].y = t1 * t1 * startY + 2 * t1 * t * sy + t * t * endY;
        idx++;
      }
    }
    return this.splBuf;
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  private render(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });
    for (const o of this.orgs) this.drawOrganism(g, o);
  }

  private drawOrganism(g: Graphics, o: Org): void {
    const c = o.color;
    const cx = o.cx;
    const cy = o.cy;
    const pts = o.pts;

    // Interior membrane fill
    g.poly(this.buildSpline(pts, cx, cy, 1)).fill({ color: c, alpha: 0.055 });

    // Outer glow stroke (wide, very soft)
    g.poly(this.buildSpline(pts, cx, cy, 1)).stroke({
      color: c,
      alpha: 0.1,
      width: 9,
    });

    // Sharp membrane outline
    g.poly(this.buildSpline(pts, cx, cy, 1)).stroke({
      color: c,
      alpha: 0.68,
      width: 1.4,
    });

    // Concentric inner rings
    for (let ri = 0; ri < o.nRings; ri++) {
      const sc = 0.22 + (ri / o.nRings) * 0.55;
      g.poly(this.buildSpline(pts, cx, cy, sc)).stroke({
        color: c,
        alpha: 0.1 + ri * 0.04,
        width: 0.65,
      });
    }

    // Spokes from nucleus to membrane
    for (let k = 0; k < N_RING; k++) {
      g.moveTo(cx, cy)
        .lineTo(pts[k].x, pts[k].y)
        .stroke({ color: c, alpha: 0.055, width: 0.5 });
    }

    // Nucleus layered glow
    const pr = o.r * (0.13 + Math.sin(this.t * 1.85 + o.phase) * 0.04);
    g.circle(cx, cy, pr * 4).fill({ color: c, alpha: 0.025 });
    g.circle(cx, cy, pr * 2.2).fill({ color: c, alpha: 0.07 });
    g.circle(cx, cy, pr).fill({ color: c, alpha: 0.27 });
    g.circle(cx, cy, pr * 0.38).fill({ color: 0xffffff, alpha: 0.52 });

    // Membrane node dots
    for (let k = 0; k < N_RING; k++) {
      g.circle(pts[k].x, pts[k].y, 1.7).fill({ color: c, alpha: 0.72 });
    }
  }
}

function plen(a: Pt, b: Pt): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
