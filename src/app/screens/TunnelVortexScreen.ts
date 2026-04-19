import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

// ── Rings ─────────────────────────────────────────────────────────────────────
const N_RINGS      = 32;
// depth ∈ [MIN_DEPTH, MAX_DEPTH]; rings travel from MAX toward MIN, then recycle
const MIN_DEPTH    = 0.05;
const MAX_DEPTH    = 1.00;
const TUNNEL_SPEED = 0.28;   // depth units / second

// Screen radius = halfDiag * RADIUS_SCALE * MIN_DEPTH / depth
// → at MIN_DEPTH the ring fills RADIUS_SCALE × the screen diagonal
const RADIUS_SCALE = 1.35;

// ── Vortex cage ───────────────────────────────────────────────────────────────
const SPOKES         = 8;
const TWIST          = 4.0;   // radians of total angular twist across depth range
const VORTEX_SPEED   = 0.20;  // global cage spin (rad/s)

// ── Color: deep purple → indigo → electric blue → cyan ───────────────────────
const COLOR_STOPS: [number, number, number][] = [
  [76,  29, 149],
  [109, 40, 217],
  [79,  70, 229],
  [37,  99, 235],
  [14, 165, 233],
  [6,  182, 212],
  [76,  29, 149],   // wrap
];

interface Ring { depth: number; colorPhase: number; }

export class TunnelVortexScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private rings: Ring[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> { /* nothing */ }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  private init(): void {
    this.rings = [];
    for (let i = 0; i < N_RINGS; i++) {
      const t = i / (N_RINGS - 1);
      this.rings.push({
        depth:      MIN_DEPTH + (MAX_DEPTH - MIN_DEPTH) * t,
        colorPhase: t,
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    for (const r of this.rings) {
      r.depth      -= TUNNEL_SPEED * dt;
      r.colorPhase  = (r.colorPhase + TUNNEL_SPEED * dt * 0.18) % 1;
      if (r.depth < MIN_DEPTH) r.depth += (MAX_DEPTH - MIN_DEPTH);
    }

    const g        = this.gfx;
    const cx       = this.w / 2;
    const cy       = this.h / 2;
    const halfDiag = Math.hypot(cx, cy);

    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Sort back→front (large depth first) so near rings paint on top
    const sorted = this.rings.slice().sort((a, b) => b.depth - a.depth);

    const vortexAngle = this.time * VORTEX_SPEED;

    for (let ri = 0; ri < sorted.length; ri++) {
      const ring = sorted[ri];

      // Viewport-relative screen radius: big when close, tiny when far
      const sr = halfDiag * RADIUS_SCALE * MIN_DEPTH / ring.depth;

      // Depth fraction 0=close, 1=far; fade rings at both extremes
      const depthFrac = (ring.depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH);
      const alpha = Math.min(1, depthFrac * 6) * Math.min(1, (1 - depthFrac) * 6);
      if (alpha < 0.01) continue;

      const color = stopColor(COLOR_STOPS, (ring.colorPhase + this.time * 0.05) % 1);

      // Glow → core
      g.circle(cx, cy, sr).stroke({ width: 24, color, alpha: alpha * 0.02 });
      g.circle(cx, cy, sr).stroke({ width: 8,  color, alpha: alpha * 0.07 });
      g.circle(cx, cy, sr).stroke({ width: 2,  color, alpha: alpha * 0.90 });

      // Vortex cage: diagonal spokes to next ring
      const next = sorted[ri + 1];
      if (!next) continue;
      const srNext     = halfDiag * RADIUS_SCALE * MIN_DEPTH / next.depth;
      const nextFrac   = (next.depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH);
      const nextAlpha  = Math.min(1, nextFrac * 6) * Math.min(1, (1 - nextFrac) * 6);
      const spokeAlpha = Math.min(alpha, nextAlpha) * 0.4;
      if (spokeAlpha < 0.01) continue;

      for (let s = 0; s < SPOKES; s++) {
        const angleA = (s / SPOKES) * Math.PI * 2 + vortexAngle + ring.depth     * TWIST;
        const angleB = (s / SPOKES) * Math.PI * 2 + vortexAngle + next.depth     * TWIST;
        g.moveTo(cx + sr     * Math.cos(angleA), cy + sr     * Math.sin(angleA))
          .lineTo(cx + srNext * Math.cos(angleB), cy + srNext * Math.sin(angleB))
          .stroke({ width: 1, color, alpha: spokeAlpha });
      }
    }

    // Dark vanishing point
    g.circle(cx, cy, 12).fill({ color: BG, alpha: 1 });
    g.circle(cx, cy, 28).fill({ color: BG, alpha: 0.7 });
  }
}

function stopColor(stops: [number, number, number][], t: number): number {
  const n  = stops.length - 1;
  const s  = Math.max(0, Math.min(0.9999, t)) * n;
  const i  = Math.floor(s);
  const f  = s - i;
  const a  = stops[i],  b = stops[i + 1];
  return (Math.round(a[0] + (b[0] - a[0]) * f) << 16)
       | (Math.round(a[1] + (b[1] - a[1]) * f) << 8)
       |  Math.round(a[2] + (b[2] - a[2]) * f);
}
