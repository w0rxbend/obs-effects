import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const CATT_ROSEWATER = 0xf5e0dc;
const CATT_FLAMINGO  = 0xf2cdcd;
const CATT_PINK      = 0xf5c2e7;
const CATT_MAUVE     = 0xcba6f7;
const CATT_RED       = 0xf38ba8;
const CATT_MAROON    = 0xeba0ac;
const CATT_PEACH     = 0xfab387;
const CATT_YELLOW    = 0xf9e2af;
const CATT_GREEN     = 0xa6e3a1;
const CATT_TEAL      = 0x94e2d5;
const CATT_SKY       = 0x89dceb;
const CATT_SAPPHIRE  = 0x74c7ec;
const CATT_BLUE      = 0x89b4fa;
const CATT_LAVENDER  = 0xb4befe;

const PALETTE = [
  CATT_ROSEWATER, CATT_FLAMINGO, CATT_PINK, CATT_MAUVE, CATT_RED,
  CATT_MAROON, CATT_PEACH, CATT_YELLOW, CATT_GREEN, CATT_TEAL,
  CATT_SKY, CATT_SAPPHIRE, CATT_BLUE, CATT_LAVENDER,
] as const;

type CattColor = (typeof PALETTE)[number];

function randColor(): CattColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

// ── Geometry constants ────────────────────────────────────────────────────────
const WEBCAM_R  = 200;
const BORDER_R  = WEBCAM_R + 3;
const ORBIT_R   = WEBCAM_R + 38;  // inner orbit ring
const ORBIT_R2  = WEBCAM_R + 20;  // outer orbit ring (closer to border)
const PHYS_R    = WEBCAM_R + 62;

// ── Types ─────────────────────────────────────────────────────────────────────
type CrystalShape = "hexagon" | "diamond" | "triangle" | "star" | "pentagon";

interface Crystal {
  x: number; y: number;
  vx: number; vy: number;
  rotation: number;
  rotSpeed: number;
  size: number;
  shape: CrystalShape;
  color: CattColor;
  alpha: number;
  alphaDir: number;
  gfx: Graphics;
}

interface Fireball {
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  size: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
  gfx: Graphics;
}

interface OrbitDot {
  angle: number;
  speed: number;
  size: number;
  color: CattColor;
  gfx: Graphics;
  x: number;
  y: number;
}

interface PhysParticle {
  x: number; y: number;
  vx: number; vy: number;
  homeX: number; homeY: number;
}

/** Particle on the fluid orbit ring — pinned softly to orbit path */
interface FluidNode {
  x: number; y: number;
  vx: number; vy: number;
  homeAngle: number; // angle on the orbit circle
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class CrystalCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world:         Container;
  private readonly borderGfx:     Graphics;
  private readonly connectionGfx: Graphics;
  private readonly physGfx:       Graphics;

  private crystals:       Crystal[]      = [];
  private fireballs:      Fireball[]     = [];
  private orbitDots:      OrbitDot[]     = []; // inner ring
  private orbitDots2:     OrbitDot[]     = []; // outer ring
  private physParticles:  PhysParticle[] = [];
  private fluidNodes:     FluidNode[]    = [];
  private fluidGfx!:      Graphics;
  private fluidColor:     CattColor      = CATT_SKY;
  private fluidColorTimer = 0;

  private time = 0;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    this.borderGfx = new Graphics();
    this.world.addChild(this.borderGfx);

    this.connectionGfx = new Graphics();
    this.world.addChild(this.connectionGfx);

    this.physGfx = new Graphics();
    this.world.addChild(this.physGfx);

    this.fluidGfx = new Graphics();
    this.world.addChild(this.fluidGfx);

    this._initCrystals();
    this._initFireballs();
    this._initOrbitDots();
    this._initOrbitDots2();
    this._initPhysicsRing();
    this._initFluidRing();
  }

  // ── Init helpers ──────────────────────────────────────────────────────────

  private _initCrystals(): void {
    const shapes: CrystalShape[] = ["hexagon", "diamond", "triangle", "star", "pentagon"];
    for (let i = 0; i < 22; i++) {
      const gfx   = new Graphics();
      this.world.addChild(gfx);
      const angle = Math.random() * Math.PI * 2;
      const dist  = WEBCAM_R + 70 + Math.random() * 200;
      this.crystals.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.018,
        size: 7 + Math.random() * 22,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        color: randColor(),
        alpha: 0.3 + Math.random() * 0.6,
        alphaDir: Math.random() > 0.5 ? 1 : -1,
        gfx,
      });
    }
  }

  private _initFireballs(): void {
    for (let i = 0; i < 6; i++) {
      const gfx = new Graphics();
      this.world.addChild(gfx);
      this.fireballs.push({
        angle:       (i / 6) * Math.PI * 2,
        orbitRadius: WEBCAM_R + 55 + Math.random() * 90,
        orbitSpeed:  (0.006 + Math.random() * 0.009) * (Math.random() > 0.4 ? 1 : -1),
        size:        9 + Math.random() * 13,
        trail:       [],
        gfx,
      });
    }
  }

  private _initOrbitDots(): void {
    for (let i = 0; i < 24; i++) {
      const gfx = new Graphics();
      this.world.addChild(gfx);
      this.orbitDots.push({
        angle: (i / 24) * Math.PI * 2,
        speed: (0.01 + Math.random() * 0.009) * (Math.random() > 0.5 ? 1 : -1),
        size:  3 + Math.random() * 4,
        color: randColor(),
        gfx,
        x: 0,
        y: 0,
      });
    }
  }

  private _initOrbitDots2(): void {
    for (let i = 0; i < 16; i++) {
      const gfx = new Graphics();
      this.world.addChild(gfx);
      this.orbitDots2.push({
        angle: (i / 16) * Math.PI * 2 + Math.PI / 16,
        // opposite direction to inner ring for more cross-connections
        speed: (0.014 + Math.random() * 0.008) * (Math.random() > 0.5 ? -1 : 1),
        size:  2.5 + Math.random() * 3,
        color: randColor(),
        gfx,
        x: 0,
        y: 0,
      });
    }
  }

  private _initFluidRing(): void {
    // Dense ring of nodes sitting on ORBIT_R — will vibrate fluidly
    const N = 80;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      this.fluidNodes.push({
        x: Math.cos(a) * ORBIT_R,
        y: Math.sin(a) * ORBIT_R,
        vx: 0, vy: 0,
        homeAngle: a,
      });
    }
  }

  private _initPhysicsRing(): void {
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      this.physParticles.push({
        x: Math.cos(a) * PHYS_R,  y: Math.sin(a) * PHYS_R,
        vx: 0, vy: 0,
        homeX: Math.cos(a) * PHYS_R,
        homeY: Math.sin(a) * PHYS_R,
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this._updateBorder();
    this._updateCrystals(dt);
    this._updateFireballs(dt);
    this._updateOrbitDots(dt);
    this._updateOrbitDots2(dt);
    this._drawConnections();
    this._updatePhysicsRing(dt);
    this._updateFluidRing(dt);
  }

  private _updateBorder(): void {
    const g = this.borderGfx;
    g.clear();

    const SEGS   = 28;
    const segArc = (Math.PI * 2) / SEGS;
    const spin   = this.time * 0.25;

    for (let i = 0; i < SEGS; i++) {
      const progress = ((i + spin) / SEGS) % 1;
      const palIdx   = Math.floor(progress * PALETTE.length) % PALETTE.length;
      const color    = PALETTE[palIdx];
      const startA   = i * segArc + spin * 0.6;
      const endA     = startA + segArc * 0.92;

      g.arc(0, 0, BORDER_R + 6, startA, endA);
      g.stroke({ color, width: 16, alpha: 0.08 });
      g.arc(0, 0, BORDER_R + 3, startA, endA);
      g.stroke({ color, width: 8, alpha: 0.18 });
      g.arc(0, 0, BORDER_R, startA, endA);
      g.stroke({ color, width: 3.5, alpha: 0.9 });
    }

    const accentColor = PALETTE[Math.floor(this.time * 0.7) % PALETTE.length];
    g.circle(0, 0, WEBCAM_R - 3);
    g.stroke({ color: accentColor, width: 1.5, alpha: 0.35 });
  }

  private _updateCrystals(dt: number): void {
    const outerBound = WEBCAM_R + 310;
    for (const c of this.crystals) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rotation += c.rotSpeed * dt;

      const dist = Math.sqrt(c.x * c.x + c.y * c.y);

      if (dist > outerBound) {
        const nx = c.x / dist; const ny = c.y / dist;
        c.vx -= nx * 0.025;    c.vy -= ny * 0.025;
      }
      if (dist < WEBCAM_R + 50) {
        const nx = c.x / (dist || 1); const ny = c.y / (dist || 1);
        c.vx += nx * 0.06;             c.vy += ny * 0.06;
      }

      c.vx *= 0.995; c.vy *= 0.995;

      c.alpha += c.alphaDir * 0.004 * dt;
      if (c.alpha > 0.92) { c.alpha = 0.92; c.alphaDir = -1; }
      if (c.alpha < 0.15) { c.alpha = 0.15; c.alphaDir = 1; }

      if (Math.random() < 0.0007) c.color = randColor();

      const g = c.gfx;
      g.clear();
      this._drawShape(g, c.shape, c.size);
      g.fill({ color: c.color, alpha: c.alpha * 0.35 });
      this._drawShape(g, c.shape, c.size);
      g.stroke({ color: c.color, width: 1.5, alpha: c.alpha });
      g.x = c.x; g.y = c.y; g.rotation = c.rotation;
    }
  }

  // Catppuccin reds: hot core → warm mid → cool edge, all from the palette
  private static readonly FIREBALL_TRAIL = [
    CATT_RED, CATT_MAROON, CATT_FLAMINGO, CATT_ROSEWATER, CATT_PEACH,
  ] as const;

  private _updateFireballs(dt: number): void {
    for (const fb of this.fireballs) {
      fb.angle += fb.orbitSpeed * dt;
      const cx = Math.cos(fb.angle) * fb.orbitRadius;
      const cy = Math.sin(fb.angle) * fb.orbitRadius;

      fb.trail.unshift({ x: cx, y: cy, alpha: 0.85 });
      if (fb.trail.length > 22) fb.trail.pop();
      for (const tp of fb.trail) tp.alpha *= 0.87;

      const g     = fb.gfx;
      const trail = CrystalCamScreen.FIREBALL_TRAIL;
      g.clear();

      for (let i = 0; i < fb.trail.length; i++) {
        const tp     = fb.trail[i];
        const trailR = fb.size * (1 - i / fb.trail.length) * 0.75;
        const ci     = Math.min(Math.floor((i / fb.trail.length) * trail.length), trail.length - 1);
        g.circle(tp.x, tp.y, trailR);
        g.fill({ color: trail[ci], alpha: tp.alpha * 0.45 });
      }

      // Outer halo — rosewater blush
      g.circle(cx, cy, fb.size * 2.2);
      g.fill({ color: CATT_ROSEWATER, alpha: 0.08 });
      // Mid body — flamingo/maroon
      g.circle(cx, cy, fb.size * 1.3);
      g.fill({ color: CATT_MAROON, alpha: 0.4 });
      // Core — deep red
      g.circle(cx, cy, fb.size);
      g.fill({ color: CATT_RED, alpha: 0.92 });
      // Inner spark — bright flamingo-white
      g.circle(cx, cy, fb.size * 0.38);
      g.fill({ color: CATT_FLAMINGO, alpha: 0.97 });
    }
  }

  private _updateOrbitDots(dt: number): void {
    for (const dot of this.orbitDots) {
      dot.angle += dot.speed * dt;
      dot.x = Math.cos(dot.angle) * ORBIT_R;
      dot.y = Math.sin(dot.angle) * ORBIT_R;

      if (Math.random() < 0.0025) dot.color = randColor();

      const g = dot.gfx;
      g.clear();
      g.circle(dot.x, dot.y, dot.size * 2.8);
      g.fill({ color: dot.color, alpha: 0.13 });
      g.circle(dot.x, dot.y, dot.size);
      g.fill({ color: dot.color, alpha: 0.95 });
    }
  }

  private _updateOrbitDots2(dt: number): void {
    for (const dot of this.orbitDots2) {
      dot.angle += dot.speed * dt;
      dot.x = Math.cos(dot.angle) * ORBIT_R2;
      dot.y = Math.sin(dot.angle) * ORBIT_R2;

      if (Math.random() < 0.0025) dot.color = randColor();

      const g = dot.gfx;
      g.clear();
      g.circle(dot.x, dot.y, dot.size * 2.5);
      g.fill({ color: dot.color, alpha: 0.12 });
      g.circle(dot.x, dot.y, dot.size);
      g.fill({ color: dot.color, alpha: 0.9 });
    }
  }

  private _updateFluidRing(dt: number): void {
    const N          = this.fluidNodes.length;
    const radialK    = 0.055;  // spring back to orbit radius
    const neighborK  = 0.12;   // spring to adjacent node (maintains arc spacing)
    const damping    = 0.82;
    const dts        = dt * 0.5;

    // Slowly rotate color
    this.fluidColorTimer += dt * 0.008;
    if (this.fluidColorTimer > 1) {
      this.fluidColorTimer = 0;
      this.fluidColor = randColor();
    }

    for (let i = 0; i < N; i++) {
      const n    = this.fluidNodes[i];
      const prev = this.fluidNodes[(i - 1 + N) % N];
      const next = this.fluidNodes[(i + 1) % N];

      // Radial spring: pull toward ORBIT_R in the direction of homeAngle
      const homeX = Math.cos(n.homeAngle) * ORBIT_R;
      const homeY = Math.sin(n.homeAngle) * ORBIT_R;
      n.vx += (homeX - n.x) * radialK;
      n.vy += (homeY - n.y) * radialK;

      // Neighbor springs — keep arc length consistent (fluid tension)
      for (const nb of [prev, next]) {
        const dx    = nb.x - n.x;
        const dy    = nb.y - n.y;
        const dist  = Math.sqrt(dx * dx + dy * dy) || 0.001;
        // rest length = chord between two adjacent nodes on the orbit circle
        const restL = 2 * ORBIT_R * Math.sin(Math.PI / N);
        const err   = dist - restL;
        n.vx += (dx / dist) * err * neighborK;
        n.vy += (dy / dist) * err * neighborK;
      }

      // Turbulent kick — small random impulses create fluid-like rippling
      n.vx += (Math.random() - 0.5) * 0.55;
      n.vy += (Math.random() - 0.5) * 0.55;

      // Travelling wave disturbance — sinusoidal push tangent to orbit
      const wave = Math.sin(this.time * 3.5 + n.homeAngle * 4) * 0.18;
      n.vx += -Math.sin(n.homeAngle) * wave;
      n.vy +=  Math.cos(n.homeAngle) * wave;

      n.vx *= damping; n.vy *= damping;
      n.x  += n.vx * dts;
      n.y  += n.vy * dts;
    }

    // Draw fluid ring
    const g   = this.fluidGfx;
    const col = this.fluidColor;
    g.clear();

    // Outer glow
    g.moveTo(this.fluidNodes[0].x, this.fluidNodes[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.fluidNodes[i % N].x, this.fluidNodes[i % N].y);
    g.stroke({ color: col, width: 10, alpha: 0.07 });

    // Mid glow
    g.moveTo(this.fluidNodes[0].x, this.fluidNodes[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.fluidNodes[i % N].x, this.fluidNodes[i % N].y);
    g.stroke({ color: col, width: 4, alpha: 0.18 });

    // Core line
    g.moveTo(this.fluidNodes[0].x, this.fluidNodes[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.fluidNodes[i % N].x, this.fluidNodes[i % N].y);
    g.stroke({ color: col, width: 1.5, alpha: 0.7 });
  }

  /** Minimum distance from origin to the line segment (x1,y1)→(x2,y2) */
  private _chordClearance(x1: number, y1: number, x2: number, y2: number): number {
    const dx    = x2 - x1; const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt(x1 * x1 + y1 * y1);
    const t     = Math.max(0, Math.min(1, (-x1 * dx - y1 * dy) / lenSq));
    const cx    = x1 + t * dx; const cy = y1 + t * dy;
    return Math.sqrt(cx * cx + cy * cy);
  }

  private _drawConnections(): void {
    const g       = this.connectionGfx;
    g.clear();
    const maxDist = 120;
    const zapDist = 70;  // closer threshold triggers electric arcs
    const minClear = WEBCAM_R + 8; // chord must stay outside the camera circle
    const dots    = [...this.orbitDots, ...this.orbitDots2];

    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const a  = dots[i]; const b = dots[j];
        const dx = a.x - b.x; const dy = a.y - b.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d >= maxDist) continue;

        // Skip connections whose chord cuts through the camera area
        if (this._chordClearance(a.x, a.y, b.x, b.y) < minClear) continue;

        const alpha = (1 - d / maxDist) * 0.55;

        // Base connection line
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke({ color: a.color, width: 1, alpha });

        // Electric arc when very close
        if (d < zapDist) {
          const t      = 1 - d / zapDist; // 0→1 as dots approach
          const zaps   = Math.floor(1 + t * 3); // 1–4 arc segments

          for (let z = 0; z < zaps; z++) {
            this._drawLightningArc(g, a.x, a.y, b.x, b.y, a.color, t * 0.9);
          }

          // Glow halos on each dot when zapping
          g.circle(a.x, a.y, a.size * 3.5);
          g.fill({ color: a.color, alpha: t * 0.25 });
          g.circle(b.x, b.y, b.size * 3.5);
          g.fill({ color: b.color, alpha: t * 0.25 });
        }
      }
    }
  }

  /** Draw a jagged lightning arc between two points */
  private _drawLightningArc(
    g: Graphics,
    x1: number, y1: number,
    x2: number, y2: number,
    color: CattColor,
    intensity: number,
  ): void {
    const SEGS    = 6 + Math.floor(Math.random() * 5);
    const dx      = x2 - x1;
    const dy      = y2 - y1;
    const perp    = { x: -dy, y: dx }; // perpendicular direction
    const perpLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y) || 1;
    const pnx     = perp.x / perpLen;
    const pny     = perp.y / perpLen;
    const jitter  = 12 * intensity;

    const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
    for (let s = 1; s < SEGS; s++) {
      const t      = s / SEGS;
      const offset = (Math.random() - 0.5) * 2 * jitter;
      pts.push({
        x: x1 + dx * t + pnx * offset,
        y: y1 + dy * t + pny * offset,
      });
    }
    pts.push({ x: x2, y: y2 });

    // Glow pass
    g.moveTo(pts[0].x, pts[0].y);
    for (let s = 1; s < pts.length; s++) g.lineTo(pts[s].x, pts[s].y);
    g.stroke({ color, width: 4, alpha: intensity * 0.12 });

    // Core arc
    g.moveTo(pts[0].x, pts[0].y);
    for (let s = 1; s < pts.length; s++) g.lineTo(pts[s].x, pts[s].y);
    g.stroke({ color, width: 1, alpha: 0.5 + intensity * 0.45 });

    // Bright core flicker
    if (Math.random() < 0.4) {
      g.moveTo(pts[0].x, pts[0].y);
      for (let s = 1; s < pts.length; s++) g.lineTo(pts[s].x, pts[s].y);
      g.stroke({ color: 0xffffff, width: 0.5, alpha: intensity * 0.7 });
    }
  }

  private _updatePhysicsRing(dt: number): void {
    const N             = this.physParticles.length;
    const homeStiff     = 0.038;
    const neighborStiff = 0.055;
    const damping       = 0.87;
    const perturbAmp    = 0.35;

    for (let i = 0; i < N; i++) {
      const p    = this.physParticles[i];
      const prev = this.physParticles[(i - 1 + N) % N];
      const next = this.physParticles[(i + 1) % N];

      p.vx += (p.homeX - p.x) * homeStiff;
      p.vy += (p.homeY - p.y) * homeStiff;

      const midX = (prev.x + next.x) * 0.5;
      const midY = (prev.y + next.y) * 0.5;
      p.vx += (midX - p.x) * neighborStiff;
      p.vy += (midY - p.y) * neighborStiff;

      p.vx += (Math.random() - 0.5) * perturbAmp;
      p.vy += (Math.random() - 0.5) * perturbAmp;

      p.vx *= damping; p.vy *= damping;
      p.x  += p.vx * dt * 0.5;
      p.y  += p.vy * dt * 0.5;
    }

    const g         = this.physGfx;
    g.clear();
    const ringColor = PALETTE[Math.floor(this.time * 0.5) % PALETTE.length];

    g.moveTo(this.physParticles[0].x, this.physParticles[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.physParticles[i % N].x, this.physParticles[i % N].y);
    g.stroke({ color: ringColor, width: 8, alpha: 0.1 });

    g.moveTo(this.physParticles[0].x, this.physParticles[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.physParticles[i % N].x, this.physParticles[i % N].y);
    g.stroke({ color: ringColor, width: 2, alpha: 0.55 });
  }

  // ── Shape drawing ─────────────────────────────────────────────────────────

  private _drawShape(g: Graphics, shape: CrystalShape, size: number): void {
    switch (shape) {
      case "hexagon":  this._polygon(g, 6, size); break;
      case "pentagon": this._polygon(g, 5, size); break;
      case "triangle": this._polygon(g, 3, size); break;
      case "diamond":
        g.moveTo(0, -size);
        g.lineTo(size * 0.55, 0);
        g.lineTo(0, size);
        g.lineTo(-size * 0.55, 0);
        g.closePath();
        break;
      case "star": this._star(g, size, size * 0.42, 6); break;
    }
  }

  private _polygon(g: Graphics, sides: number, r: number): void {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else         g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  }

  private _star(g: Graphics, outer: number, inner: number, points: number): void {
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else         g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.world.x = width  * 0.5;
    this.world.y = height * 0.5;
  }
}
