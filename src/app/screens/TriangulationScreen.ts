import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha — dark background tones for triangle fills ───────────────
const DARK: [number, number, number][] = [
  [ 11,  11,  18],  // Crust (darkest)
  [ 17,  17,  27],  // Crust
  [ 17,  17,  27],  // Crust
  [ 24,  24,  37],  // Mantle
  [ 30,  30,  46],  // Base
  [ 24,  24,  37],  // Mantle
  [ 17,  17,  27],  // Crust
  [ 11,  11,  18],  // Crust (wrap)
];

// ── Catppuccin Mocha — vivid accent colors for dots & lines ──────────────────
const ACCENT: [number, number, number][] = [
  [203, 166, 247],  // Mauve
  [137, 180, 250],  // Blue
  [116, 199, 236],  // Sapphire
  [148, 226, 213],  // Teal
  [166, 227, 161],  // Green
  [249, 226, 175],  // Yellow
  [250, 179, 135],  // Peach
  [243, 139, 168],  // Red
  [245, 194, 231],  // Pink
  [242, 205, 205],  // Flamingo
  [203, 166, 247],  // Mauve (wrap)
];

function lerpGrad(stops: [number, number, number][], t: number): number {
  const n   = stops.length - 1;
  const pos = ((t % 1) + 1) % 1 * n;
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos) % stops.length;
  const f   = pos - lo;
  const [r0, g0, b0] = stops[lo];
  const [r1, g1, b1] = stops[hi];
  const r = Math.round(r0 + (r1 - r0) * f);
  const g = Math.round(g0 + (g1 - g0) * f);
  const b = Math.round(b0 + (b1 - b0) * f);
  return (r << 16) | (g << 8) | b;
}

const darkColor   = (t: number) => lerpGrad(DARK,   t);
const accentColor = (t: number) => lerpGrad(ACCENT, t);

// ── Constants ─────────────────────────────────────────────────────────────────
const COLS        = 38;
const ROWS        = 24;
const JITTER      = 0.38;
const WAVE_AMP    = 26;
const WAVE_SPEED  = 0.55;
const DOT_R       = 2.2;

// Physics
const SPRING_K    = 0.018;   // spring stiffness toward rest length
const HOME_K      = 0.004;   // weak pull back to home position
const WANDER_K    = 0.009;   // spring toward random wander target
const WANDER_R    = 28;      // max wander radius from home+jitter
const DAMP        = 0.92;    // velocity damping per frame
const TURB        = 0.12;    // random turbulence per frame

interface Pt {
  hx: number; hy: number;   // home (grid) position
  x:  number; y:  number;   // current position
  vx: number; vy: number;   // velocity
  jx: number; jy: number;   // frozen jitter
  // rest distances to the 4 cardinal neighbors (set once at build time)
  restN: number; restE: number; restS: number; restW: number;
  // wandering spring target (shifts randomly over time)
  tx: number; ty: number;
  tTimer: number; tInterval: number;
}

interface Tri { a: number; b: number; c: number; }

export class TriangulationScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx: Graphics;
  private pts:  Pt[]  = [];
  private tris: Tri[] = [];

  private W = 800;
  private H = 600;
  private time = 0;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  private _build(): void {
    const cellW = this.W / (COLS - 1);
    const cellH = this.H / (ROWS - 1);

    this.pts = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const hx = c * cellW;
        const hy = r * cellH;
        const jx = (Math.random() - 0.5) * cellW * JITTER;
        const jy = (Math.random() - 0.5) * cellH * JITTER;
        const angle = Math.random() * Math.PI * 2;
        const rad   = Math.random() * WANDER_R;
        this.pts.push({
          hx, hy, jx, jy,
          x: hx + jx, y: hy + jy,
          vx: 0, vy: 0,
          restN: cellH, restE: cellW, restS: cellH, restW: cellW,
          tx: hx + jx + Math.cos(angle) * rad,
          ty: hy + jy + Math.sin(angle) * rad,
          tTimer:    Math.random() * 120,
          tInterval: 80 + Math.random() * 140,
        });
      }
    }

    // Two triangles per quad cell
    this.tris = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const tl = r * COLS + c;
        const tr = tl + 1;
        const bl = tl + COLS;
        const br = bl + 1;
        this.tris.push({ a: tl, b: tr, c: bl });
        this.tris.push({ a: tr, b: br, c: bl });
      }
    }
  }

  // ── Wave ──────────────────────────────────────────────────────────────────

  private _wave(nx: number, ny: number, t: number): number {
    return (
      Math.sin(nx * 2.8 + t)               * 0.50 +
      Math.sin(ny * 2.2 + t * 0.73)        * 0.30 +
      Math.sin((nx + ny) * 1.9 + t * 1.35) * 0.20
    );
  }

  // ── Physics ───────────────────────────────────────────────────────────────

  private _applySpring(a: Pt, b: Pt, restLen: number): void {
    const dx   = b.x - a.x;
    const dy   = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const f    = (dist - restLen) * SPRING_K;
    const fx   = (dx / dist) * f;
    const fy   = (dy / dist) * f;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  private _updatePhysics(dt: number): void {
    const dts = dt * 0.5;

    // Spring forces between cardinal neighbors
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const p = this.pts[i];

        if (c < COLS - 1) this._applySpring(p, this.pts[i + 1],      p.restE);
        if (r < ROWS - 1) this._applySpring(p, this.pts[i + COLS],   p.restS);
        // Diagonal springs for better mesh rigidity
        if (c < COLS - 1 && r < ROWS - 1) {
          const diagLen = Math.sqrt(p.restE * p.restE + p.restS * p.restS);
          this._applySpring(p, this.pts[i + COLS + 1], diagLen);
        }
        if (c > 0 && r < ROWS - 1) {
          const diagLen = Math.sqrt(p.restW * p.restW + p.restS * p.restS);
          this._applySpring(p, this.pts[i + COLS - 1], diagLen);
        }
      }
    }

    // Integrate velocities
    for (const pt of this.pts) {
      // Wander target — picks a new random destination periodically
      pt.tTimer += 1;
      if (pt.tTimer >= pt.tInterval) {
        pt.tTimer    = 0;
        pt.tInterval = 80 + Math.random() * 140;
        const angle  = Math.random() * Math.PI * 2;
        const rad    = Math.random() * WANDER_R;
        pt.tx = pt.hx + pt.jx + Math.cos(angle) * rad;
        pt.ty = pt.hy + pt.jy + Math.sin(angle) * rad;
      }
      pt.vx += (pt.tx - pt.x) * WANDER_K;
      pt.vy += (pt.ty - pt.y) * WANDER_K;

      // Weak home attraction keeps the mesh from drifting
      pt.vx += (pt.hx + pt.jx - pt.x) * HOME_K;
      pt.vy += (pt.hy + pt.jy - pt.y) * HOME_K;

      // Low turbulence to keep dots alive
      pt.vx += (Math.random() - 0.5) * TURB;
      pt.vy += (Math.random() - 0.5) * TURB;

      pt.vx *= DAMP;
      pt.vy *= DAMP;

      pt.x += pt.vx * dts;
      pt.y += pt.vy * dts;
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016 * WAVE_SPEED;

    // Apply wave as a velocity impulse each frame (not direct displacement)
    const nx = (c: number) => c / (COLS - 1);
    const ny = (r: number) => r / (ROWS - 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pt = this.pts[r * COLS + c];
        const w  = this._wave(nx(c), ny(r), this.time);
        // Wave nudges vertical velocity — creates the flowing 3-D undulation
        pt.vy += w * 0.28;
      }
    }

    this._updatePhysics(dt);
    this._draw();
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private _draw(): void {
    const g = this.gfx;
    g.clear();

    const nx = (c: number) => c / (COLS - 1);
    const ny = (r: number) => r / (ROWS - 1);

    // Filled triangles
    for (const tri of this.tris) {
      const pa = this.pts[tri.a];
      const pb = this.pts[tri.b];
      const pc = this.pts[tri.c];

      const ra = tri.a % COLS; const ca = Math.floor(tri.a / COLS);
      const rb = tri.b % COLS; const cb = Math.floor(tri.b / COLS);
      const rc = tri.c % COLS; const cc = Math.floor(tri.c / COLS);
      const avgNx = (nx(ra) + nx(rb) + nx(rc)) / 3;
      const avgNy = (ny(ca) + ny(cb) + ny(cc)) / 3;
      const wv    = this._wave(avgNx, avgNy, this.time);
      const t     = (wv * 0.5 + 0.5) + this.time * 0.08;

      const fill = darkColor(t * 0.55);          // slow cycle through dark tones
      const edge = accentColor(t);               // vivid color on edges

      g.moveTo(pa.x, pa.y);
      g.lineTo(pb.x, pb.y);
      g.lineTo(pc.x, pc.y);
      g.closePath();
      g.fill({ color: fill, alpha: 0.92 });
      g.moveTo(pa.x, pa.y);
      g.lineTo(pb.x, pb.y);
      g.lineTo(pc.x, pc.y);
      g.closePath();
      g.stroke({ color: edge, width: 1.0, alpha: 0.55 });
    }

    // Vertex dots
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pt = this.pts[r * COLS + c];
        const wv = this._wave(nx(c), ny(r), this.time);
        const t  = (wv * 0.5 + 0.5) + this.time * 0.08;
        g.circle(pt.x, pt.y, DOT_R);
        g.fill({ color: accentColor(t + 0.3), alpha: 0.95 });
      }
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this._build();
  }
}
