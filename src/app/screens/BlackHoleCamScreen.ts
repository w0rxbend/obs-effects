import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;

const MAUVE    = 0xcba6f7;
const PINK     = 0xf38ba8;
const PEACH    = 0xfab387;
const YELLOW   = 0xf9e2af;
const LAVENDER = 0xb4befe;
const BLUE     = 0x89b4fa;
const SURFACE0 = 0x313244;
const BASE     = 0x1e1e2e;
const CRUST    = 0x11111b;

const WEBCAM_R  = 200;
const TILT_RAD  = 17 * (Math.PI / 180);
const COS_TILT  = Math.cos(TILT_RAD);
const SIN_TILT  = Math.sin(TILT_RAD);

function rand(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }

// Project a point on a tilted ellipse to screen space.
// The tilt is a rotation about the x-axis: bottom of ellipse swings toward viewer.
function tiltedPt(a: number, b: number, t: number): { x: number; y: number } {
  const rx = a * Math.cos(t);
  const ry = b * Math.sin(t);
  return { x: rx * COS_TILT - ry * SIN_TILT, y: rx * SIN_TILT + ry * COS_TILT };
}

interface RingDef { a: number; b: number; color: number; alpha: number; width: number; }

// Rings ordered innermost (hot) → outermost (cool)
const RINGS: readonly RingDef[] = [
  { a: WEBCAM_R * 1.04, b: WEBCAM_R * 0.270, color: YELLOW,   alpha: 0.92, width: 2.5 },
  { a: WEBCAM_R * 1.09, b: WEBCAM_R * 0.283, color: YELLOW,   alpha: 0.84, width: 3.5 },
  { a: WEBCAM_R * 1.15, b: WEBCAM_R * 0.299, color: PEACH,    alpha: 0.76, width: 3.0 },
  { a: WEBCAM_R * 1.22, b: WEBCAM_R * 0.317, color: PINK,     alpha: 0.67, width: 2.5 },
  { a: WEBCAM_R * 1.30, b: WEBCAM_R * 0.338, color: MAUVE,    alpha: 0.56, width: 2.0 },
  { a: WEBCAM_R * 1.40, b: WEBCAM_R * 0.364, color: LAVENDER, alpha: 0.43, width: 1.5 },
  { a: WEBCAM_R * 1.52, b: WEBCAM_R * 0.395, color: SURFACE0, alpha: 0.28, width: 1.2 },
  { a: WEBCAM_R * 1.67, b: WEBCAM_R * 0.434, color: BASE,     alpha: 0.15, width: 1.0 },
];

interface Particle {
  angle:     number;
  speed:     number;
  a:         number;
  b:         number;
  size:      number;
  color:     number;
  baseAlpha: number;
}

export class BlackHoleCamScreen extends Container {
  public static assetBundles: string[] = [];

  // Layer order (back → front): shadow → backDisk → lensing → backPart → frontDisk → frontPart
  private readonly world        = new Container();
  private readonly shadowGfx    = new Graphics();
  private readonly backDiskGfx  = new Graphics();
  private readonly lensingGfx   = new Graphics();
  private readonly backPartGfx  = new Graphics();
  private readonly frontDiskGfx = new Graphics();
  private readonly frontPartGfx = new Graphics();

  private particles: Particle[] = [];
  private time = 0;

  constructor() {
    super();
    this.addChild(this.world);
    for (const g of [
      this.shadowGfx, this.backDiskGfx, this.lensingGfx,
      this.backPartGfx, this.frontDiskGfx, this.frontPartGfx,
    ]) this.world.addChild(g);

    this._initParticles();
  }

  private _initParticles(): void {
    const COLORS = [MAUVE, PINK, PEACH, YELLOW, LAVENDER, BLUE];
    for (let i = 0; i < 55; i++) {
      const ri   = Math.floor(rand(0, RINGS.length - 1));
      const ring = RINGS[ri];
      this.particles.push({
        angle:     rand(0, TAU),
        speed:     rand(0.010, 0.028) * (Math.random() > 0.5 ? 1 : -1),
        a:         ring.a + rand(-15, 15),
        b:         ring.b + rand(-5, 5),
        size:      rand(1.5, 3.5),
        color:     COLORS[Math.floor(Math.random() * COLORS.length)],
        baseAlpha: rand(0.50, 1.0),
      });
    }
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.world.x = w * 0.5;
    this.world.y = h * 0.5;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this._drawShadow();
    this._drawBackDisk();
    this._drawLensing();
    this._drawFrontDisk();
    this._updateParticles(dt);
  }

  // ─── Gravitational shadow: dark gradient ring just outside the cam circle ──

  private _drawShadow(): void {
    const g      = this.shadowGfx;
    g.clear();
    const extent = WEBCAM_R * 0.75;
    const LAYERS = 30;
    const layerH = extent / LAYERS;

    // Concentric strokes ensure the cam center is never touched.
    // Stroke at radius r covers [r - w/2, r + w/2]; innermost starts at WEBCAM_R.
    for (let i = 0; i < LAYERS; i++) {
      const r     = WEBCAM_R + layerH * (i + 0.5);
      const t     = i / (LAYERS - 1);
      const alpha = Math.pow(1 - t, 1.6) * 0.62;
      g.circle(0, 0, r);
      g.stroke({ color: CRUST, width: layerH * 2.4, alpha });
    }
  }

  // ─── Disk arc helpers ──────────────────────────────────────────────────────

  private _buildPts(
    ring: RingDef, tStart: number, tEnd: number, skipCam: boolean,
  ): Array<{ x: number; y: number } | null> {
    const N    = 90;
    const camR = (WEBCAM_R - 2) * (WEBCAM_R - 2);
    const pts: Array<{ x: number; y: number } | null> = [];
    for (let i = 0; i <= N; i++) {
      const t  = tStart + (i / N) * (tEnd - tStart);
      const pt = tiltedPt(ring.a, ring.b, t);
      pts.push(skipCam && (pt.x * pt.x + pt.y * pt.y) < camR ? null : pt);
    }
    return pts;
  }

  private _strokePts(
    g: Graphics,
    pts: Array<{ x: number; y: number } | null>,
    color: number, width: number, alpha: number,
  ): void {
    if (alpha < 0.002) return;
    let started = false;
    for (const pt of pts) {
      if (!pt) { started = false; continue; }
      if (!started) { g.moveTo(pt.x, pt.y); started = true; }
      else g.lineTo(pt.x, pt.y);
    }
    g.stroke({ color, width, alpha });
  }

  private _drawRingArc(
    g: Graphics, ring: RingDef,
    tStart: number, tEnd: number,
    alphaScale: number, skipCam: boolean,
  ): void {
    const pts = this._buildPts(ring, tStart, tEnd, skipCam);
    const a   = ring.alpha * alphaScale;
    this._strokePts(g, pts, ring.color, ring.width * 7, a * 0.05);
    this._strokePts(g, pts, ring.color, ring.width * 3, a * 0.18);
    this._strokePts(g, pts, ring.color, ring.width,     a);
  }

  // ─── Back disk (upper arc, far side — dimmer, hidden behind cam shadow) ────

  private _drawBackDisk(): void {
    const g     = this.backDiskGfx;
    g.clear();
    // Pulse is offset by π so back dims when front brightens
    const pulse = 0.80 + 0.20 * Math.sin(this.time * 0.65 + Math.PI);
    for (const ring of RINGS) {
      // t ∈ [π, 2π] → rawY = b·sin(t) ≤ 0 → upper screen half (far side)
      this._drawRingArc(g, ring, Math.PI, TAU, pulse * 0.42, true);
    }
  }

  // ─── Front disk (lower arc, near side — brighter, overlaps cam bottom) ─────

  private _drawFrontDisk(): void {
    const g     = this.frontDiskGfx;
    g.clear();
    const pulse = 0.80 + 0.20 * Math.sin(this.time * 0.65);
    for (const ring of RINGS) {
      // t ∈ [0, π] → rawY = b·sin(t) ≥ 0 → lower screen half (near side)
      // skipCam = false: intentionally overlaps bottom of cam circle
      this._drawRingArc(g, ring, 0, Math.PI, pulse, false);
    }
  }

  // ─── Gravitational lensing ring ────────────────────────────────────────────

  private _drawLensing(): void {
    const g    = this.lensingGfx;
    g.clear();
    const sh1  = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * 1.9));
    const sh2  = 0.40 + 0.60 * (0.5 + 0.5 * Math.sin(this.time * 2.5 + 1.3));
    const SEGS = 128;
    const lr   = WEBCAM_R + 4;

    const ring = (r: number) => {
      for (let i = 0; i <= SEGS; i++) {
        const a = (i / SEGS) * TAU;
        if (i === 0) g.moveTo(r * Math.cos(a), r * Math.sin(a));
        else         g.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
    };

    ring(lr);
    g.stroke({ color: BLUE,    width: 18, alpha: sh1 * 0.07 });
    ring(lr);
    g.stroke({ color: LAVENDER, width: 7,  alpha: sh1 * 0.22 });
    ring(lr);
    g.stroke({ color: BLUE,    width: 2,   alpha: sh2 * 0.82 });
  }

  // ─── Orbiting particles ────────────────────────────────────────────────────

  private _updateParticles(dt: number): void {
    const bg    = this.backPartGfx;
    const fg    = this.frontPartGfx;
    const camR2 = WEBCAM_R * WEBCAM_R;
    bg.clear();
    fg.clear();

    for (const p of this.particles) {
      p.angle += p.speed * dt;

      const pt      = tiltedPt(p.a, p.b, p.angle);
      const isFront = p.b * Math.sin(p.angle) >= 0; // bottom half of orbit = near side
      const d2      = pt.x * pt.x + pt.y * pt.y;

      // Back-side particles inside the cam circle are hidden behind the black hole
      if (!isFront && d2 < camR2) continue;

      const g = isFront ? fg : bg;
      const a = p.baseAlpha * (isFront ? 1.0 : 0.48);

      g.circle(pt.x, pt.y, p.size * 3.5).fill({ color: p.color, alpha: a * 0.10 });
      g.circle(pt.x, pt.y, p.size      ).fill({ color: p.color, alpha: a });
    }
  }
}
