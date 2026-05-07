import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Catppuccin Mocha
const BG = 0x11111b; // Crust

const PALETTE = [
  0xcba6f7, // Mauve
  0x89b4fa, // Blue
  0x74c7ec, // Sapphire
  0xfab387, // Peach
  0xf38ba8, // Red
  0x89dceb, // Sky
  0xf5c2e7, // Pink
  0x94e2d5, // Teal
];

// Chua's Circuit — classic double-scroll parameters
const ALPHA_C = 15.6;
const BETA_C = 28.0;
const M0 = -1.143;
const M1 = -0.714;

const N_TRAJ = 8;
const TRAIL_LEN = 400;
const STEPS_PER_F = 4;
const SIM_DT = 0.003;
const CAM_DIST = 12;
const ROT_SPEED = 0.15;
const GHOST_LEN = 800;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Traj {
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

function chuaF(x: number): number {
  return M1 * x + 0.5 * (M0 - M1) * (Math.abs(x + 1) - Math.abs(x - 1));
}

function chuaStep(s: Vec3, dt: number): Vec3 {
  const d = (p: Vec3): Vec3 => ({
    x: ALPHA_C * (p.y - p.x - chuaF(p.x)),
    y: p.x - p.y + p.z,
    z: -BETA_C * p.y,
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

export class ChaosAttractorScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly trajs: Traj[] = [];
  private readonly ghost: Vec3[] = [];
  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildScene();
  }

  private get vs(): number {
    return Math.min(this.w, this.h) * 0.095;
  }

  private buildScene(): void {
    // Ghost skeleton — precomputed attractor outline
    let gs: Vec3 = { x: 0.7, y: 0, z: 0 };
    for (let i = 0; i < 5000; i++) gs = chuaStep(gs, SIM_DT);
    for (let i = 0; i < GHOST_LEN; i++) {
      gs = chuaStep(gs, SIM_DT);
      this.ghost.push({ ...gs });
    }

    // Trajectories staggered around the attractor to show immediate divergence
    for (let t = 0; t < N_TRAJ; t++) {
      const eps = (t + 1) * 1e-4;
      let s: Vec3 = { x: 0.7 + eps, y: eps * 0.5, z: 0 };

      // Each trajectory warmed up a different amount so they start spread out
      for (let i = 0; i < 5000 + t * 400; i++) s = chuaStep(s, SIM_DT);

      const trail: Vec3[] = [];
      for (let i = 0; i < TRAIL_LEN; i++) {
        s = chuaStep(s, SIM_DT);
        trail.push({ ...s });
      }

      this.trajs.push({ trail, head: 0, color: PALETTE[t % PALETTE.length] });
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

    for (const traj of this.trajs) {
      let s: Vec3 = { ...traj.trail[(traj.head - 1 + TRAIL_LEN) % TRAIL_LEN] };
      for (let i = 0; i < STEPS_PER_F; i++) {
        s = chuaStep(s, SIM_DT);
        traj.trail[traj.head] = { ...s };
        traj.head = (traj.head + 1) % TRAIL_LEN;
      }
    }

    this.draw();
  }

  private makeCamera(): Camera {
    const rotY = this.time * ROT_SPEED;
    const rotX = 1.42 + Math.sin(this.time * 0.055) * 0.13;
    return {
      cy: Math.cos(rotY),
      sy: Math.sin(rotY),
      cx: Math.cos(rotX),
      sx: Math.sin(rotX),
      s0: this.vs * CAM_DIST,
    };
  }

  private proj(p: Vec3, cam: Camera): { sx: number; sy: number } {
    const x1 = p.x * cam.cy - p.z * cam.sy;
    const z1 = p.x * cam.sy + p.z * cam.cy;
    const y2 = p.y * cam.cx - z1 * cam.sx;
    const z2 = p.y * cam.sx + z1 * cam.cx;
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

    // Ambient glow at attractor center
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const r = this.vs;
    g.circle(cx, cy, r * 3.2).fill({ color: 0x1e1e2e, alpha: 0.5 });
    g.circle(cx, cy, r * 2).fill({ color: 0x181825, alpha: 0.4 });

    // Ghost attractor skeleton as a single dim polyline
    const p0 = this.proj(this.ghost[0], cam);
    g.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < GHOST_LEN; i++) {
      const p = this.proj(this.ghost[i], cam);
      g.lineTo(p.sx, p.sy);
    }
    g.stroke({ color: 0x45475a, width: 0.6, alpha: 0.45 });

    // Live trajectories
    for (const traj of this.trajs) {
      this.drawTraj(g, traj, cam);
    }
  }

  private drawTraj(g: Graphics, traj: Traj, cam: Camera): void {
    const n = TRAIL_LEN;
    let prev: { sx: number; sy: number } | null = null;

    for (let i = 0; i < n; i++) {
      const pt = this.proj(traj.trail[(traj.head + i) % n], cam);
      if (prev !== null) {
        const t = i / n; // 0 = oldest, 1 = newest
        const alpha = clamp(t * t * 0.78, 0, 1);
        const width = 0.5 + t * 2;

        // Outer glow — only on the fresher half of the trail
        if (t > 0.4) {
          g.moveTo(prev.sx, prev.sy)
            .lineTo(pt.sx, pt.sy)
            .stroke({
              color: traj.color,
              width: width * 4,
              alpha: alpha * 0.07,
            });
        }

        g.moveTo(prev.sx, prev.sy)
          .lineTo(pt.sx, pt.sy)
          .stroke({ color: traj.color, width, alpha });
      }
      prev = pt;
    }

    // Glowing tip
    if (prev) {
      g.circle(prev.sx, prev.sy, 6).fill({ color: traj.color, alpha: 0.1 });
      g.circle(prev.sx, prev.sy, 3.2).fill({ color: traj.color, alpha: 0.55 });
      g.circle(prev.sx, prev.sy, 1.4).fill({ color: 0xcdd6f4, alpha: 0.92 });
    }
  }
}
