import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCLE_RADIUS = 242;
const RAY_STEPS = 48;

interface RayDef {
  angle: number;
  length: number;
  baseWidth: number;
  amp1: number;
  freq1: number;
  speed1: number;
  phase1: number;
  amp2: number;
  freq2: number;
  speed2: number;
  phase2: number;
  color: number;
  alpha: number;
}

function buildRays(): RayDef[] {
  let s = 74831;
  const rand = (): number => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const rays: RayDef[] = [];

  // Dense short fuzz tentacles — thick corona
  const BASE = 128;
  for (let i = 0; i < BASE; i++) {
    const angle = (i / BASE) * Math.PI * 2;
    rays.push({
      angle,
      length: 30 + rand() * 55,
      baseWidth: 2.5 + rand() * 5,
      amp1: 3 + rand() * 9,
      freq1: 2 + rand() * 4,
      speed1: (rand() - 0.5) * 2.0,
      phase1: rand() * Math.PI * 2,
      amp2: 1 + rand() * 4,
      freq2: 4 + rand() * 6,
      speed2: (rand() - 0.5) * 3.0,
      phase2: rand() * Math.PI * 2,
      color: 0x000000,
      alpha: 1,
    });
  }

  // Mid tentacles — clearly wavy, medium reach
  const MID = 46;
  for (let i = 0; i < MID; i++) {
    const angle = (i / MID) * Math.PI * 2 + Math.PI / MID;
    rays.push({
      angle,
      length: 80 + rand() * 65,
      baseWidth: 5 + rand() * 10,
      amp1: 10 + rand() * 16,
      freq1: 1.5 + rand() * 2.5,
      speed1: (rand() - 0.5) * 1.5,
      phase1: rand() * Math.PI * 2,
      amp2: 4 + rand() * 8,
      freq2: 3 + rand() * 4,
      speed2: (rand() - 0.5) * 2.2,
      phase2: rand() * Math.PI * 2,
      color: 0x050505,
      alpha: 1,
    });
  }

  // Long dramatic accent tentacles — slow sweeping waves
  const ACCENT = 23;
  for (let i = 0; i < ACCENT; i++) {
    const angle = (i / ACCENT) * Math.PI * 2 + 0.08;
    rays.push({
      angle,
      length: 130 + rand() * 100,
      baseWidth: 10 + rand() * 16,
      amp1: 20 + rand() * 28,
      freq1: 0.8 + rand() * 1.8,
      speed1: (rand() - 0.5) * 1.0,
      phase1: rand() * Math.PI * 2,
      amp2: 7 + rand() * 14,
      freq2: 2.0 + rand() * 3.0,
      speed2: (rand() - 0.5) * 1.6,
      phase2: rand() * Math.PI * 2,
      color: 0x080808,
      alpha: 1,
    });
  }

  return rays;
}

const RAY_DEFS = buildRays();

// Module-level temp buffers — reused every frame to avoid GC pressure.
// Safe because only one DarkSunCamScreen is ever active at a time.
const _bufCX = new Float32Array(RAY_STEPS + 1);
const _bufCY = new Float32Array(RAY_STEPS + 1);
const _bufLX = new Float32Array(RAY_STEPS + 1);
const _bufLY = new Float32Array(RAY_STEPS + 1);
const _bufRX = new Float32Array(RAY_STEPS + 1);
const _bufRY = new Float32Array(RAY_STEPS + 1);

export class DarkSunCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly gfx = new Graphics();
  private time = 0;

  constructor() {
    super();
    this.world.x = CX;
    this.world.y = CY;
    this.addChild(this.world);
    this.world.addChild(this.gfx);
  }

  public async show(): Promise<void> {}

  public update(ticker: Ticker): void {
    this.time += Math.min(ticker.deltaMS, 50) / 1000;
    this.draw();
  }

  public resize(width: number, height: number): void {
    // The engine letterbox can produce a renderer smaller than the CSS viewport
    // (e.g. 1920×600 renderer displayed at 1920×1080 CSS), causing vertical stretch.
    // Counter that distortion so the circle stays round at any window size.
    const distortX = window.innerWidth / width;
    const distortY = window.innerHeight / height;

    const padding = 256;
    const availCSS =
      Math.min(window.innerWidth, window.innerHeight) - padding * 2;
    const cssScale = availCSS / SIZE;

    this.scale.x = cssScale / distortX;
    this.scale.y = cssScale / distortY;
    this.x = Math.round((width - SIZE * this.scale.x) / 2);
    this.y = Math.round((height - SIZE * this.scale.y) / 2);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    for (const ray of RAY_DEFS) {
      this.drawRay(g, ray);
    }

    this.drawCircleBorder(g);
  }

  private drawRay(g: Graphics, ray: RayDef): void {
    const rcos = Math.cos(ray.angle);
    const rsin = Math.sin(ray.angle);
    const perpX = -rsin;
    const perpY = rcos;
    const phase1 = ray.phase1 + this.time * ray.speed1;
    const phase2 = ray.phase2 + this.time * ray.speed2;
    const cx = _bufCX;
    const cy = _bufCY;
    const lx = _bufLX;
    const ly = _bufLY;
    const rx = _bufRX;
    const ry = _bufRY;

    // Build centerline with wave displacement
    for (let i = 0; i <= RAY_STEPS; i++) {
      const t = i / RAY_STEPS;
      const d = t * ray.length;
      const bx = (CIRCLE_RADIUS + d) * rcos;
      const by = (CIRCLE_RADIUS + d) * rsin;
      const disp =
        Math.sin(t * ray.freq1 * Math.PI * 2 + phase1) * ray.amp1 +
        Math.sin(t * ray.freq2 * Math.PI * 2 + phase2) * ray.amp2;
      cx[i] = bx + disp * perpX;
      cy[i] = by + disp * perpY;
    }

    // Build tapered edge points using curve normals
    for (let i = 0; i <= RAY_STEPS; i++) {
      const t = i / RAY_STEPS;
      // Sharp taper: wide at root, pointed tip
      const halfW = ray.baseWidth * Math.pow(1 - t, 1.5);

      const pi = i === 0 ? 0 : i - 1;
      const ni = i === RAY_STEPS ? RAY_STEPS : i + 1;
      const tx = cx[ni] - cx[pi];
      const ty = cy[ni] - cy[pi];
      const tlen = Math.sqrt(tx * tx + ty * ty) || 1;
      const nx = -ty / tlen;
      const ny = tx / tlen;

      lx[i] = cx[i] + nx * halfW;
      ly[i] = cy[i] + ny * halfW;
      rx[i] = cx[i] - nx * halfW;
      ry[i] = cy[i] - ny * halfW;
    }

    // Draw as per-segment quads — each quad is locally convex, no global
    // self-intersection regardless of how much the centerline curves.
    const { color, alpha } = ray;
    for (let i = 0; i < RAY_STEPS; i++) {
      g.poly(
        [
          lx[i],
          ly[i],
          lx[i + 1],
          ly[i + 1],
          rx[i + 1],
          ry[i + 1],
          rx[i],
          ry[i],
        ],
        true,
      ).fill({ color, alpha });
    }
  }

  private drawCircleBorder(g: Graphics): void {
    const thickness = 48;
    // Center the stroke so its outer edge sits at CIRCLE_RADIUS,
    // making the entire ring extend inward.
    const midR = CIRCLE_RADIUS - thickness / 2;

    // Soft outer halo just beyond the tentacle roots
    g.circle(0, 0, CIRCLE_RADIUS + 12).stroke({
      color: 0x000000,
      alpha: 0.18,
      width: 22,
    });
    // Main bold ring — thick band going inward
    g.circle(0, 0, midR).stroke({
      color: 0x000000,
      alpha: 1,
      width: thickness,
    });
    // Inner crisp accent at the deep edge of the ring
    g.circle(0, 0, CIRCLE_RADIUS - thickness - 2).stroke({
      color: 0x1a1a1a,
      alpha: 0.5,
      width: 3,
    });
  }
}
