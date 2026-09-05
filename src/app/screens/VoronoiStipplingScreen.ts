import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const C_CRUST = 0x11111b;
const C_SURFACE0 = 0x313244;
const C_SKY = 0x89dceb;
const C_TEAL = 0x94e2d5;
const C_WHITE = 0xffffff;

const ACCENTS = [
  0x74c7ec, // Sapphire
  0x89b4fa, // Blue
  0xb4befe, // Lavender
  0xcba6f7, // Mauve
  0xf5c2e7, // Pink
  0xf38ba8, // Red
  0xfab387, // Peach
  0xf9e2af, // Yellow
  0xa6e3a1, // Green
  0x94e2d5, // Teal
];

interface Seed {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  area: number;
  color: number;
  // Lifecycle
  age: number;
  maxAge: number;
  isExploding: boolean;
  explosionTimer: number;
}

interface Attractor {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Pixi copies the style object it is handed into its own record on every
// fill()/stroke() call, so a single mutable object can be reused for all of them
// instead of allocating a literal per shape.
const FILL_STYLE = { color: 0, alpha: 1 };
const STROKE_STYLE = { color: 0, width: 1, alpha: 1 };

// Side of the square block of Lloyd cells that shares one candidate seed list.
const BLOCK_CELLS = 10;

export class VoronoiStipplingScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bg = new Graphics();
  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private seeds: Seed[] = [];
  private attractors: Attractor[] = [];
  private time = 0;
  private eventTimer = 10;

  // Grid for Lloyd's algorithm approximation
  private readonly gridCols = 80;
  private readonly gridRows = 50;
  private cellW = 0;
  private cellH = 0;
  private readonly cellCX = new Float64Array(this.gridCols);
  private readonly cellCY = new Float64Array(this.gridRows);

  // Per-frame Lloyd scratch, indexed by "active seed" (see applyLloydsAlgorithm)
  private activeX = new Float64Array(0);
  private activeY = new Float64Array(0);
  private activeIdx = new Int32Array(0);
  private nearSq = new Float64Array(0);
  private sumsX = new Float32Array(0);
  private sumsY = new Float32Array(0);
  private counts = new Int32Array(0);

  // One candidate seed list per block of cells, rebuilt each frame
  private readonly blockCols = Math.ceil(this.gridCols / BLOCK_CELLS);
  private readonly blockRows = Math.ceil(this.gridRows / BLOCK_CELLS);
  private readonly candStart = new Int32Array(
    this.blockCols * this.blockRows + 1,
  );
  private cand = new Int32Array(0);

  constructor() {
    super();
    this.addChild(this.bg);
    this.addChild(this.gfx);
    this.initSeeds();
    this.initAttractors();
    this.rebuildCellCentres();
    this.drawBackground();
  }

  private initSeeds(): void {
    const seedCount = 110;
    for (let i = 0; i < seedCount; i++) {
      this.seeds.push(this.createSeed(true));
    }
    this.ensureSeedBuffers();
  }

  private createSeed(randomAge = false): Seed {
    const s: Seed = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      targetX: 0,
      targetY: 0,
      area: 0,
      color: C_SURFACE0,
      age: 0,
      maxAge: 0,
      isExploding: false,
      explosionTimer: 0,
    };
    this.resetSeed(s, randomAge);
    return s;
  }

  /** Recycles a seed in place so the frame loop never allocates a new one. */
  private resetSeed(s: Seed, randomAge = false): void {
    const maxAge = 35 + Math.random() * 45; // 35 to 80 seconds
    s.x = Math.random() * this.w;
    s.y = Math.random() * this.h;
    s.vx = 0;
    s.vy = 0;
    s.targetX = 0;
    s.targetY = 0;
    s.area = 0;
    s.color = C_SURFACE0;
    s.age = randomAge ? Math.random() * maxAge : 0;
    s.maxAge = maxAge;
    s.isExploding = false;
    s.explosionTimer = 0;
  }

  private ensureSeedBuffers(): void {
    const n = this.seeds.length;
    if (this.activeX.length >= n) return;
    this.activeX = new Float64Array(n);
    this.activeY = new Float64Array(n);
    this.activeIdx = new Int32Array(n);
    this.nearSq = new Float64Array(n);
    this.sumsX = new Float32Array(n);
    this.sumsY = new Float32Array(n);
    this.counts = new Int32Array(n);
    this.cand = new Int32Array(this.blockCols * this.blockRows * n);
  }

  /** Caches the centre of every Lloyd cell; only changes with the viewport. */
  private rebuildCellCentres(): void {
    this.cellW = this.w / this.gridCols;
    this.cellH = this.h / this.gridRows;
    for (let gx = 0; gx < this.gridCols; gx++) {
      this.cellCX[gx] = (gx + 0.5) * this.cellW;
    }
    for (let gy = 0; gy < this.gridRows; gy++) {
      this.cellCY[gy] = (gy + 0.5) * this.cellH;
    }
  }

  private initAttractors(): void {
    for (let i = 0; i < 3; i++) {
      this.attractors.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 50,
        vy: (Math.random() - 0.5) * 50,
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;
    this.eventTimer -= dt;

    if (this.eventTimer <= 0) {
      this.triggerMigrationEvent();
    }

    this.updateLifecycle(dt);
    this.updateAttractors(dt);
    this.applyLloydsAlgorithm();
    this.updatePhysics(dt);
    this.draw();
  }

  private updateLifecycle(dt: number): void {
    for (let i = 0; i < this.seeds.length; i++) {
      const s = this.seeds[i];
      if (s.isExploding) {
        s.explosionTimer += dt;
        if (s.explosionTimer >= 0.6) {
          // Recycle seed
          this.resetSeed(s);
        }
        continue;
      }

      s.age += dt;
      if (s.age >= s.maxAge) {
        this.triggerExplosion(s);
      }
    }
  }

  private triggerExplosion(source: Seed): void {
    source.isExploding = true;
    source.explosionTimer = 0;

    // Apply impulse to neighbors
    const explosionRadius = 450;
    const force = 600;

    for (const s of this.seeds) {
      if (s === source || s.isExploding) continue;
      const dx = s.x - source.x;
      const dy = s.y - source.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < explosionRadius * explosionRadius) {
        const dist = Math.sqrt(distSq) || 1;
        const power = 1 - dist / explosionRadius;
        s.vx += (dx / dist) * force * power;
        s.vy += (dy / dist) * force * power;
      }
    }
  }

  private triggerMigrationEvent(): void {
    this.eventTimer = 8 + Math.random() * 6;
    for (const a of this.attractors) {
      a.vx = (Math.random() - 0.5) * 350;
      a.vy = (Math.random() - 0.5) * 350;
    }
  }

  private updateAttractors(dt: number): void {
    for (const a of this.attractors) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < 0 || a.x > this.w) a.vx *= -1;
      if (a.y < 0 || a.y > this.h) a.vy *= -1;
      a.vx *= 0.992;
      a.vy *= 0.992;
      if (Math.abs(a.vx) < 15) a.vx += (Math.random() - 0.5) * 25;
      if (Math.abs(a.vy) < 15) a.vy += (Math.random() - 0.5) * 25;
    }
  }

  private applyLloydsAlgorithm(): void {
    const seeds = this.seeds;
    const sumsX = this.sumsX;
    const sumsY = this.sumsY;
    const counts = this.counts;
    const activeIdx = this.activeIdx;

    // Compact the seeds that take part in the tessellation into flat arrays.
    // Keeping their relative order means the nearest-seed tie break stays the
    // same as it was with the plain linear scan.
    let count = 0;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      if (s.isExploding) continue;
      this.activeX[count] = s.x;
      this.activeY[count] = s.y;
      activeIdx[count] = i;
      count++;
    }

    sumsX.fill(0, 0, count);
    sumsY.fill(0, 0, count);
    counts.fill(0, 0, count);

    if (count > 0) {
      this.buildCandidateLists(count);
      this.accumulateCells();
    }

    const cycleSpeed = 0.15;
    const tCycle = (this.time * cycleSpeed) % ACCENTS.length;
    const idx1 = Math.floor(tCycle);
    const idx2 = (idx1 + 1) % ACCENTS.length;
    const currentAccent = this.lerpColor(
      ACCENTS[idx1],
      ACCENTS[idx2],
      tCycle % 1,
    );
    const maxArea = ((this.w * this.h) / seeds.length) * 2.8;
    const cw = this.cellW;
    const ch = this.cellH;

    for (let a = 0; a < count; a++) {
      const c = counts[a];
      if (c > 0) {
        const s = seeds[activeIdx[a]];
        s.targetX = sumsX[a] / c;
        s.targetY = sumsY[a] / c;
        s.area = c * cw * ch;

        const ageFactor = 1 - s.age / s.maxAge;
        const tArea = Math.min(1, s.area / maxArea);
        const baseColor = this.lerpColor(currentAccent, C_SURFACE0, tArea);
        s.color = this.lerpColor(
          C_SURFACE0,
          baseColor,
          Math.max(0.3, ageFactor),
        );
      }
    }
  }

  /**
   * Narrows each block of cells down to the seeds that could possibly own one of
   * its cells. Take `rb`, the smallest "furthest corner" distance of any seed to
   * the block: every point in the block is within `rb` of that seed, so a seed
   * whose nearest point of the block is further away than `rb` can never win a
   * cell here and is dropped. Whatever survives is kept in seed order, so the
   * scan below picks exactly the seed the full scan used to pick.
   */
  private buildCandidateLists(count: number): void {
    const activeX = this.activeX;
    const activeY = this.activeY;
    const nearSq = this.nearSq;
    const candStart = this.candStart;
    const cand = this.cand;
    const cellW = this.cellW;
    const cellH = this.cellH;

    let w = 0;
    for (let by = 0; by < this.blockRows; by++) {
      const y0 = by * BLOCK_CELLS * cellH;
      const y1 = Math.min(this.gridRows, (by + 1) * BLOCK_CELLS) * cellH;

      for (let bx = 0; bx < this.blockCols; bx++) {
        const x0 = bx * BLOCK_CELLS * cellW;
        const x1 = Math.min(this.gridCols, (bx + 1) * BLOCK_CELLS) * cellW;
        candStart[by * this.blockCols + bx] = w;

        let rb = Infinity;
        for (let i = 0; i < count; i++) {
          const sx = activeX[i];
          const sy = activeY[i];
          // Signed gaps to the two edges on each axis: positive outside the
          // block, negative inside, so one pass yields both distances.
          const lx = x0 - sx;
          const rx = sx - x1;
          const ly = y0 - sy;
          const ry = sy - y1;
          const fx = lx > rx ? lx : rx;
          const fy = ly > ry ? ly : ry;
          const nx = fx > 0 ? fx : 0;
          const ny = fy > 0 ? fy : 0;
          nearSq[i] = nx * nx + ny * ny;
          const mx = lx > rx ? -rx : -lx;
          const my = ly > ry ? -ry : -ly;
          const farSq = mx * mx + my * my;
          if (farSq < rb) rb = farSq;
        }

        for (let i = 0; i < count; i++) {
          if (nearSq[i] <= rb) cand[w++] = i;
        }
      }
    }
    candStart[this.blockCols * this.blockRows] = w;
  }

  /**
   * Assigns every Lloyd cell to its nearest seed and accumulates the centroid
   * sums, testing only the candidates of the block the cell belongs to. Cells are
   * still visited row by row, left to right: the sums are Float32 and addition at
   * that precision is order sensitive, so keeping the original order keeps the
   * totals bit for bit the same.
   */
  private accumulateCells(): void {
    const activeX = this.activeX;
    const activeY = this.activeY;
    const candStart = this.candStart;
    const cand = this.cand;
    const sumsX = this.sumsX;
    const sumsY = this.sumsY;
    const counts = this.counts;
    const cellCX = this.cellCX;
    const cellCY = this.cellCY;

    for (let gy = 0; gy < this.gridRows; gy++) {
      const cy = cellCY[gy];
      const blockRowBase = ((gy / BLOCK_CELLS) | 0) * this.blockCols;

      for (let bx = 0; bx < this.blockCols; bx++) {
        const b = blockRowBase + bx;
        const cs = candStart[b];
        const ce = candStart[b + 1];
        const gx0 = bx * BLOCK_CELLS;
        const gx1 = Math.min(this.gridCols, gx0 + BLOCK_CELLS);

        for (let gx = gx0; gx < gx1; gx++) {
          const cx = cellCX[gx];
          let minDist = Infinity;
          let nearestIdx = -1;

          for (let k = cs; k < ce; k++) {
            const i = cand[k];
            const dx = cx - activeX[i];
            const dy = cy - activeY[i];
            const distSq = dx * dx + dy * dy;
            if (distSq < minDist) {
              minDist = distSq;
              nearestIdx = i;
            }
          }

          if (nearestIdx !== -1) {
            sumsX[nearestIdx] += cx;
            sumsY[nearestIdx] += cy;
            counts[nearestIdx]++;
          }
        }
      }
    }
  }

  private updatePhysics(dt: number): void {
    for (const s of this.seeds) {
      if (s.isExploding) {
        s.vx *= 0.85;
        s.vy *= 0.85;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        continue;
      }

      const dx = s.targetX - s.x;
      const dy = s.targetY - s.y;
      s.vx += dx * 4.2 * dt;
      s.vy += dy * 4.2 * dt;

      for (const a of this.attractors) {
        const adx = a.x - s.x;
        const ady = a.y - s.y;
        const adist = Math.sqrt(adx * adx + ady * ady) || 1;
        const pull = Math.max(0, 1 - adist / 550);
        s.vx += (adx / adist) * pull * 45 * dt;
        s.vy += (ady / adist) * pull * 45 * dt;
      }

      const jitter = 35 * (1 + s.age / s.maxAge);
      s.vx += (Math.random() - 0.5) * jitter * dt;
      s.vy += (Math.random() - 0.5) * jitter * dt;

      s.vx *= 0.9;
      s.vy *= 0.9;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.x < 0) s.x = 0;
      if (s.x > this.w) s.x = this.w;
      if (s.y < 0) s.y = 0;
      if (s.y > this.h) s.y = this.h;
    }
  }

  /** The backdrop only changes on resize, so it lives on its own Graphics. */
  private drawBackground(): void {
    FILL_STYLE.color = C_CRUST;
    FILL_STYLE.alpha = 1;
    this.bg.clear();
    this.bg.rect(0, 0, this.w, this.h).fill(FILL_STYLE);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    for (const s of this.seeds) {
      if (s.isExploding) {
        const progress = s.explosionTimer / 0.6;
        const r = Math.sqrt(s.area / Math.PI) * (1 + progress * 2);
        const alpha = 1 - progress;
        FILL_STYLE.color = C_WHITE;
        FILL_STYLE.alpha = alpha * 0.5;
        g.circle(s.x, s.y, r).fill(FILL_STYLE);
        STROKE_STYLE.color = s.color;
        STROKE_STYLE.width = 2;
        STROKE_STYLE.alpha = alpha;
        g.circle(s.x, s.y, r * 0.5).stroke(STROKE_STYLE);
        continue;
      }

      const growFactor = Math.min(1, s.age / 2);
      const r = Math.sqrt(s.area / Math.PI) * 0.95 * growFactor;
      const pulse = 1 + 0.06 * Math.sin(this.time * 4 + s.x * 0.015);

      FILL_STYLE.color = s.color;
      FILL_STYLE.alpha = 0.85;
      g.circle(s.x, s.y, r * pulse).fill(FILL_STYLE);
      FILL_STYLE.color = C_SKY;
      FILL_STYLE.alpha = 0.45 * growFactor;
      g.circle(s.x, s.y, r * 0.22).fill(FILL_STYLE);
    }

    this.drawOrganismDetail(g);
  }

  private drawOrganismDetail(g: Graphics): void {
    const seeds = this.seeds;
    const threshold = 180 * 180;
    STROKE_STYLE.color = C_TEAL;
    STROKE_STYLE.width = 1;
    for (let i = 0; i < seeds.length; i++) {
      const s1 = seeds[i];
      if (s1.isExploding) continue;
      const x1 = s1.x;
      const y1 = s1.y;
      for (let j = i + 1; j < seeds.length; j++) {
        const s2 = seeds[j];
        if (s2.isExploding) continue;
        const dx = x1 - s2.x;
        const dy = y1 - s2.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < threshold) {
          STROKE_STYLE.alpha = (1 - d2 / threshold) * 0.15;
          g.moveTo(x1, y1).lineTo(s2.x, s2.y).stroke(STROKE_STYLE);
        }
      }
    }
  }

  private lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    if (this.seeds.length === 0) this.initSeeds();
    this.ensureSeedBuffers();
    this.rebuildCellCentres();
    this.drawBackground();
  }
}
