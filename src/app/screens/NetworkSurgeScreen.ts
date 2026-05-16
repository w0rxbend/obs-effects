import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ─── Palette ────────────────────────────────────────────────────────────────
const BG = 0x05080f;
const C_LAVENDER = 0x7287fd;
const C_BLUE = 0x89b4fa;
const C_SKY = 0x74c7ec;
const C_MAUVE = 0xcba6f7;
const C_TEXT = 0xcdd6f4;
const C_OVERLAY1 = 0x7f849c;

const PALETTE = [C_LAVENDER, C_BLUE, C_SKY, C_MAUVE];

// ─── Quality tiers ──────────────────────────────────────────────────────────
const TIERS = [
  { count: 300, dist: 140 },
  { count: 800, dist: 125 },
  { count: 1800, dist: 100 },
  { count: 3200, dist: 80 },
] as const;

type Tier = (typeof TIERS)[number];

const INIT_TIER = 1;
const MAX_PARTICLES = 3200;
const MAX_CONN_PER = 6;

// ─── Physics ────────────────────────────────────────────────────────────────
const MAX_SPEED = 75;
const DRAG_60 = 0.993; // velocity decay per frame at 60 fps
const NOISE_F = 36;
const FLOW_F = 16;
const REPEL_D = 50;
const REPEL_D2 = REPEL_D * REPEL_D;
const ENERGY_DECAY = 1.8;
const LIFE_RATE = 2.5; // life units/second → 0.4 s fade in/out
const WRAP_FADE = 90; // edge fade zone in pixels

// ─── Surges & rings ─────────────────────────────────────────────────────────
const SURGE_POOL = 40;
const SURGE_SPEED = 270; // px/s
const SURGE_BRANCH = 0.5;
const SURGE_TICK = 0.45;
const RING_POOL = 20;
const RING_LIFE = 0.95;
const RING_MAX_R = 55;

// ─── Types ──────────────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  noiseAngle: number;
  noiseTick: number;
  color: number;
  energy: number;
  life: number; // 0-1 visibility; fades in/out on quality change or at screen edge
}

interface Surge {
  ai: number;
  bi: number;
  t: number; // 0 → 1 progress
  spd: number; // t-units per second
  osc: number; // oscillation phase
  active: boolean;
}

interface Ring {
  x: number;
  y: number;
  age: number;
  color: number;
  active: boolean;
}

// ─── SpatialGrid ────────────────────────────────────────────────────────────
// Allocation-free after initial sizing. Rebuild each frame via clear()+insert().
class SpatialGrid {
  private cols = 1;
  private rows = 1;
  private cs = 100; // cell size
  private data = new Uint16Array(0); // flat: [cellIdx * CAP + slot] = particle index
  private cnt = new Uint16Array(0); // particle count per cell
  private readonly CAP = 100;

  resize(w: number, h: number, cellSize: number): void {
    this.cs = cellSize;
    this.cols = Math.ceil(w / cellSize);
    this.rows = Math.ceil(h / cellSize);
    const total = this.cols * this.rows;
    if (this.data.length < total * this.CAP) {
      this.data = new Uint16Array(total * this.CAP);
      this.cnt = new Uint16Array(total);
    }
  }

  clear(): void {
    this.cnt.fill(0);
  }

  insert(idx: number, x: number, y: number): void {
    const col = Math.max(0, Math.min(this.cols - 1, (x / this.cs) | 0));
    const row = Math.max(0, Math.min(this.rows - 1, (y / this.cs) | 0));
    const ci = row * this.cols + col;
    const n = this.cnt[ci];
    if (n < this.CAP) {
      this.data[ci * this.CAP + n] = idx;
      this.cnt[ci]++;
    }
  }

  query(
    x: number,
    y: number,
    radius: number,
    out: Int32Array,
    maxOut: number,
  ): number {
    const cs = this.cs;
    const c0 = Math.max(0, ((x - radius) / cs) | 0);
    const c1 = Math.min(this.cols - 1, ((x + radius) / cs) | 0);
    const r0 = Math.max(0, ((y - radius) / cs) | 0);
    const r1 = Math.min(this.rows - 1, ((y + radius) / cs) | 0);
    let n = 0;
    for (let r = r0; r <= r1 && n < maxOut; r++) {
      for (let c = c0; c <= c1 && n < maxOut; c++) {
        const ci = r * this.cols + c;
        const cnt = this.cnt[ci];
        const base = ci * this.CAP;
        for (let k = 0; k < cnt && n < maxOut; k++) {
          out[n++] = this.data[base + k];
        }
      }
    }
    return n;
  }

  destroy(): void {}
}

// ─── PerformanceMonitor ─────────────────────────────────────────────────────
class PerformanceMonitor {
  private fc = 0;
  private el = 0;
  private fps = 60;
  private ti = INIT_TIER;
  private cd = 6; // cooldown seconds

  update(dt: number): boolean {
    this.fc++;
    this.el += dt;
    if (this.el < 1) return false;
    this.fps = this.fc / this.el;
    this.fc = 0;
    this.el = 0;
    this.cd = Math.max(0, this.cd - 1);
    if (this.cd > 0) return false;
    let changed = false;
    if (this.fps < 48 && this.ti > 0) {
      this.ti--;
      this.cd = 4;
      changed = true;
    } else if (this.fps > 58 && this.ti < TIERS.length - 1) {
      this.ti++;
      this.cd = 8;
      changed = true;
    }
    return changed;
  }

  getTier(): Tier {
    return TIERS[this.ti];
  }
  getFPS(): number {
    return this.fps;
  }
}

// ─── FlowField ──────────────────────────────────────────────────────────────
class FlowField {
  private w = 1920;
  private h = 1080;
  private t = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  update(dt: number): void {
    this.t += dt;
  }

  getAngle(x: number, y: number): number {
    const nx = x / this.w;
    const ny = y / this.h;
    const t = this.t;
    return (
      Math.sin(nx * 4.8 + ny * 3.2 + t * 0.35) * Math.PI +
      Math.cos(nx * 2.9 - ny * 5.1 + t * 0.22) * 1.8
    );
  }

  destroy(): void {}
}

// ─── NetworkSurgeScreen ─────────────────────────────────────────────────────
export class NetworkSurgeScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private surgeTimer = 0;

  // Target active count; life field on each particle handles the actual fade
  private activeCount: number = TIERS[INIT_TIER].count;
  private maxDist: number = TIERS[INIT_TIER].dist;

  // Systems
  private readonly perf = new PerformanceMonitor();
  private readonly grid = new SpatialGrid();
  private readonly flow = new FlowField();

  // Pre-allocated pools (no per-frame allocation)
  private readonly particles: Particle[] = [];
  private readonly surges: Surge[] = [];
  private readonly rings: Ring[] = [];
  private readonly nbuf = new Int32Array(512); // neighbor scratch
  private readonly ccnt = new Uint8Array(MAX_PARTICLES); // connection counts

  constructor() {
    super();
    this.addChild(this.gfx);
    this.initPools();
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.grid.resize(this.w, this.h, this.maxDist);
    this.flow.resize(this.w, this.h);
    this.scatter();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.grid.resize(w, h, this.maxDist);
    this.flow.resize(w, h);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.flow.update(dt);

    if (this.perf.update(dt)) {
      const tier = this.perf.getTier();
      this.activeCount = tier.count;
      this.maxDist = tier.dist;
      this.grid.resize(this.w, this.h, this.maxDist);
      // life fields handle the smooth fade; no instant pop here
    }

    this.updatePhysics(dt);
    this.updateSurges(dt);
    this.updateRings(dt);
    this.draw();
  }

  // ── Initialisation ────────────────────────────────────────────────────────
  private initPools(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 50,
        vy: (Math.random() - 0.5) * 50,
        r: 1.8 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
        noiseAngle: Math.random() * Math.PI * 2,
        noiseTick: Math.random() * 3,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        energy: 0,
        life: 0, // fades in from 0 → 1 once active
      });
    }
    for (let i = 0; i < SURGE_POOL; i++) {
      this.surges.push({ ai: 0, bi: 0, t: 0, spd: 0, osc: 0, active: false });
    }
    for (let i = 0; i < RING_POOL; i++) {
      this.rings.push({ x: 0, y: 0, age: 0, color: 0, active: false });
    }
  }

  // Scatter ALL particles across the canvas so dormant ones have valid positions
  // when they later fade in after a quality upgrade.
  private scatter(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].x = Math.random() * this.w;
      this.particles[i].y = Math.random() * this.h;
      this.particles[i].life = 0;
    }
  }

  // ── ParticleSystem ────────────────────────────────────────────────────────
  private updatePhysics(dt: number): void {
    const { w, h } = this;
    const drag = Math.pow(DRAG_60, dt * 60);

    // Pass 1: update life for every slot.
    // Particles with i < activeCount ramp up; others fade out.
    // This is O(MAX_PARTICLES) but each iteration is 2–3 ops — negligible cost.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      p.life =
        i < this.activeCount
          ? Math.min(1, p.life + LIFE_RATE * dt)
          : Math.max(0, p.life - LIFE_RATE * dt);
    }

    // Pass 2: rebuild grid with only live particles.
    this.grid.clear();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.particles[i].life > 0) {
        this.grid.insert(i, this.particles[i].x, this.particles[i].y);
      }
    }

    // Pass 3: physics for live particles only.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;

      p.noiseTick -= dt;
      if (p.noiseTick <= 0) {
        p.noiseAngle += (Math.random() - 0.5) * 2.2;
        p.noiseTick = 1.5 + Math.random() * 3;
      }

      let fx = Math.cos(p.noiseAngle) * NOISE_F;
      let fy = Math.sin(p.noiseAngle) * NOISE_F;

      const fa = this.flow.getAngle(p.x, p.y);
      fx += Math.cos(fa) * FLOW_F;
      fy += Math.sin(fa) * FLOW_F;

      // Short-range repulsion via grid
      const nr = this.grid.query(p.x, p.y, REPEL_D * 1.5, this.nbuf, 32);
      for (let k = 0; k < nr; k++) {
        const j = this.nbuf[k];
        if (j <= i) continue;
        const q = this.particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= REPEL_D2 || d2 < 1) continue;
        const d = Math.sqrt(d2);
        const mag = ((REPEL_D - d) / REPEL_D) * 130;
        const ux = dx / d;
        const uy = dy / d;
        fx -= ux * mag;
        fy -= uy * mag;
        q.vx += ux * mag * dt;
        q.vy += uy * mag * dt;
      }

      p.vx = (p.vx + fx * dt) * drag;
      p.vy = (p.vy + fy * dt) * drag;

      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > MAX_SPEED) {
        const s = MAX_SPEED / spd;
        p.vx *= s;
        p.vy *= s;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Toroidal wrap — no hard clamping, particles loop continuously.
      if (p.x < 0) p.x += w;
      else if (p.x >= w) p.x -= w;
      if (p.y < 0) p.y += h;
      else if (p.y >= h) p.y -= h;

      p.energy = Math.max(0, p.energy - ENERGY_DECAY * dt);
    }
  }

  // ── SurgeSystem ───────────────────────────────────────────────────────────
  private updateSurges(dt: number): void {
    for (const s of this.surges) {
      if (!s.active) continue;
      s.t += s.spd * dt;
      if (s.t < 1) continue;
      s.active = false;
      const dest = this.particles[s.bi];
      dest.energy = Math.min(1, dest.energy + 0.75);
      this.spawnRing(dest.x, dest.y, dest.color);
      if (Math.random() < SURGE_BRANCH) this.fireSurge(s.bi);
    }

    this.surgeTimer += dt;
    if (this.surgeTimer >= SURGE_TICK) {
      this.surgeTimer -= SURGE_TICK;
      // Pick a random live particle as surge origin
      const idx = (Math.random() * this.activeCount) | 0;
      if (this.particles[idx].life > 0.5) this.fireSurge(idx);
    }
  }

  private fireSurge(ai: number): void {
    const p = this.particles[ai];
    const md2 = this.maxDist * this.maxDist;
    let bi = -1;
    let best = Infinity;

    const nc = this.grid.query(p.x, p.y, this.maxDist, this.nbuf, 64);
    for (let k = 0; k < nc; k++) {
      const j = this.nbuf[k];
      if (j === ai) continue;
      if (this.particles[j].life < 0.5) continue; // only surge to visible particles
      const q = this.particles[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy >= md2) continue;
      const cost = (dx * dx + dy * dy) * (0.2 + Math.random());
      if (cost < best) {
        best = cost;
        bi = j;
      }
    }

    if (bi < 0) return;

    for (const s of this.surges) {
      if (s.active) continue;
      const pa = this.particles[ai];
      const pb = this.particles[bi];
      const d = Math.sqrt((pb.x - pa.x) ** 2 + (pb.y - pa.y) ** 2) || 1;
      s.ai = ai;
      s.bi = bi;
      s.t = 0;
      s.spd = SURGE_SPEED / d;
      s.osc = Math.random() * Math.PI * 2;
      s.active = true;
      return;
    }
  }

  // ── Rings ─────────────────────────────────────────────────────────────────
  private spawnRing(x: number, y: number, color: number): void {
    for (const r of this.rings) {
      if (r.active) continue;
      r.x = x;
      r.y = y;
      r.age = 0;
      r.color = color;
      r.active = true;
      return;
    }
  }

  private updateRings(dt: number): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= RING_LIFE) r.active = false;
    }
  }

  // ── ConnectionRenderer ────────────────────────────────────────────────────
  private renderConnections(g: Graphics): void {
    const { w, h } = this;
    const md = this.maxDist;
    const md2 = md * md;
    const gp = 0.85 + Math.sin(this.time * 0.75) * 0.15; // global network pulse

    // Reset connection counts for the full pool (fast TypedArray fill).
    this.ccnt.fill(0);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0 || this.ccnt[i] >= MAX_CONN_PER) continue;

      const nc = this.grid.query(p.x, p.y, md, this.nbuf, 128);

      for (let k = 0; k < nc; k++) {
        const j = this.nbuf[k];
        if (j <= i) continue; // process each pair once
        if (this.ccnt[i] >= MAX_CONN_PER) break;
        if (this.ccnt[j] >= MAX_CONN_PER) continue;

        const q = this.particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= md2) continue;

        const tFrac = 1 - Math.sqrt(d2) / md;
        const energy = (p.energy + q.energy) * 0.5;
        // Fade connection with the dimmer endpoint so lines vanish smoothly
        const edgeFadeP = edgeFade(p.x, p.y, w, h);
        const edgeFadeQ = edgeFade(q.x, q.y, w, h);
        const fa = Math.min(p.life * edgeFadeP, q.life * edgeFadeQ);
        const alpha = Math.min(
          0.85,
          (tFrac * tFrac * 0.45 + energy * 0.38) * gp * fa,
        );
        if (alpha < 0.005) {
          this.ccnt[i]++;
          this.ccnt[j]++;
          continue;
        }
        const color = energy > 0.1 ? C_BLUE : C_OVERLAY1;
        const width = 0.35 + tFrac * 0.9 + energy * 0.75;

        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ color, alpha, width });

        this.ccnt[i]++;
        this.ccnt[j]++;
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  private draw(): void {
    const { w, h } = this;
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, w, h).fill({ color: BG });

    this.renderConnections(g);

    // Surge paths and dots
    for (const s of this.surges) {
      if (!s.active) continue;
      const pa = this.particles[s.ai];
      const pb = this.particles[s.bi];

      g.moveTo(pa.x, pa.y)
        .lineTo(pb.x, pb.y)
        .stroke({ color: C_SKY, alpha: 0.18, width: 1.2 });

      const ex = pa.x + (pb.x - pa.x) * s.t;
      const ey = pa.y + (pb.y - pa.y) * s.t;
      const ddx = pb.x - pa.x;
      const ddy = pb.y - pa.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const osc = Math.sin(this.time * 22 + s.osc) * 2.8;
      const sx = ex + (-ddy / d) * osc;
      const sy = ey + (ddx / d) * osc;

      g.circle(sx, sy, 12).fill({ color: C_SKY, alpha: 0.07 });
      g.circle(sx, sy, 6).fill({ color: C_BLUE, alpha: 0.28 });
      g.circle(sx, sy, 2.8).fill({ color: C_TEXT, alpha: 0.88 });
      g.circle(sx, sy, 1.2).fill({ color: 0xffffff, alpha: 1 });
    }

    // Expanding rings
    for (const r of this.rings) {
      if (!r.active) continue;
      const t = r.age / RING_LIFE;
      const rad = RING_MAX_R * t;
      const a = (1 - t) * 0.52;
      g.circle(r.x, r.y, rad).stroke({ color: r.color, alpha: a, width: 1.5 });
    }

    // Particles — iterate full pool; life + edgeFade = unified alpha multiplier
    const T = this.time;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;

      const ef = edgeFade(p.x, p.y, w, h);
      const fa = p.life * ef;
      if (fa < 0.01) continue;

      const pulse = 0.68 + Math.sin(T * 1.85 + p.phase) * 0.32;
      const glowR = (p.r * 3.8 + p.energy * 14) * pulse;
      const coreR = p.r + p.energy * 2.2;

      g.circle(p.x, p.y, glowR).fill({
        color: p.color,
        alpha: (0.04 + p.energy * 0.16) * pulse * fa,
      });
      g.circle(p.x, p.y, coreR).fill({
        color: p.color,
        alpha: (0.7 + p.energy * 0.25) * fa,
      });
      g.circle(p.x, p.y, Math.max(0.8, coreR * 0.4)).fill({
        color: C_TEXT,
        alpha: (0.25 + p.energy * 0.6) * fa,
      });
    }
  }
}

// Edge proximity → 0 at canvas edge, 1 past WRAP_FADE pixels in from edge.
// Particles fade out naturally before wrapping, making the loop seamless.
function edgeFade(x: number, y: number, w: number, h: number): number {
  const ex = Math.min(x, w - x) / WRAP_FADE;
  const ey = Math.min(y, h - y) / WRAP_FADE;
  return Math.min(1, Math.max(0, Math.min(ex, ey)));
}
