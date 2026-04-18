import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────

const CRUST    = 0x11111b;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const OVERLAY0 = 0x6c7086;

const ACCENTS = [
  0xcba6f7, // Mauve
  0x89b4fa, // Blue
  0xa6e3a1, // Green
  0x94e2d5, // Teal
  0xf38ba8, // Red
  0xfab387, // Peach
  0xf9e2af, // Yellow
  0x89dceb, // Sky
  0x74c7ec, // Sapphire
  0xb4befe, // Lavender
  0xf5c2e7, // Pink
] as const;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface GraphNode {
  x: number; y: number;
  r: number;
  activeT: number;
  pulsePh: number;
  activeColor: number;
  treeNeighbors: number[];
}

interface TreeEdge {
  a: number; b: number;
  activeT: number;
  activeColor: number;
}

interface Impulse {
  fromNode: number;
  toNode: number;
  edgeIdx: number;
  t: number;
  speed: number;
  color: number;
  hops: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_NODE_DIST  = 50;
const NODE_DENSITY   = 5_000;
const FADE_TIME      = 2.6;
const SPAWN_LO       = 0.08;
const SPAWN_HI       = 0.35;
const HOP_MIN        = 10;
const HOP_MAX        = 40;
const SPEED_LO       = 0.8;
const SPEED_HI       = 2.2;
const MAX_IMPULSES   = 35;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export class GraphBgScreen extends Container {
  public static assetBundles = ["default"];

  private readonly edgeGfx: Graphics;
  private readonly impGfx:  Graphics;
  private readonly nodeGfx: Graphics;

  private nodes:    GraphNode[] = [];
  private edges:    TreeEdge[]  = [];
  private impulses: Impulse[]   = [];

  private spawnTimer    = 0;
  private nextSpawnIn   = 0;

  private sw = 1920;
  private sh = 1080;

  constructor() {
    super();
    this.edgeGfx = new Graphics();
    this.impGfx  = new Graphics();
    this.nodeGfx = new Graphics();
    this.addChild(this.edgeGfx);
    this.addChild(this.impGfx);
    this.addChild(this.nodeGfx);
  }

  public show(): Promise<void> { return Promise.resolve(); }

  // ── Graph build (Prim's MST — guaranteed acyclic + connected) ─────────────

  private buildGraph(): void {
    this.nodes    = [];
    this.edges    = [];
    this.impulses = [];

    const w = this.sw, h = this.sh;
    const target = Math.max(30, Math.floor((w * h) / NODE_DENSITY));

    for (let attempt = 0; this.nodes.length < target && attempt < target * 40; attempt++) {
      const x = rand(24, w - 24), y = rand(24, h - 24);
      let ok = true;
      for (const n of this.nodes) {
        if (Math.hypot(n.x - x, n.y - y) < MIN_NODE_DIST) { ok = false; break; }
      }
      if (!ok) continue;
      this.nodes.push({
        x, y, r: rand(3.5, 7.5),
        activeT: 0, pulsePh: Math.random() * Math.PI * 2,
        activeColor: ACCENTS[0],
        treeNeighbors: [],
      });
    }

    const N = this.nodes.length;
    if (N < 2) return;

    const inMST   = new Uint8Array(N);
    const minDist = new Float64Array(N).fill(Infinity);
    const parent  = new Int32Array(N).fill(-1);
    minDist[0] = 0;

    for (let step = 0; step < N; step++) {
      let u = -1;
      for (let i = 0; i < N; i++) {
        if (!inMST[i] && (u === -1 || minDist[i] < minDist[u])) u = i;
      }
      inMST[u] = 1;

      if (parent[u] >= 0) {
        const idx = this.edges.length;
        this.edges.push({ a: parent[u], b: u, activeT: 0, activeColor: ACCENTS[0] });
        this.nodes[parent[u]].treeNeighbors.push(u);
        this.nodes[u].treeNeighbors.push(parent[u]);
        void idx;
      }

      for (let v = 0; v < N; v++) {
        if (inMST[v]) continue;
        const d = Math.hypot(this.nodes[u].x - this.nodes[v].x, this.nodes[u].y - this.nodes[v].y);
        if (d < minDist[v]) { minDist[v] = d; parent[v] = u; }
      }
    }
  }

  private findEdge(a: number, b: number): number {
    return this.edges.findIndex(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  // ── Impulse spawn ─────────────────────────────────────────────────────────

  private spawnImpulse(): void {
    if (this.impulses.length >= MAX_IMPULSES || this.nodes.length === 0) return;

    const color    = pick(ACCENTS);
    const startIdx = Math.floor(Math.random() * this.nodes.length);
    const start    = this.nodes[startIdx];
    if (start.treeNeighbors.length === 0) return;

    const nextNode = start.treeNeighbors[Math.floor(Math.random() * start.treeNeighbors.length)];

    start.activeT    = 1.0;
    start.pulsePh    = 0;
    start.activeColor = color;

    this.impulses.push({
      fromNode: startIdx,
      toNode:   nextNode,
      edgeIdx:  this.findEdge(startIdx, nextNode),
      t: 0,
      speed: rand(SPEED_LO, SPEED_HI),
      color,
      hops: Math.floor(rand(HOP_MIN, HOP_MAX)),
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS / 1000;

    // Fade activations
    for (const n of this.nodes) {
      if (n.activeT > 0) { n.activeT = Math.max(0, n.activeT - dt / FADE_TIME); n.pulsePh += dt * 5.5; }
    }
    for (const e of this.edges) {
      if (e.activeT > 0) e.activeT = Math.max(0, e.activeT - dt / FADE_TIME);
    }

    // Advance impulses
    for (let i = this.impulses.length - 1; i >= 0; i--) {
      const imp = this.impulses[i];
      imp.t += imp.speed * dt;

      if (imp.t >= 1) {
        // Arrived at toNode — activate it
        const arrived = imp.toNode;
        this.nodes[arrived].activeT    = 1.0;
        this.nodes[arrived].pulsePh    = 0;
        this.nodes[arrived].activeColor = imp.color;
        this.edges[imp.edgeIdx].activeT    = 1.0;
        this.edges[imp.edgeIdx].activeColor = imp.color;

        imp.hops--;

        const choices = this.nodes[arrived].treeNeighbors.filter(n => n !== imp.fromNode);

        if (imp.hops <= 0 || choices.length === 0) {
          this.impulses.splice(i, 1);
          continue;
        }

        const next     = choices[Math.floor(Math.random() * choices.length)];
        imp.fromNode   = arrived;
        imp.toNode     = next;
        imp.edgeIdx    = this.findEdge(arrived, next);
        imp.t          = 0;
        imp.speed      = rand(SPEED_LO, SPEED_HI);
      }
    }

    // Spawn timer
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnIn) {
      this.spawnTimer  = 0;
      this.nextSpawnIn = rand(SPAWN_LO, SPAWN_HI);
      this.spawnImpulse();
    }

    this.draw();
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private draw(): void {
    const eg = this.edgeGfx;
    const ig = this.impGfx;
    const ng = this.nodeGfx;
    eg.clear(); ig.clear(); ng.clear();

    eg.rect(0, 0, this.sw, this.sh).fill({ color: CRUST });

    for (const e of this.edges) {
      const na = this.nodes[e.a], nb = this.nodes[e.b];

      eg.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
        .stroke({ color: SURFACE0, alpha: 0.55, width: 1.0 });
      eg.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
        .stroke({ color: SURFACE1, alpha: 0.15, width: 3.0 });

      if (e.activeT > 0.01) {
        eg.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
          .stroke({ color: e.activeColor, alpha: e.activeT * 0.65, width: 1.2 + e.activeT * 2.4 });
        eg.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
          .stroke({ color: e.activeColor, alpha: e.activeT * 0.11, width: 6 + e.activeT * 9 });
      }
    }

    for (const imp of this.impulses) {
      const na  = this.nodes[imp.fromNode];
      const nb  = this.nodes[imp.toNode];
      const hx  = na.x + (nb.x - na.x) * imp.t;
      const hy  = na.y + (nb.y - na.y) * imp.t;

      ig.moveTo(na.x, na.y).lineTo(hx, hy)
        .stroke({ color: imp.color, alpha: 0.72, width: 2.2, cap: "round" });
      ig.moveTo(na.x, na.y).lineTo(hx, hy)
        .stroke({ color: imp.color, alpha: 0.13, width: 9, cap: "round" });

      ig.circle(hx, hy, 6.0).fill({ color: imp.color, alpha: 0.95 });
      ig.circle(hx, hy, 12).fill({ color: imp.color, alpha: 0.20 });
      ig.circle(hx, hy, 22).fill({ color: imp.color, alpha: 0.07 });
    }

    for (const n of this.nodes) {
      if (n.activeT > 0.01) {
        const pulse = 1 + Math.sin(n.pulsePh) * 0.30 * n.activeT;
        const r = n.r * pulse, a = n.activeT;
        ng.circle(n.x, n.y, r * 5.5).fill({ color: n.activeColor, alpha: 0.030 * a });
        ng.circle(n.x, n.y, r * 3.0).fill({ color: n.activeColor, alpha: 0.085 * a });
        ng.circle(n.x, n.y, r * 1.7).fill({ color: n.activeColor, alpha: 0.22  * a });
        ng.circle(n.x, n.y, r).fill({ color: n.activeColor, alpha: 0.92 });
        ng.circle(n.x, n.y, r).stroke({ color: n.activeColor, alpha: 1.0, width: 1.5 });
        ng.circle(n.x - r * 0.28, n.y - r * 0.30, r * 0.26)
          .fill({ color: 0xffffff, alpha: 0.30 * a });
      } else {
        ng.circle(n.x, n.y, n.r).fill({ color: SURFACE0, alpha: 0.70 });
        ng.circle(n.x, n.y, n.r).stroke({ color: OVERLAY0, alpha: 0.45, width: 1.0 });
      }
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.sw = width;
    this.sh = height;
    this.buildGraph();
    this.nextSpawnIn = rand(SPAWN_LO, SPAWN_HI);
  }
}
