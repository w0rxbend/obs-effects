import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x050810;
const PALETTE = [0x00e8ff, 0xff00dd, 0x00ff65, 0x2979ff, 0xff8c00, 0xb94fff];

const ATTRACTOR_COUNT = 3000;
const INFLUENCE_RADIUS = 80;
const KILL_RADIUS = 14;
const SEGMENT_LENGTH = 7;
const BRANCH_PROB = 0.018;
const BRANCH_SPREAD = 0.45;
const STEPS_PER_FRAME = 5;
const MAX_TIPS = 60;
const MAX_NODES = 6000;
const COMPLETION_THRESHOLD = 0.88;
const FADE_DURATION = 2.5;
const GRID_CELL = 40;
const PERTURB_ANGLE = 0.35;

const enum Phase {
  Growing,
  Fading,
}

interface Attractor {
  x: number;
  y: number;
}

interface Node {
  x: number;
  y: number;
  parentIdx: number;
  age: number;
}

interface Edge {
  a: number;
  b: number;
  age: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class MyceliumNetworkScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private w = 1920;
  private h = 1080;

  private phase: Phase = Phase.Growing;
  private colorIdx = 0;
  private fadeAlpha = 0;

  private attractors: Attractor[] = [];
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private tips: number[] = [];
  private initialCount = 0;
  private consumed = 0;

  private grid = new Map<string, number[]>();

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.initCycle();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);

    if (this.phase === Phase.Growing) {
      this.stepGrowth();
    } else {
      this.fadeAlpha = Math.min(1, this.fadeAlpha + dt / FADE_DURATION);
      if (this.fadeAlpha >= 1) {
        this.colorIdx = (this.colorIdx + 1) % PALETTE.length;
        this.initCycle();
      }
    }

    this.draw();
  }

  private initCycle(): void {
    this.attractors = [];
    this.nodes = [];
    this.edges = [];
    this.tips = [];
    this.consumed = 0;
    this.fadeAlpha = 0;
    this.phase = Phase.Growing;
    this.grid.clear();
    this.initAttractors();
    this.initRoots();
    this.initialCount = this.attractors.length;
  }

  private initAttractors(): void {
    const m = 60;
    for (let i = 0; i < ATTRACTOR_COUNT; i++) {
      const x = m + Math.random() * (this.w - m * 2);
      const y = m + Math.random() * (this.h - m * 2);
      this.placeAttractor(x, y);
    }
  }

  private placeAttractor(x: number, y: number): void {
    const idx = this.attractors.length;
    this.attractors.push({ x, y });
    const key = this.cellKey(x, y);
    const cell = this.grid.get(key);
    if (cell) cell.push(idx);
    else this.grid.set(key, [idx]);
  }

  private initRoots(): void {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const x = this.w * (0.3 + Math.random() * 0.4);
      const y = this.h * (0.3 + Math.random() * 0.4);
      const idx = this.nodes.length;
      this.nodes.push({ x, y, parentIdx: -1, age: 0 });
      this.tips.push(idx);
    }
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / GRID_CELL)},${Math.floor(y / GRID_CELL)}`;
  }

  private nearbyAttractors(x: number, y: number): number[] {
    const result: number[] = [];
    const cr = Math.ceil(INFLUENCE_RADIUS / GRID_CELL);
    const cx0 = Math.floor(x / GRID_CELL);
    const cy0 = Math.floor(y / GRID_CELL);
    const ir2 = INFLUENCE_RADIUS * INFLUENCE_RADIUS;

    for (let cx = cx0 - cr; cx <= cx0 + cr; cx++) {
      for (let cy = cy0 - cr; cy <= cy0 + cr; cy++) {
        const cell = this.grid.get(`${cx},${cy}`);
        if (!cell) continue;
        for (const aIdx of cell) {
          const a = this.attractors[aIdx];
          const dx = a.x - x;
          const dy = a.y - y;
          if (dx * dx + dy * dy < ir2) result.push(aIdx);
        }
      }
    }
    return result;
  }

  private consumeAttractor(idx: number): void {
    const a = this.attractors[idx];
    const key = this.cellKey(a.x, a.y);
    const cell = this.grid.get(key);
    if (cell) {
      const pos = cell.indexOf(idx);
      if (pos !== -1) cell.splice(pos, 1);
    }
    a.x = -99999;
    a.y = -99999;
    this.consumed++;
  }

  private stepGrowth(): void {
    const ratio = this.initialCount > 0 ? this.consumed / this.initialCount : 0;

    if (
      this.tips.length === 0 ||
      ratio >= COMPLETION_THRESHOLD ||
      this.nodes.length >= MAX_NODES
    ) {
      this.phase = Phase.Fading;
      return;
    }

    // Shuffle tips for fair growth distribution
    for (let i = this.tips.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tips[i], this.tips[j]] = [this.tips[j], this.tips[i]];
    }

    const newTips: number[] = [];
    const steps = Math.min(STEPS_PER_FRAME, this.tips.length);
    let processed = 0;

    for (let i = 0; i < this.tips.length; i++) {
      const tipIdx = this.tips[i];

      if (processed < steps) {
        const tip = this.nodes[tipIdx];
        const nearby = this.nearbyAttractors(tip.x, tip.y);

        if (nearby.length === 0) {
          // tip dies — don't re-add
          processed++;
          continue;
        }

        processed++;

        // Weighted average direction toward attractors
        let dx = 0;
        let dy = 0;
        for (const aIdx of nearby) {
          const a = this.attractors[aIdx];
          const ex = a.x - tip.x;
          const ey = a.y - tip.y;
          const dist = Math.sqrt(ex * ex + ey * ey) || 1;
          dx += ex / dist;
          dy += ey / dist;
        }
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        // Organic perturbation
        const rawAngle = Math.atan2(dy / len, dx / len);
        const angle = rawAngle + (Math.random() - 0.5) * PERTURB_ANGLE;

        const nx = tip.x + Math.cos(angle) * SEGMENT_LENGTH;
        const ny = tip.y + Math.sin(angle) * SEGMENT_LENGTH;

        if (nx < 0 || nx > this.w || ny < 0 || ny > this.h) continue;

        const newIdx = this.nodes.length;
        this.nodes.push({ x: nx, y: ny, parentIdx: tipIdx, age: 0 });
        this.edges.push({ a: tipIdx, b: newIdx, age: 0 });

        if (newTips.length < MAX_TIPS) newTips.push(newIdx);

        // Kill attractors within reach
        const kr2 = KILL_RADIUS * KILL_RADIUS;
        for (const aIdx of nearby) {
          const a = this.attractors[aIdx];
          const ex = a.x - nx;
          const ey = a.y - ny;
          if (ex * ex + ey * ey < kr2) this.consumeAttractor(aIdx);
        }

        // Branching
        if (
          Math.random() < BRANCH_PROB &&
          this.nodes.length < MAX_NODES &&
          newTips.length < MAX_TIPS
        ) {
          const spread = BRANCH_SPREAD * (Math.random() < 0.5 ? 1 : -1);
          const bAngle = angle + spread;
          const bx = nx + Math.cos(bAngle) * SEGMENT_LENGTH;
          const by = ny + Math.sin(bAngle) * SEGMENT_LENGTH;

          if (bx >= 0 && bx <= this.w && by >= 0 && by <= this.h) {
            const branchIdx = this.nodes.length;
            this.nodes.push({ x: bx, y: by, parentIdx: newIdx, age: 0 });
            this.edges.push({ a: newIdx, b: branchIdx, age: 0 });
            newTips.push(branchIdx);
          }
        }
      } else {
        // Carry unprocessed tips forward
        if (newTips.length < MAX_TIPS) newTips.push(tipIdx);
      }
    }

    this.tips = newTips;

    for (const edge of this.edges) edge.age++;
    for (const node of this.nodes) node.age++;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    if (this.nodes.length === 0) return;

    const color = PALETTE[this.colorIdx];

    // Edges
    for (const edge of this.edges) {
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      const maturity = Math.min(edge.age / 450, 1);
      const alpha = 0.08 + maturity * 0.62;
      const width = 0.4 + maturity * 1.5;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width, alpha });
    }

    // Nodes — soft glow only for fresh ones to limit draw calls
    for (const node of this.nodes) {
      const maturity = Math.min(node.age / 450, 1);
      const alpha = 0.2 + maturity * 0.7;
      const r = 0.9 + maturity * 2;

      if (node.age < 200) {
        g.circle(node.x, node.y, r * 4).fill({ color, alpha: alpha * 0.1 });
      }
      g.circle(node.x, node.y, r).fill({ color, alpha });
    }

    // Active tips — bright white core with colored halo
    for (const tipIdx of this.tips) {
      const tip = this.nodes[tipIdx];
      if (!tip) continue;
      g.circle(tip.x, tip.y, 6).fill({ color, alpha: 0.28 });
      g.circle(tip.x, tip.y, 2.5).fill({ color: 0xffffff, alpha: 0.75 });
    }

    // Fade-to-black overlay
    if (this.phase === Phase.Fading && this.fadeAlpha > 0) {
      g.rect(0, 0, this.w, this.h).fill({ color: BG, alpha: this.fadeAlpha });
    }
  }
}
