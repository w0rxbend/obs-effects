import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const BG = 0x040810;
const C_TEAL = 0x94e2d5;
const C_BLUE = 0x89b4fa;
const C_SAPH = 0x74c7ec;
const C_PRED = 0xff6b6b;
const C_LEAD = 0xf9e2af;
const C_PANIC = 0xfab387;
const C_WHITE = 0xcdd6f4;

const FLOCK_COLORS: number[] = [C_TEAL, C_BLUE, C_SAPH];

// ── Simulation constants ──────────────────────────────────────────────────────
const NUM_BOIDS = 1800;
const NUM_PRED = 3;
const NUM_FLOCKS = 3;
const LEADERS_PER_FLOCK = 4;

const NEIGHBOR_R = 75; // cohesion / alignment radius px
const SEP_R = 26; // hard separation radius px
const PRED_R = 160; // predator flee radius px
const PANIC_R = 50; // panic-wave propagation radius px
const LEADER_R = 180; // leader attraction radius px
const EDGE_M = 110; // soft wall margin px
const CELL = 80; // spatial grid cell size (>= NEIGHBOR_R)

const MAX_SPD = 200; // prey normal   px/s
const MAX_SPD_PAN = 280; // prey panic    px/s
const MAX_SPD_SCA = 240; // prey scatter  px/s
const MAX_SPD_PRE = 230; // predator      px/s
const BASE_SPD = 130;
const MIN_SPD = 45;

const W_SEP = 2.2;
const W_ALIGN = 1.0;
const W_COH = 0.6;
const W_FLEE = 4.5;
const W_LEAD = 0.4;
const W_EDGE = 3.0;

const PANIC_DUR = 4.0; // s
const SCATTER_DUR = 4.5; // s
const SCATTER_ITV = 22; // s

// Boid state IDs (plain numbers — avoids const-enum portability issues)
const S_FLOCK = 0;
const S_PANIC = 1;
const S_SCATTER = 2;

// Arrow geometry (px from boid centre, pre-scaled for normal boids)
const TIP_L = 7;
const WING_L = 4;
const TAIL_L = 12;
const HALF_W = 3.5;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: number;
  panicTimer: number;
  scatterTimer: number;
  flock: number;
  isLeader: boolean;
  color: number;
}

interface Pred {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// ── Spatial grid ──────────────────────────────────────────────────────────────
class SpatialGrid {
  private cols = 1;
  private rows = 1;
  private readonly CAP = 40; // max boids per cell
  private data = new Uint16Array(0);
  private cnt = new Uint16Array(0);

  resize(w: number, h: number): void {
    this.cols = Math.ceil(w / CELL) + 1;
    this.rows = Math.ceil(h / CELL) + 1;
    const n = this.cols * this.rows;
    this.data = new Uint16Array(n * this.CAP);
    this.cnt = new Uint16Array(n);
  }

  clear(): void {
    this.cnt.fill(0);
  }

  insert(idx: number, x: number, y: number): void {
    const c = Math.min(this.cols - 1, Math.max(0, (x / CELL) | 0));
    const r = Math.min(this.rows - 1, Math.max(0, (y / CELL) | 0));
    const ci = r * this.cols + c;
    const n = this.cnt[ci];
    if (n < this.CAP) {
      this.data[ci * this.CAP + n] = idx;
      this.cnt[ci]++;
    }
  }

  query(x: number, y: number, out: Uint16Array, maxOut: number): number {
    const cc = Math.min(this.cols - 1, Math.max(0, (x / CELL) | 0));
    const cr = Math.min(this.rows - 1, Math.max(0, (y / CELL) | 0));
    let n = 0;
    for (
      let r = Math.max(0, cr - 1);
      r <= Math.min(this.rows - 1, cr + 1);
      r++
    ) {
      for (
        let c = Math.max(0, cc - 1);
        c <= Math.min(this.cols - 1, cc + 1);
        c++
      ) {
        const ci = r * this.cols + c;
        const cnt = this.cnt[ci];
        for (let k = 0; k < cnt && n < maxOut; k++) {
          out[n++] = this.data[ci * this.CAP + k];
        }
      }
    }
    return n;
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class GpuBoidsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx = new Graphics();
  private readonly glowGfx = new Graphics();
  private readonly mainGfx = new Graphics();
  private readonly vigGfx = new Graphics();

  private readonly boids: Boid[] = [];
  private readonly preds: Pred[] = [];
  private readonly leaders: Boid[] = []; // references into boids[]

  private readonly grid = new SpatialGrid();
  private readonly neighBuf = new Uint16Array(600);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private nextScatter = SCATTER_ITV;

  constructor() {
    super();

    const glowLayer = new Container();
    glowLayer.addChild(this.glowGfx);
    // Blurred layer only holds leader + predator glow circles (small count)
    glowLayer.filters = [new BlurFilter({ strength: 16, quality: 2 })];

    this.vigGfx.filters = [new BlurFilter({ strength: 55, quality: 2 })];

    this.addChild(this.bgGfx);
    this.addChild(glowLayer);
    this.addChild(this.mainGfx);
    this.addChild(this.vigGfx);

    this.initBoids();
    this.initPreds();
    this.grid.resize(this.w, this.h);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.grid.resize(this.w, this.h);
    this.drawVignette();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.grid.resize(w, h);
    this.drawVignette();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.nextScatter -= dt;
    if (this.nextScatter <= 0) {
      this.triggerScatter();
      this.nextScatter = SCATTER_ITV * (0.8 + 0.4 * Math.random());
    }
    this.rebuildGrid();
    this.stepPreds(dt);
    this.stepBoids(dt);
    this.drawBackground();
    this.drawGlows();
    this.drawBoids();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  private initBoids(): void {
    const perFlock = Math.floor(NUM_BOIDS / NUM_FLOCKS);
    for (let f = 0; f < NUM_FLOCKS; f++) {
      // Each flock starts in a distinct cluster so splitting is visible
      const cx = (0.2 + f * 0.3) * 1920;
      const cy = 0.5 * 1080;
      const color = FLOCK_COLORS[f % FLOCK_COLORS.length];
      for (let i = 0; i < perFlock; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = BASE_SPD * (0.7 + 0.6 * Math.random());
        const isLeader = i < LEADERS_PER_FLOCK;
        const boid: Boid = {
          x: cx + (Math.random() - 0.5) * 280,
          y: cy + (Math.random() - 0.5) * 280,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          state: S_FLOCK,
          panicTimer: 0,
          scatterTimer: 0,
          flock: f,
          isLeader,
          color,
        };
        if (isLeader) this.leaders.push(boid);
        this.boids.push(boid);
      }
    }
  }

  private initPreds(): void {
    for (let i = 0; i < NUM_PRED; i++) {
      this.preds.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        vx: (Math.random() - 0.5) * MAX_SPD_PRE,
        vy: (Math.random() - 0.5) * MAX_SPD_PRE,
      });
    }
  }

  // ── Per-frame simulation ──────────────────────────────────────────────────
  private rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.boids.length; i++) {
      this.grid.insert(i, this.boids[i].x, this.boids[i].y);
    }
  }

  private stepPreds(dt: number): void {
    const { w, h } = this;
    for (const p of this.preds) {
      // Chase nearest boid — scan is cheap with only 3 predators
      let bestD2 = Infinity;
      let tx = w * 0.5;
      let ty = h * 0.5;
      for (const b of this.boids) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          tx = b.x;
          ty = b.y;
        }
      }

      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      p.vx += (dx / d) * MAX_SPD_PRE * dt * 2.5;
      p.vy += (dy / d) * MAX_SPD_PRE * dt * 2.5;

      // Soft edge repulsion (predators stay on-screen, no wrapping)
      if (p.x < EDGE_M) p.vx += (W_EDGE * 3 * (EDGE_M - p.x)) / EDGE_M;
      if (p.x > w - EDGE_M)
        p.vx -= (W_EDGE * 3 * (EDGE_M - (w - p.x))) / EDGE_M;
      if (p.y < EDGE_M) p.vy += (W_EDGE * 3 * (EDGE_M - p.y)) / EDGE_M;
      if (p.y > h - EDGE_M)
        p.vy -= (W_EDGE * 3 * (EDGE_M - (h - p.y))) / EDGE_M;

      const spd2 = p.vx * p.vx + p.vy * p.vy;
      if (spd2 > MAX_SPD_PRE * MAX_SPD_PRE) {
        const f = MAX_SPD_PRE / Math.sqrt(spd2);
        p.vx *= f;
        p.vy *= f;
      }

      p.x = Math.max(0, Math.min(w, p.x + p.vx * dt));
      p.y = Math.max(0, Math.min(h, p.y + p.vy * dt));
    }
  }

  private stepBoids(dt: number): void {
    const { w, h, time, boids, preds, leaders, neighBuf } = this;
    const nr2 = NEIGHBOR_R * NEIGHBOR_R;
    const sr2 = SEP_R * SEP_R;
    const pr2 = PRED_R * PRED_R;
    const panr2 = PANIC_R * PANIC_R;
    const lr2 = LEADER_R * LEADER_R;

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];

      // State timer decay — PANIC takes priority over SCATTER
      if (b.state === S_PANIC) {
        b.panicTimer -= dt;
        if (b.panicTimer <= 0) {
          b.state = S_FLOCK;
          b.panicTimer = 0;
        }
      } else if (b.state === S_SCATTER) {
        b.scatterTimer -= dt;
        if (b.scatterTimer <= 0) {
          b.state = S_FLOCK;
          b.scatterTimer = 0;
        }
      }

      // Neighbour query from spatial grid
      const nCount = this.grid.query(b.x, b.y, neighBuf, neighBuf.length);

      let sepFx = 0;
      let sepFy = 0;
      let sepN = 0;
      let aliVx = 0;
      let aliVy = 0;
      let aliN = 0;
      let cohX = 0;
      let cohY = 0;
      let cohN = 0;

      for (let k = 0; k < nCount; k++) {
        const j = neighBuf[k];
        if (j === i) continue;
        const nb = boids[j];
        const dx = b.x - nb.x;
        const dy = b.y - nb.y;
        const d2 = dx * dx + dy * dy;

        if (d2 > 0 && d2 < sr2) {
          const d = Math.sqrt(d2);
          sepFx += (dx / d) * (1 - d / SEP_R);
          sepFy += (dy / d) * (1 - d / SEP_R);
          sepN++;
        }
        if (d2 < nr2) {
          aliVx += nb.vx;
          aliVy += nb.vy;
          cohX += nb.x;
          cohY += nb.y;
          aliN++;
          cohN++;
          // Panic wave: a panicking neighbour spreads panic to close FLOCK boids
          if (nb.state === S_PANIC && b.state === S_FLOCK && d2 < panr2) {
            b.state = S_PANIC;
            b.panicTimer = Math.max(b.panicTimer, PANIC_DUR * 0.6);
          }
        }
      }

      let fx = 0;
      let fy = 0;

      if (sepN > 0) {
        fx += W_SEP * sepFx;
        fy += W_SEP * sepFy;
      }
      if (aliN > 0) {
        fx += W_ALIGN * ((aliVx / aliN - b.vx) / MAX_SPD);
        fy += W_ALIGN * ((aliVy / aliN - b.vy) / MAX_SPD);
      }
      if (cohN > 0) {
        const tcx = cohX / cohN - b.x;
        const tcy = cohY / cohN - b.y;
        const td = Math.sqrt(tcx * tcx + tcy * tcy) + 1;
        fx += W_COH * (tcx / td);
        fy += W_COH * (tcy / td);
      }

      // Predator flee (linear scan — only 3 predators)
      for (const p of preds) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pr2) {
          const d = Math.sqrt(d2) + 1;
          const strength = W_FLEE * (1 - d / PRED_R);
          fx += strength * (dx / d);
          fy += strength * (dy / d);
          if (b.state !== S_PANIC) {
            b.state = S_PANIC;
            b.panicTimer = PANIC_DUR;
          }
        }
      }

      // Leader attraction for non-leaders (pull toward nearest same-flock leader)
      if (!b.isLeader) {
        let bestL = lr2;
        let lx = 0;
        let ly = 0;
        let found = false;
        for (const lead of leaders) {
          if (lead.flock !== b.flock) continue;
          const dx = lead.x - b.x;
          const dy = lead.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestL) {
            bestL = d2;
            const d = Math.sqrt(d2) + 1;
            lx = dx / d;
            ly = dy / d;
            found = true;
          }
        }
        if (found) {
          fx += W_LEAD * lx;
          fy += W_LEAD * ly;
        }
      } else {
        // Leaders slowly wander, biasing their flock's direction
        const wa = time * 0.5 + b.x * 0.001 + b.flock * 2.094;
        fx += Math.cos(wa) * 0.28;
        fy += Math.sin(wa) * 0.28;
      }

      // Soft edge repulsion
      const exL = EDGE_M - b.x;
      if (exL > 0) fx += (W_EDGE * exL) / EDGE_M;
      const exR = EDGE_M - (w - b.x);
      if (exR > 0) fx -= (W_EDGE * exR) / EDGE_M;
      const eyT = EDGE_M - b.y;
      if (eyT > 0) fy += (W_EDGE * eyT) / EDGE_M;
      const eyB = EDGE_M - (h - b.y);
      if (eyB > 0) fy -= (W_EDGE * eyB) / EDGE_M;

      // Scatter: per-boid deterministic random impulse creates flock break-up
      if (b.state === S_SCATTER) {
        const sa = (i * 2.399 + time * 3.1) % (Math.PI * 2);
        fx += Math.cos(sa) * 1.8;
        fy += Math.sin(sa) * 1.8;
      }

      // Velocity integration
      b.vx += fx * dt * MAX_SPD;
      b.vy += fy * dt * MAX_SPD;

      // Speed clamp based on state
      const maxS =
        b.state === S_PANIC
          ? MAX_SPD_PAN
          : b.state === S_SCATTER
            ? MAX_SPD_SCA
            : MAX_SPD;
      const spd2 = b.vx * b.vx + b.vy * b.vy;
      if (spd2 > maxS * maxS) {
        const f = maxS / Math.sqrt(spd2);
        b.vx *= f;
        b.vy *= f;
      } else if (spd2 < MIN_SPD * MIN_SPD && spd2 > 0) {
        const f = MIN_SPD / Math.sqrt(spd2);
        b.vx *= f;
        b.vy *= f;
      } else if (spd2 === 0) {
        b.vx = MIN_SPD;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Hard boundary — reflect so boids don't escape
      if (b.x < 0) {
        b.x = 0;
        if (b.vx < 0) b.vx = -b.vx * 0.5;
      } else if (b.x > w) {
        b.x = w;
        if (b.vx > 0) b.vx = -b.vx * 0.5;
      }
      if (b.y < 0) {
        b.y = 0;
        if (b.vy < 0) b.vy = -b.vy * 0.5;
      } else if (b.y > h) {
        b.y = h;
        if (b.vy > 0) b.vy = -b.vy * 0.5;
      }
    }
  }

  private triggerScatter(): void {
    const f = Math.floor(Math.random() * NUM_FLOCKS);
    for (const b of this.boids) {
      if (b.flock === f && b.state === S_FLOCK) {
        b.state = S_SCATTER;
        b.scatterTimer = SCATTER_DUR * (0.5 + Math.random());
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  private drawBackground(): void {
    const g = this.bgGfx;
    const { w, h, time } = this;
    g.clear().rect(0, 0, w, h).fill({ color: BG });
    const md = Math.min(w, h);
    g.circle(
      (0.5 + Math.sin(time * 0.012) * 0.14) * w,
      (0.5 + Math.cos(time * 0.009) * 0.11) * h,
      0.55 * md,
    ).fill({ color: 0x071020, alpha: 0.3 });
    g.circle(
      (0.3 + Math.cos(time * 0.018) * 0.1) * w,
      (0.65 + Math.sin(time * 0.015) * 0.08) * h,
      0.4 * md,
    ).fill({ color: 0x09071e, alpha: 0.22 });
  }

  // Only leaders + predators get glow circles on the blurred layer — small count
  private drawGlows(): void {
    const g = this.glowGfx;
    const { time } = this;
    g.clear();
    for (const lead of this.leaders) {
      const pulse = 1 + 0.3 * Math.sin(time * 3.5 + lead.x * 0.01);
      g.circle(lead.x, lead.y, 22 * pulse).fill({ color: C_LEAD, alpha: 0.22 });
      g.circle(lead.x, lead.y, 9 * pulse).fill({ color: C_LEAD, alpha: 0.48 });
    }
    for (const p of this.preds) {
      const pulse = 1 + 0.4 * Math.sin(time * 4.0);
      g.circle(p.x, p.y, 38 * pulse).fill({ color: C_PRED, alpha: 0.28 });
      g.circle(p.x, p.y, 18 * pulse).fill({ color: C_PRED, alpha: 0.52 });
    }
  }

  private drawBoids(): void {
    const g = this.mainGfx;
    const { time } = this;
    g.clear();

    for (const b of this.boids) {
      const spd2 = b.vx * b.vx + b.vy * b.vy;
      if (spd2 < 1) continue;
      const spd = Math.sqrt(spd2);
      const nx = b.vx / spd;
      const ny = b.vy / spd;
      const px = -ny; // perpendicular
      const py = nx;

      const sc = b.isLeader ? 1.45 : 1.0;
      const tl = TIP_L * sc;
      const wl = WING_L * sc;
      const tail = TAIL_L * sc;
      const hw = HALF_W * sc;

      const color =
        b.state === S_PANIC ? C_PANIC : b.isLeader ? C_LEAD : b.color;
      const alpha = b.isLeader ? 0.95 : b.state === S_PANIC ? 0.88 : 0.75;

      // Diamond arrow: tip → left-wing → tail → right-wing (auto-closed)
      g.poly([
        b.x + nx * tl,
        b.y + ny * tl,
        b.x - nx * wl + px * hw,
        b.y - ny * wl + py * hw,
        b.x - nx * tail,
        b.y - ny * tail,
        b.x - nx * wl - px * hw,
        b.y - ny * wl - py * hw,
      ]).fill({ color, alpha });

      // White hot-spot at tip
      g.circle(b.x + nx * tl, b.y + ny * tl, sc * 1.3).fill({
        color: C_WHITE,
        alpha: 0.48,
      });
    }

    // Predators: larger pulsing diamond + bright tip
    for (const p of this.preds) {
      const spd2 = p.vx * p.vx + p.vy * p.vy;
      if (spd2 < 1) continue;
      const spd = Math.sqrt(spd2);
      const nx = p.vx / spd;
      const ny = p.vy / spd;
      const px = -ny;
      const py = nx;
      const pulse = 1 + 0.25 * Math.sin(time * 5.0);
      const pl = 18 * pulse;
      const pw = 8 * pulse;

      g.poly([
        p.x + nx * pl,
        p.y + ny * pl,
        p.x - nx * 8 + px * pw,
        p.y - ny * 8 + py * pw,
        p.x - nx * pl,
        p.y - ny * pl,
        p.x - nx * 8 - px * pw,
        p.y - ny * 8 - py * pw,
      ]).fill({ color: C_PRED, alpha: 0.92 });

      g.circle(p.x + nx * pl, p.y + ny * pl, 3.5).fill({
        color: C_WHITE,
        alpha: 0.85,
      });
    }
  }

  private drawVignette(): void {
    const g = this.vigGfx;
    const { w, h } = this;
    g.clear();
    const r = Math.min(w, h) * 0.72;
    g.circle(0, 0, r).fill({ color: 0x000000, alpha: 0.88 });
    g.circle(w, 0, r).fill({ color: 0x000000, alpha: 0.88 });
    g.circle(0, h, r).fill({ color: 0x000000, alpha: 0.88 });
    g.circle(w, h, r).fill({ color: 0x000000, alpha: 0.88 });
  }
}
