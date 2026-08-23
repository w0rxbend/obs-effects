import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerp, TAU } from "../../lib/math";

// Catppuccin Mocha
const LAVENDER = 0xb4befe;
const SURFACE1 = 0x45475a;

const WEBCAM_R = 220;
const SPHERE_R = 340;
const FOCAL = 800;
const NUM_LAT = 16;
const NUM_LON = 24;
const STAR_COUNT = 200;

interface Star {
  x: number;
  y: number;
  color: number;
  alpha: number;
}
interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  midZ: number;
  isLon: boolean;
}

// Precomputed angle arrays — stable across frames
const LAT_PHI: number[] = [];
const LON_THETA: number[] = [];
const ALL_PHI: number[] = [];
for (let i = 0; i < NUM_LAT; i++)
  LAT_PHI.push(-Math.PI / 2 + ((i + 1) * Math.PI) / (NUM_LAT + 1));
for (let j = 0; j < NUM_LON; j++) LON_THETA.push((j * TAU) / NUM_LON);
ALL_PHI.push(-Math.PI / 2, ...LAT_PHI, Math.PI / 2);

// Pre-allocate segment array to avoid GC churn
const SEGS: Seg[] = [];
const SEG_COUNT = NUM_LAT * NUM_LON + NUM_LON * (NUM_LAT + 1);
for (let i = 0; i < SEG_COUNT; i++)
  SEGS.push({ x0: 0, y0: 0, x1: 0, y1: 0, midZ: 0, isLon: false });

export class WireframeSphereCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 800;
  private h = 800;
  private rotY = 0;
  private rotX = 0;
  private time = 0;
  private stars: Star[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  private spawnStars(): void {
    const cx = this.w / 2,
      cy = this.h / 2;
    this.stars = [];
    while (this.stars.length < STAR_COUNT) {
      const x = Math.random() * this.w;
      const y = Math.random() * this.h;
      const dx = x - cx,
        dy = y - cy;
      if (dx * dx + dy * dy > WEBCAM_R * WEBCAM_R) {
        this.stars.push({
          x,
          y,
          color: Math.random() < 0.5 ? SURFACE1 : LAVENDER,
          alpha: 0.04 + Math.random() * 0.12,
        });
      }
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 800;
    this.h = window.innerHeight || 800;
    this.spawnStars();
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.spawnStars();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    this.time += dt;
    this.rotY += dt * 0.22;
    this.rotX = Math.sin(this.time * 0.15) * 0.22;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const maxDist = Math.min(this.w, this.h) / 2;

    g.clear();

    for (const s of this.stars) {
      g.circle(s.x, s.y, 0.5).fill({ color: s.color, alpha: s.alpha });
    }

    g.circle(cx, cy, WEBCAM_R).stroke({
      color: LAVENDER,
      alpha: 0.55,
      width: 1.5,
    });

    const cosY = Math.cos(this.rotY),
      sinY = Math.sin(this.rotY);
    const cosX = Math.cos(this.rotX),
      sinX = Math.sin(this.rotX);

    // Inline projection to avoid object allocation per call
    const proj = (
      phi: number,
      theta: number,
    ): { sx: number; sy: number; z3d: number } => {
      const x0 = SPHERE_R * Math.cos(phi) * Math.cos(theta);
      const y0 = -SPHERE_R * Math.sin(phi);
      const z0 = SPHERE_R * Math.cos(phi) * Math.sin(theta);
      const x1 = x0 * cosY - z0 * sinY;
      const y1 = y0;
      const z1 = x0 * sinY + z0 * cosY;
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;
      const scale = FOCAL / (FOCAL + z2);
      return { sx: cx + x1 * scale, sy: cy + y2 * scale, z3d: z2 };
    };

    let si = 0;

    // Latitude rings
    for (let li = 0; li < NUM_LAT; li++) {
      const phi = LAT_PHI[li];
      for (let lj = 0; lj < NUM_LON; lj++) {
        const p0 = proj(phi, LON_THETA[lj]);
        const p1 = proj(phi, LON_THETA[(lj + 1) % NUM_LON]);
        const seg = SEGS[si++];
        seg.x0 = p0.sx;
        seg.y0 = p0.sy;
        seg.x1 = p1.sx;
        seg.y1 = p1.sy;
        seg.midZ = (p0.z3d + p1.z3d) * 0.5;
        seg.isLon = false;
      }
    }

    // Longitude meridians (pole-to-pole)
    for (let lj = 0; lj < NUM_LON; lj++) {
      const theta = LON_THETA[lj];
      for (let pi = 0; pi < ALL_PHI.length - 1; pi++) {
        const p0 = proj(ALL_PHI[pi], theta);
        const p1 = proj(ALL_PHI[pi + 1], theta);
        const seg = SEGS[si++];
        seg.x0 = p0.sx;
        seg.y0 = p0.sy;
        seg.x1 = p1.sx;
        seg.y1 = p1.sy;
        seg.midZ = (p0.z3d + p1.z3d) * 0.5;
        seg.isLon = true;
      }
    }

    for (let i = 0; i < si; i++) {
      const seg = SEGS[i];
      const mx = (seg.x0 + seg.x1) * 0.5;
      const my = (seg.y0 + seg.y1) * 0.5;
      const dx = mx - cx,
        dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const t = Math.min(dist / (maxDist * 0.6), 1.0);
      const tCubed = t * t * t;

      let alpha = tCubed;

      if (dist < WEBCAM_R) {
        const innerT = dist / WEBCAM_R;
        alpha *= innerT * innerT * 0.08;
      }

      const zNorm = (seg.midZ + SPHERE_R) / (2 * SPHERE_R);
      const depthFactor = 1.0 - Math.max(0, Math.min(1, zNorm)) * 0.5;
      alpha *= depthFactor;

      if (alpha < 0.006) continue;

      const strokeWidth = 0.3 + tCubed * 3.2;
      const color = segColor(t, seg.isLon);

      g.moveTo(seg.x0, seg.y0)
        .lineTo(seg.x1, seg.y1)
        .stroke({ color, alpha, width: strokeWidth });
    }
  }
}

// Color gradient: Lavender → Mauve → Blue → Pink (lat) / Sapphire (lon)
const LAV = [0xb4, 0xbe, 0xfe];
const MAU = [0xcb, 0xa6, 0xf7];
const BLU = [0x89, 0xb4, 0xfa];
const PNK = [0xf3, 0x8b, 0xa8];
const SAP = [0x74, 0xc7, 0xec];

function segColor(t: number, isLon: boolean): number {
  let r: number, g: number, b: number;
  if (t < 0.35) {
    const s = t / 0.35;
    r = lerp(LAV[0], MAU[0], s);
    g = lerp(LAV[1], MAU[1], s);
    b = lerp(LAV[2], MAU[2], s);
  } else if (t < 0.7) {
    const s = (t - 0.35) / 0.35;
    r = lerp(MAU[0], BLU[0], s);
    g = lerp(MAU[1], BLU[1], s);
    b = lerp(MAU[2], BLU[2], s);
  } else {
    const s = (t - 0.7) / 0.3;
    const far = isLon ? SAP : PNK;
    r = lerp(BLU[0], far[0], s);
    g = lerp(BLU[1], far[1], s);
    b = lerp(BLU[2], far[2], s);
  }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
