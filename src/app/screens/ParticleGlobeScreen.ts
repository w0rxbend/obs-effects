import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const PALETTE = [
  0xcba6f7, // Mauve
  0xf38ba8, // Red
  0xfab387, // Peach
  0xf9e2af, // Yellow
  0xa6e3a1, // Green
  0x94e2d5, // Teal
  0x89dceb, // Sky
  0x74c7ec, // Sapphire
  0x89b4fa, // Blue
  0xb4befe, // Lavender
  0xf5c2e7, // Pink
] as const;

const BG    = 0x11111b;
const TAU   = Math.PI * 2;

const LAT_RINGS     = 8;
const LON_MERIDIANS = 12;
const SEGS          = 60;   // segments per lat ring / meridian
const SURFACE_COUNT = 110;
const FLOAT_COUNT   = 55;
const FOCAL         = 2000;
const TILT          = 0.42; // X-axis tilt (rad)
const ROT_SPEED     = 0.18; // Y-axis rotation (rad / s)

function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

interface SurfaceParticle {
  lat: number;
  lon: number;
  color: number;
  size: number;
  phase: number;
  pulseSpeed: number;
}

interface FloatParticle {
  x: number; y: number;
  vx: number; vy: number;
  color: number;
  size: number;
  alpha: number;
  alphaDir: number;
}

export class ParticleGlobeScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private surface: SurfaceParticle[] = [];
  private floaters: FloatParticle[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  private get R(): number { return Math.min(this.w, this.h) * 0.37; }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.spawn();
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.spawn();
  }

  private spawn(): void {
    this.surface = Array.from({ length: SURFACE_COUNT }, () => ({
      lat: Math.asin(rand(-1, 1)),
      lon: rand(0, TAU),
      color: pick(PALETTE),
      size: rand(2.2, 5.2),
      phase: rand(0, TAU),
      pulseSpeed: rand(0.02, 0.065),
    }));

    const cx = this.w / 2, cy = this.h / 2, R = this.R;
    this.floaters = Array.from({ length: FLOAT_COUNT }, () => {
      const a = rand(0, TAU);
      const d = rand(R * 1.15, R * 2.0);
      return {
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        vx: rand(-0.22, 0.22),
        vy: rand(-0.22, 0.22),
        color: pick(PALETTE),
        size: rand(1.5, 3.5),
        alpha: rand(0.3, 0.85),
        alphaDir: Math.random() < 0.5 ? 1 : -1,
      };
    });
  }

  // Returns (screen x, screen y, depth) where depth ∈ [-1,+1], +1 = closest to viewer.
  private project(lat: number, lon: number, rot: number): { x: number; y: number; z: number } {
    const R = this.R;

    // Unit sphere surface
    const sx = Math.cos(lat) * Math.cos(lon);
    const sy = Math.sin(lat);
    const sz = Math.cos(lat) * Math.sin(lon);

    // Y-axis rotation
    const rx = sx * Math.cos(rot) - sz * Math.sin(rot);
    const ry = sy;
    const rz = sx * Math.sin(rot) + sz * Math.cos(rot);

    // X-axis tilt
    const ty = ry * Math.cos(TILT) - rz * Math.sin(TILT);
    const tz = ry * Math.sin(TILT) + rz * Math.cos(TILT);

    // Perspective: tz > 0 = toward viewer → appears larger
    const scale = FOCAL / (FOCAL - tz * R);
    return {
      x: this.w / 2 + rx * R * scale,
      y: this.h / 2 + ty * R * scale,
      z: tz,
    };
  }

  public update(ticker: Ticker): void {
    const dt  = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    const rot = this.time * ROT_SPEED;

    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    this.drawWireframe(g, rot);
    this.drawIntersections(g, rot);
    this.drawSurface(g, rot);
    this.drawFloaters(g);
  }

  private drawWireframe(g: Graphics, rot: number): void {
    // Latitude rings
    for (let ri = 0; ri < LAT_RINGS; ri++) {
      const lat   = -Math.PI / 2 + (Math.PI / (LAT_RINGS + 1)) * (ri + 1);
      const color = PALETTE[ri % PALETTE.length];
      const pts   = Array.from({ length: SEGS + 1 }, (_, si) =>
        this.project(lat, (TAU / SEGS) * si, rot),
      );
      this.strokeSegments(g, pts, color, 0.85);
    }

    // Longitude meridians
    for (let mi = 0; mi < LON_MERIDIANS; mi++) {
      const lon   = (TAU / LON_MERIDIANS) * mi;
      const color = PALETTE[(mi + 3) % PALETTE.length];
      const pts   = Array.from({ length: SEGS + 1 }, (_, si) =>
        this.project(-Math.PI / 2 + (Math.PI / SEGS) * si, lon, rot),
      );
      this.strokeSegments(g, pts, color, 0.85);
    }
  }

  private strokeSegments(
    g: Graphics,
    pts: Array<{ x: number; y: number; z: number }>,
    color: number,
    base: number,
  ): void {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const avgZ = (a.z + b.z) * 0.5;
      const alpha = base * Math.max(0.04, (avgZ + 1) * 0.5 * 0.78 + 0.07);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 0.9, color, alpha });
    }
  }

  private drawIntersections(g: Graphics, rot: number): void {
    for (let ri = 0; ri < LAT_RINGS; ri++) {
      const lat = -Math.PI / 2 + (Math.PI / (LAT_RINGS + 1)) * (ri + 1);
      for (let mi = 0; mi < LON_MERIDIANS; mi++) {
        const lon           = (TAU / LON_MERIDIANS) * mi;
        const { x, y, z } = this.project(lat, lon, rot);
        const depth         = (z + 1) * 0.5;
        const alpha         = Math.max(0.06, depth * 0.9 + 0.08);
        const color         = PALETTE[(ri + mi) % PALETTE.length];
        const r             = 1.1 + depth * 1.1;

        g.circle(x, y, r * 3).fill({ color, alpha: alpha * 0.18 });
        g.circle(x, y, r).fill({ color, alpha });
      }
    }
  }

  private drawSurface(g: Graphics, rot: number): void {
    for (const sp of this.surface) {
      sp.phase += sp.pulseSpeed;
      const { x, y, z } = this.project(sp.lat, sp.lon, rot);
      const depth  = (z + 1) * 0.5;
      const alpha  = Math.max(0.07, depth * 0.88 + 0.1);
      const pulse  = 0.72 + 0.28 * Math.sin(sp.phase);
      const size   = sp.size * pulse * (0.55 + depth * 0.45);

      g.circle(x, y, size * 2.8).fill({ color: sp.color, alpha: alpha * 0.14 });
      g.circle(x, y, size).fill({ color: sp.color, alpha });
    }
  }

  private drawFloaters(g: Graphics): void {
    const cx = this.w / 2, cy = this.h / 2;
    const R  = this.R;

    for (const fp of this.floaters) {
      fp.x += fp.vx;
      fp.y += fp.vy;
      fp.alpha += fp.alphaDir * 0.005;
      if (fp.alpha >= 0.88) fp.alphaDir = -1;
      if (fp.alpha <= 0.12) fp.alphaDir =  1;

      // Gentle orbit
      const dx   = fp.x - cx, dy = fp.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const pull = (dist - R * 1.4) * 0.00007;
      fp.vx -= (dx / dist) * pull;
      fp.vy -= (dy / dist) * pull;

      const spd = Math.sqrt(fp.vx * fp.vx + fp.vy * fp.vy);
      if (spd > 0.38) { fp.vx = (fp.vx / spd) * 0.38; fp.vy = (fp.vy / spd) * 0.38; }

      if (dist > R * 3.2) {
        const a = rand(0, TAU), d = rand(R * 1.1, R * 1.9);
        fp.x = cx + Math.cos(a) * d;
        fp.y = cy + Math.sin(a) * d;
      }

      g.circle(fp.x, fp.y, fp.size * 2.8).fill({ color: fp.color, alpha: fp.alpha * 0.13 });
      g.circle(fp.x, fp.y, fp.size).fill({ color: fp.color, alpha: fp.alpha });
    }
  }
}
