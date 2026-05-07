import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Catppuccin Mocha
const BG = 0x11111b; // Crust

const PALETTE = [
  0xcba6f7, // Mauve
  0x89b4fa, // Blue
  0x74c7ec, // Sapphire
  0xa6e3a1, // Green
  0xf9e2af, // Yellow
  0xfab387, // Peach
  0xf38ba8, // Red
  0x89dceb, // Sky
  0xf5c2e7, // Pink
  0x94e2d5, // Teal
];

// Lorenz attractor — classic butterfly chaos
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const L_DT = 0.005;
// Visual z-center of the attractor (≈ rho − 1)
const L_CZ = 27;

const N_PARTICLES = 500;
const TRAIL_LEN = 10;
const STEPS_PER_F = 2;
const GHOST_LEN = 2000;
const CAM_DIST = 14;
const ROT_SPEED = 0.12;

// Typical max speed on the attractor, used to normalise the glow
const MAX_SPEED = 35;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Particle {
  trail: Vec3[];
  head: number;
  color: number;
}

interface Camera {
  cy: number;
  sy: number;
  cx: number;
  sx: number;
  s0: number;
}

function lorenzStep(s: Vec3, dt: number): Vec3 {
  const d = (p: Vec3): Vec3 => ({
    x: SIGMA * (p.y - p.x),
    y: p.x * (RHO - p.z) - p.y,
    z: p.x * p.y - BETA * p.z,
  });
  const k1 = d(s);
  const s2: Vec3 = {
    x: s.x + k1.x * dt * 0.5,
    y: s.y + k1.y * dt * 0.5,
    z: s.z + k1.z * dt * 0.5,
  };
  const k2 = d(s2);
  const s3: Vec3 = {
    x: s.x + k2.x * dt * 0.5,
    y: s.y + k2.y * dt * 0.5,
    z: s.z + k2.z * dt * 0.5,
  };
  const k3 = d(s3);
  const s4: Vec3 = {
    x: s.x + k3.x * dt,
    y: s.y + k3.y * dt,
    z: s.z + k3.z * dt,
  };
  const k4 = d(s4);
  return {
    x: s.x + (dt * (k1.x + 2 * k2.x + 2 * k3.x + k4.x)) / 6,
    y: s.y + (dt * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)) / 6,
    z: s.z + (dt * (k1.z + 2 * k2.z + 2 * k3.z + k4.z)) / 6,
  };
}

export class ChaoticParticlesScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly particles: Particle[] = [];
  private readonly ghost: Vec3[] = [];
  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildScene();
  }

  // Pixels per attractor unit
  private get vs(): number {
    return Math.min(this.w, this.h) * 0.018;
  }

  private buildScene(): void {
    // Ghost skeleton — pre-traced attractor outline
    let gs: Vec3 = { x: 1, y: 1, z: 1 };
    for (let i = 0; i < 3000; i++) gs = lorenzStep(gs, L_DT);
    for (let i = 0; i < GHOST_LEN; i++) {
      gs = lorenzStep(gs, L_DT);
      this.ghost.push({ ...gs });
    }

    // Particles — staggered evenly along a single warm trajectory
    let seed: Vec3 = { x: 1, y: 1, z: 1 };
    for (let i = 0; i < 3000; i++) seed = lorenzStep(seed, L_DT);

    for (let p = 0; p < N_PARTICLES; p++) {
      // Advance seed so each particle starts at a different point on the attractor
      for (let i = 0; i < 40; i++) seed = lorenzStep(seed, L_DT);

      const trail: Vec3[] = [];
      let s: Vec3 = { ...seed };
      for (let i = 0; i < TRAIL_LEN; i++) {
        s = lorenzStep(s, L_DT);
        trail.push({ ...s });
      }

      this.particles.push({
        trail,
        head: 0,
        color: PALETTE[p % PALETTE.length],
      });
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    for (const p of this.particles) {
      let s: Vec3 = { ...p.trail[(p.head - 1 + TRAIL_LEN) % TRAIL_LEN] };
      for (let i = 0; i < STEPS_PER_F; i++) {
        s = lorenzStep(s, L_DT);
        p.trail[p.head] = { ...s };
        p.head = (p.head + 1) % TRAIL_LEN;
      }
    }

    this.draw();
  }

  private makeCamera(): Camera {
    const rotY = this.time * ROT_SPEED;
    // Tilt slowly cycles between viewing the butterfly from the side and above
    const rotX = 1.05 + Math.sin(this.time * 0.042) * 0.3;
    return {
      cy: Math.cos(rotY),
      sy: Math.sin(rotY),
      cx: Math.cos(rotX),
      sx: Math.sin(rotX),
      s0: this.vs * CAM_DIST,
    };
  }

  private proj(p: Vec3, cam: Camera): { sx: number; sy: number } {
    // Translate attractor centre to origin
    const px = p.x;
    const py = p.y;
    const pz = p.z - L_CZ;

    const x1 = px * cam.cy - pz * cam.sy;
    const z1 = px * cam.sy + pz * cam.cy;
    const y2 = py * cam.cx - z1 * cam.sx;
    const z2 = py * cam.sx + z1 * cam.cx;

    const sc = cam.s0 / (CAM_DIST + z2);
    return {
      sx: this.w * 0.5 + x1 * sc,
      sy: this.h * 0.5 - y2 * sc,
    };
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const cam = this.makeCamera();

    // Soft ambient vignette centred on the attractor
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    g.circle(cx, cy, this.vs * 35).fill({ color: 0x1e1e2e, alpha: 0.45 });
    g.circle(cx, cy, this.vs * 22).fill({ color: 0x181825, alpha: 0.35 });

    // Ghost attractor as a single dim polyline
    const p0 = this.proj(this.ghost[0], cam);
    g.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < GHOST_LEN; i++) {
      const gp = this.proj(this.ghost[i], cam);
      g.lineTo(gp.sx, gp.sy);
    }
    g.stroke({ color: 0x313244, width: 0.5, alpha: 0.4 });

    // Particles
    for (const particle of this.particles) {
      this.drawParticle(g, particle, cam);
    }
  }

  private drawParticle(g: Graphics, p: Particle, cam: Camera): void {
    const n = TRAIL_LEN;
    const c = p.color;

    // Dot trail — oldest to newest
    for (let i = 0; i < n - 1; i++) {
      const idx = (p.head + i) % n;
      const pt = this.proj(p.trail[idx], cam);
      const t = i / (n - 1); // 0 = oldest, 1 = newest
      const r = 0.6 + t * 2.2;
      const alpha = t * t * 0.6;
      g.circle(pt.sx, pt.sy, r).fill({ color: c, alpha });
    }

    // Tip — newest trail point with velocity-based glow
    const tipIdx = (p.head + n - 1) % n;
    const prevIdx = (p.head + n - 2) % n;
    const tip = p.trail[tipIdx];
    const prev = p.trail[prevIdx];
    const tp = this.proj(tip, cam);

    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const dz = tip.z - prev.z;
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / L_DT;
    const speedT = clamp(speed / MAX_SPEED, 0, 1);

    const tipR = 2 + speedT * 2.5;

    g.circle(tp.sx, tp.sy, tipR * 3).fill({
      color: c,
      alpha: 0.08 + speedT * 0.06,
    });
    g.circle(tp.sx, tp.sy, tipR).fill({ color: c, alpha: 0.55 + speedT * 0.3 });
    g.circle(tp.sx, tp.sy, tipR * 0.4).fill({
      color: 0xcdd6f4,
      alpha: 0.7 + speedT * 0.25,
    });
  }
}
