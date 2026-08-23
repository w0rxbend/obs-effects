import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { TAU, randRange as rand } from "../../lib/math";

const WEBCAM_R = 220;
const WR2 = WEBCAM_R * WEBCAM_R;

// Catppuccin Mocha
const MAUVE = 0xcba6f7;
const PINK = 0xf38ba8;
const PEACH = 0xfab387;
const YELLOW = 0xf9e2af;
const LAVENDER = 0xb4befe;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const TEAL = 0x94e2d5;
const GREEN = 0xa6e3a1;
const FLAMINGO = 0xf2cdcd;
const SURFACE0 = 0x313244;
const BASE = 0x1e1e2e;
const CRUST = 0x11111b;

// ─── Layer 1: N-body gravitational stars ─────────────────────────────────────

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: number;
  trail: [number, number][];
}
const STAR_N = 60;
const STAR_TRAIL = 8;
const STAR_G = 200;
const STAR_COLS = [LAVENDER, BLUE, SAPPHIRE] as const;

// ─── Layer 2: Gray-Scott reaction-diffusion ──────────────────────────────────

const RD_N = 64;
const RD_DU = 0.21;
const RD_DV = 0.105;
const RD_F = 0.055;
const RD_K = 0.062;

// ─── Layer 3: Clifford strange attractor ─────────────────────────────────────

const CA_PTS = 6000;
const CA_SCL = 155;

// ─── Layer 4: Magnetic field line particles ───────────────────────────────────

interface FieldPt {
  x: number;
  y: number;
  trail: [number, number][];
  color: number;
}
const MF_N = 120;
const MF_TRAIL = 6;
const MF_DIPO_R = 300;
const MF_COLS = [TEAL, GREEN] as const;

// ─── Layer 5: Boids comet swarm ───────────────────────────────────────────────

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: [number, number][];
  color: number;
}
const BD_N = 80;
const BD_TRAIL = 12;
const BD_MAX_V = 85;
const BD_SEP_R = 25;
const BD_ALI_R = 50;
const BD_COH_R = 75;
const BD_COLS = [FLAMINGO, SAPPHIRE] as const;

// ─── Layer 6: Wave interference ────────────────────────────────────────────────

interface WaveSrc {
  angle: number;
  orbitSpeed: number;
  phase: number;
}

// ─── Layer 7: Accretion disk ───────────────────────────────────────────────────

const DISK_TILT = 18 * (Math.PI / 180);
const DCOS = Math.cos(DISK_TILT);
const DSIN = Math.sin(DISK_TILT);

function diskPt(a: number, b: number, t: number): { x: number; y: number } {
  const rx = a * Math.cos(t),
    ry = b * Math.sin(t);
  return { x: rx * DCOS - ry * DSIN, y: rx * DSIN + ry * DCOS };
}

interface DiskRing {
  a: number;
  b: number;
  color: number;
  alpha: number;
  w: number;
}
const DISK_RINGS: readonly DiskRing[] = [
  {
    a: WEBCAM_R * 1.04,
    b: WEBCAM_R * 0.26,
    color: YELLOW,
    alpha: 0.85,
    w: 2.0,
  },
  {
    a: WEBCAM_R * 1.09,
    b: WEBCAM_R * 0.28,
    color: YELLOW,
    alpha: 0.78,
    w: 3.0,
  },
  { a: WEBCAM_R * 1.15, b: WEBCAM_R * 0.29, color: PEACH, alpha: 0.72, w: 2.5 },
  { a: WEBCAM_R * 1.22, b: WEBCAM_R * 0.31, color: PINK, alpha: 0.63, w: 2.0 },
  { a: WEBCAM_R * 1.3, b: WEBCAM_R * 0.33, color: MAUVE, alpha: 0.52, w: 1.8 },
  {
    a: WEBCAM_R * 1.4,
    b: WEBCAM_R * 0.36,
    color: LAVENDER,
    alpha: 0.4,
    w: 1.5,
  },
  {
    a: WEBCAM_R * 1.52,
    b: WEBCAM_R * 0.39,
    color: SURFACE0,
    alpha: 0.27,
    w: 1.2,
  },
  { a: WEBCAM_R * 1.67, b: WEBCAM_R * 0.43, color: BASE, alpha: 0.14, w: 1.0 },
];

// ─────────────────────────────────────────────────────────────────────────────

export class CosmicPortalScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();

  // z-order: all effect layers → hole (erase) → above-hole layers
  private readonly rdGfx = new Graphics();
  private readonly attractGfx = new Graphics();
  private readonly starGfx = new Graphics();
  private readonly fieldGfx = new Graphics();
  private readonly boidGfx = new Graphics();
  private readonly waveGfx = new Graphics();
  private readonly diskBgGfx = new Graphics(); // shadow + back disk
  private readonly holeGfx = new Graphics(); // erase webcam circle
  private readonly lensingGfx = new Graphics(); // above hole
  private readonly diskFgGfx = new Graphics(); // above hole: front disk

  // RD state
  private rdU = new Float32Array(RD_N * RD_N).fill(1);
  private rdV = new Float32Array(RD_N * RD_N).fill(0);
  private rdU2 = new Float32Array(RD_N * RD_N).fill(1);
  private rdV2 = new Float32Array(RD_N * RD_N).fill(0);

  // Particle state
  private stars: Star[] = [];
  private field: FieldPt[] = [];
  private boids: Boid[] = [];
  private waveSrcs: WaveSrc[] = [];

  // Clifford attractor
  private caA = -1.4;
  private caB = 1.6;
  private caC = 1.0;
  private caD = 0.7;
  private caX = rand(-1, 1);
  private caY = rand(-1, 1);

  private time = 0;
  private w = 800;
  private h = 800;

  constructor() {
    super();
    this.addChild(this.world);

    // Add all layers in z-order
    for (const g of [
      this.rdGfx,
      this.attractGfx,
      this.starGfx,
      this.fieldGfx,
      this.boidGfx,
      this.waveGfx,
      this.diskBgGfx,
      this.holeGfx, // punch-through
      this.lensingGfx,
      this.diskFgGfx, // above hole
    ])
      this.world.addChild(g);

    this.holeGfx.blendMode = "erase";
    this.attractGfx.blendMode = "add";
    this.starGfx.blendMode = "add";

    this._seedRD();
    this._initStars();
    this._initField();
    this._initBoids();
    this._initWaves();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private _seedRD(): void {
    // Seed activity in the annular region (outside webcam circle in grid space)
    const cx = RD_N / 2,
      cy = RD_N / 2;
    const inner = WEBCAM_R / (800 / RD_N / 2); // webcam radius in grid cells ≈ 17.6
    for (let j = 0; j < RD_N; j++) {
      for (let i = 0; i < RD_N; i++) {
        const d = Math.sqrt((i - cx) ** 2 + (j - cy) ** 2);
        if (d > inner + 1 && d < inner + 12 && Math.random() < 0.35) {
          const idx = j * RD_N + i;
          this.rdU[idx] = 0.5 + rand(-0.02, 0.02);
          this.rdV[idx] = 0.25 + rand(-0.02, 0.02);
        }
      }
    }
  }

  private _initStars(): void {
    for (let i = 0; i < STAR_N; i++) {
      const a = rand(0, TAU);
      const r = rand(WEBCAM_R + 20, 380);
      this.stars.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: rand(-20, 20),
        vy: rand(-20, 20),
        mass: rand(0.5, 2.5),
        color: STAR_COLS[i % STAR_COLS.length],
        trail: [],
      });
    }
  }

  private _initField(): void {
    for (let i = 0; i < MF_N; i++) {
      const a = rand(0, TAU),
        r = rand(WEBCAM_R + 10, 370);
      this.field.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        trail: [],
        color: MF_COLS[i % MF_COLS.length],
      });
    }
  }

  private _initBoids(): void {
    for (let i = 0; i < BD_N; i++) {
      const a = rand(0, TAU),
        r = rand(WEBCAM_R + 20, 360);
      const va = rand(0, TAU);
      this.boids.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: Math.cos(va) * 40,
        vy: Math.sin(va) * 40,
        trail: [],
        color: BD_COLS[i % BD_COLS.length],
      });
    }
  }

  private _initWaves(): void {
    for (let i = 0; i < 3; i++) {
      this.waveSrcs.push({
        angle: (i / 3) * TAU,
        orbitSpeed: rand(0.25, 0.55) * (i % 2 === 0 ? 1 : -1),
        phase: rand(0, TAU),
      });
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 800, window.innerHeight || 800);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.world.x = w * 0.5;
    this.world.y = h * 0.5;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this._updateRD();
    this._updateAttractor();
    this._updateStars(dt);
    this._updateField(dt);
    this._updateBoids(dt);
    this._updateWaves();
    this._updateDisk();

    // Punch webcam circle transparent through all layers below
    const h = this.holeGfx;
    h.clear();
    h.circle(0, 0, WEBCAM_R).fill({ color: 0xffffff, alpha: 1 });
  }

  // ─── Layer 2: Reaction-diffusion ───────────────────────────────────────────

  private _updateRD(): void {
    const N = RD_N;
    const U = this.rdU,
      V = this.rdV,
      U2 = this.rdU2,
      V2 = this.rdV2;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const u = U[idx],
          v = V[idx],
          uvv = u * v * v;
        const il = (i - 1 + N) % N,
          ir = (i + 1) % N;
        const jl = (j - 1 + N) % N,
          jr = (j + 1) % N;
        const lapU =
          U[j * N + il] + U[j * N + ir] + U[jl * N + i] + U[jr * N + i] - 4 * u;
        const lapV =
          V[j * N + il] + V[j * N + ir] + V[jl * N + i] + V[jr * N + i] - 4 * v;
        U2[idx] = Math.max(
          0,
          Math.min(1, u + (RD_DU * lapU - uvv + RD_F * (1 - u)) * 0.5),
        );
        V2[idx] = Math.max(
          0,
          Math.min(1, v + (RD_DV * lapV + uvv - (RD_F + RD_K) * v) * 0.5),
        );
      }
    }
    this.rdU = U2;
    this.rdV = V2;
    this.rdU2 = U;
    this.rdV2 = V;

    const g = this.rdGfx;
    g.clear();
    const cw = this.w / N,
      ch = this.h / N;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const v = this.rdV[j * N + i];
        if (v < 0.05) continue;
        const wx = (i + 0.5) * cw - hw;
        const wy = (j + 0.5) * ch - hh;
        if (wx * wx + wy * wy < WR2) continue; // inside webcam, hole handles it but skip draw
        const t = Math.min(v / 0.35, 1);
        const color = t > 0.5 ? MAUVE : PINK;
        const alpha = 0.06 + t * 0.2;
        g.rect(wx - cw * 0.5, wy - ch * 0.5, cw, ch).fill({ color, alpha });
      }
    }
  }

  // ─── Layer 3: Clifford attractor ───────────────────────────────────────────

  private _updateAttractor(): void {
    // Slowly morph parameters
    this.caA = -1.4 + 0.28 * Math.sin(this.time * 0.071);
    this.caB = 1.6 + 0.28 * Math.cos(this.time * 0.093);
    this.caC = 1.0 + 0.18 * Math.sin(this.time * 0.107);
    this.caD = 0.7 + 0.18 * Math.cos(this.time * 0.127);

    const g = this.attractGfx;
    g.clear();

    let x = this.caX,
      y = this.caY;
    const scl = CA_SCL;
    const cols = [PEACH, YELLOW] as const;

    for (let i = 0; i < CA_PTS; i++) {
      const nx = Math.sin(this.caA * y) + this.caC * Math.cos(this.caA * x);
      const ny = Math.sin(this.caB * x) + this.caD * Math.cos(this.caB * y);
      x = nx;
      y = ny;
      g.circle(x * scl, y * scl, 0.6).fill({ color: cols[i & 1], alpha: 0.04 });
    }
    this.caX = x;
    this.caY = y;
  }

  // ─── Layer 1: N-body gravitational stars ───────────────────────────────────

  private _updateStars(dt: number): void {
    const stars = this.stars;
    const N = stars.length;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (let i = 0; i < N; i++) {
      const a = stars[i];
      let fx = 0,
        fy = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const b = stars[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 1;
        const d = Math.sqrt(d2);
        const f = (STAR_G * a.mass * b.mass) / (d2 * d);
        fx += f * dx;
        fy += f * dy;
      }
      a.vx += (fx / a.mass) * dt;
      a.vy += (fy / a.mass) * dt;
    }

    const g = this.starGfx;
    g.clear();

    for (const s of stars) {
      s.trail.push([s.x, s.y]);
      if (s.trail.length > STAR_TRAIL) s.trail.shift();

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Boundary wrap
      if (s.x < -hw) s.x += this.w;
      else if (s.x > hw) s.x -= this.w;
      if (s.y < -hh) s.y += this.h;
      else if (s.y > hh) s.y -= this.h;

      // Draw trail (hole will erase webcam area)
      for (let t = 0; t < s.trail.length; t++) {
        const [tx, ty] = s.trail[t];
        const alpha = (t / s.trail.length) * 0.55;
        g.circle(tx, ty, 0.8).fill({ color: s.color, alpha });
      }
      // Star core
      g.circle(s.x, s.y, 1.5 + s.mass * 0.4).fill({
        color: s.color,
        alpha: 0.95,
      });
      g.circle(s.x, s.y, 3.0 + s.mass * 0.7).fill({
        color: s.color,
        alpha: 0.18,
      });
    }
  }

  // ─── Layer 4: Magnetic field line particles ────────────────────────────────

  private _dipoleField(x: number, y: number): [number, number] {
    let bx = 0,
      by = 0;
    for (let d = 0; d < 2; d++) {
      const a = this.time * 0.3 + d * Math.PI;
      const px = x - Math.cos(a) * MF_DIPO_R;
      const py = y - Math.sin(a) * MF_DIPO_R;
      const r2 = px * px + py * py + 1;
      const r = Math.sqrt(r2);
      const s = d === 0 ? 1 : -1;
      bx += s * (-py / (r * r2));
      by += s * (px / (r * r2));
    }
    return [bx * 80000, by * 80000];
  }

  private _updateField(dt: number): void {
    const g = this.fieldGfx;
    g.clear();
    const SPEED = 55;

    for (const p of this.field) {
      const [fx, fy] = this._dipoleField(p.x, p.y);
      const len = Math.sqrt(fx * fx + fy * fy) + 0.0001;
      p.x += (fx / len) * SPEED * dt;
      p.y += (fy / len) * SPEED * dt;

      // Reset if escaped
      if (p.x * p.x + p.y * p.y > 390 * 390) {
        const a = rand(0, TAU);
        p.x = Math.cos(a) * rand(WEBCAM_R + 10, 370);
        p.y = Math.sin(a) * rand(WEBCAM_R + 10, 370);
        p.trail = [];
        continue;
      }

      p.trail.push([p.x, p.y]);
      if (p.trail.length > MF_TRAIL) p.trail.shift();

      for (let t = 0; t < p.trail.length; t++) {
        const [tx, ty] = p.trail[t];
        g.circle(tx, ty, 1.0).fill({
          color: p.color,
          alpha: (t / p.trail.length) * 0.5,
        });
      }
    }
  }

  // ─── Layer 5: Boids comet swarm ────────────────────────────────────────────

  private _updateBoids(dt: number): void {
    const boids = this.boids;
    const N = boids.length;

    for (let i = 0; i < N; i++) {
      const b = boids[i];
      let sx = 0,
        sy = 0,
        ax = 0,
        ay = 0,
        cx = 0,
        cy = 0;
      let ns = 0,
        na = 0,
        nc = 0;

      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const o = boids[j];
        const dx = o.x - b.x,
          dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        const d = Math.sqrt(d2) + 0.001;
        if (d < BD_SEP_R) {
          sx -= dx / d;
          sy -= dy / d;
          ns++;
        }
        if (d < BD_ALI_R) {
          ax += o.vx;
          ay += o.vy;
          na++;
        }
        if (d < BD_COH_R) {
          cx += o.x;
          cy += o.y;
          nc++;
        }
      }

      let fax = 0,
        fay = 0;
      if (ns > 0) {
        fax += (sx / ns) * 2.2;
        fay += (sy / ns) * 2.2;
      }
      if (na > 0) {
        fax += (ax / na - b.vx) * 0.45;
        fay += (ay / na - b.vy) * 0.45;
      }
      if (nc > 0) {
        fax += (cx / nc - b.x) * 0.012;
        fay += (cy / nc - b.y) * 0.012;
      }

      // Repel from webcam circle
      const r2 = b.x * b.x + b.y * b.y;
      const repR = WEBCAM_R + 60;
      if (r2 < repR * repR) {
        const r = Math.sqrt(r2) + 0.001;
        fax -= (b.x / r) * 180;
        fay -= (b.y / r) * 180;
      }
      // Keep on canvas
      if (r2 > 380 * 380) {
        const r = Math.sqrt(r2) + 0.001;
        fax -= (b.x / r) * 60;
        fay -= (b.y / r) * 60;
      }

      b.vx += fax * dt;
      b.vy += fay * dt;
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + 0.001;
      if (spd > BD_MAX_V) {
        b.vx = (b.vx / spd) * BD_MAX_V;
        b.vy = (b.vy / spd) * BD_MAX_V;
      }
      if (spd < 25) {
        b.vx *= 1.06;
        b.vy *= 1.06;
      }

      b.trail.push([b.x, b.y]);
      if (b.trail.length > BD_TRAIL) b.trail.shift();
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    const g = this.boidGfx;
    g.clear();
    for (const b of boids) {
      for (let t = 0; t < b.trail.length; t++) {
        const [tx, ty] = b.trail[t];
        g.circle(tx, ty, 1.5).fill({
          color: b.color,
          alpha: (t / b.trail.length) * 0.6,
        });
      }
      g.circle(b.x, b.y, 2.5).fill({ color: b.color, alpha: 0.88 });
    }
  }

  // ─── Layer 6: Interference wave rings ─────────────────────────────────────

  private _updateWaves(): void {
    for (const src of this.waveSrcs) {
      src.angle += src.orbitSpeed * 0.01;
      src.phase += 0.045;
    }

    const g = this.waveGfx;
    g.clear();
    const RINGS = 16;
    const SEGS = 72;

    for (let ri = 0; ri < RINGS; ri++) {
      const ringR = WEBCAM_R + 8 + ri * 23;
      if (ringR > 400) break;

      for (let si = 0; si < SEGS; si++) {
        const angle = (si / SEGS) * TAU;
        const px = Math.cos(angle) * ringR;
        const py = Math.sin(angle) * ringR;

        let amp = 0;
        for (const src of this.waveSrcs) {
          const sx = Math.cos(src.angle) * (WEBCAM_R + 22);
          const sy = Math.sin(src.angle) * (WEBCAM_R + 22);
          const d = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
          amp += Math.sin(d * 0.08 - this.time * 2.8 + src.phase);
        }
        amp /= 3;
        if (Math.abs(amp) < 0.32) continue;

        const alpha = Math.abs(amp) * 0.16;
        g.circle(px, py, 1.3).fill({ color: amp > 0 ? LAVENDER : PINK, alpha });
      }
    }
  }

  // ─── Layer 7: Accretion disk ───────────────────────────────────────────────

  private _diskBuildPts(
    ring: DiskRing,
    tStart: number,
    tEnd: number,
    skipCam: boolean,
  ): Array<{ x: number; y: number } | null> {
    const N = 80;
    const camR = (WEBCAM_R - 2) * (WEBCAM_R - 2);
    const pts: Array<{ x: number; y: number } | null> = [];
    for (let i = 0; i <= N; i++) {
      const t = tStart + (i / N) * (tEnd - tStart);
      const pt = diskPt(ring.a, ring.b, t);
      pts.push(skipCam && pt.x * pt.x + pt.y * pt.y < camR ? null : pt);
    }
    return pts;
  }

  private _diskStroke(
    g: Graphics,
    pts: Array<{ x: number; y: number } | null>,
    color: number,
    width: number,
    alpha: number,
  ): void {
    if (alpha < 0.002) return;
    let started = false;
    for (const pt of pts) {
      if (!pt) {
        started = false;
        continue;
      }
      if (!started) {
        g.moveTo(pt.x, pt.y);
        started = true;
      } else g.lineTo(pt.x, pt.y);
    }
    g.stroke({ color, width, alpha });
  }

  private _diskDrawArc(
    g: Graphics,
    ring: DiskRing,
    tStart: number,
    tEnd: number,
    alphaScale: number,
    skipCam: boolean,
  ): void {
    const pts = this._diskBuildPts(ring, tStart, tEnd, skipCam);
    const a = ring.alpha * alphaScale;
    this._diskStroke(g, pts, ring.color, ring.w * 7, a * 0.05);
    this._diskStroke(g, pts, ring.color, ring.w * 3, a * 0.18);
    this._diskStroke(g, pts, ring.color, ring.w, a);
  }

  private _updateDisk(): void {
    const pulse = 0.82 + 0.18 * Math.sin(this.time * 0.68);

    // Shadow gradient + back disk (below hole — gets partially erased)
    const bg = this.diskBgGfx;
    bg.clear();
    const EXT = WEBCAM_R * 0.7;
    const LAYS = 26;
    const lh = EXT / LAYS;
    for (let i = 0; i < LAYS; i++) {
      const r = WEBCAM_R + lh * (i + 0.5);
      const t = i / (LAYS - 1);
      bg.circle(0, 0, r);
      bg.stroke({
        color: CRUST,
        width: lh * 2.4,
        alpha: Math.pow(1 - t, 1.6) * 0.58,
      });
    }
    for (const ring of DISK_RINGS) {
      this._diskDrawArc(bg, ring, Math.PI, TAU, pulse * 0.42, true);
    }

    // Lensing ring (above hole — shows over camera feed)
    const lg = this.lensingGfx;
    lg.clear();
    const sh1 = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * 1.9));
    const sh2 = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 2.5 + 1.3));
    const lr = WEBCAM_R + 4;
    const ringPath = (r: number) => {
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * TAU;
        if (i === 0) lg.moveTo(r * Math.cos(a), r * Math.sin(a));
        else lg.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
    };
    ringPath(lr);
    lg.stroke({ color: BLUE, width: 18, alpha: sh1 * 0.07 });
    ringPath(lr);
    lg.stroke({ color: LAVENDER, width: 7, alpha: sh1 * 0.22 });
    ringPath(lr);
    lg.stroke({ color: BLUE, width: 2, alpha: sh2 * 0.82 });

    // Front disk (above hole — overlaps cam bottom for depth illusion)
    const fg = this.diskFgGfx;
    fg.clear();
    for (const ring of DISK_RINGS) {
      this._diskDrawArc(fg, ring, 0, Math.PI, pulse, false);
    }
  }
}
