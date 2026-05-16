import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const BG = 0x05090f;
const C_GRID = 0x081422;
const C_CONN_ACT = 0x006f8e;
const C_CONN_HOT = 0x00b4d4;
const C_PACKET = 0x00eeff;

const CLUSTER_COLORS = [
  0x00d4ff, // Gateway   — bright cyan
  0x4499ee, // Frontend  — blue
  0x00cc88, // Backend   — teal-green
  0x44ddff, // Cache     — light cyan
  0x3377dd, // Database  — deep blue
  0x00aacc, // Monitor   — dark teal
];

// ── Config ────────────────────────────────────────────────────────────────────
const PACKET_POOL = 80;
const TRAIL_LEN = 12;
const PACKET_SPEED = 210; // px/s nominal
const SPAWN_MIN = 0.12;
const SPAWN_MAX = 0.32;
const TOPO_INTERVAL = 9.0; // seconds between scaling events
const GRID_STEP = 80;
const PULSE_HZ = 0.35;

type NodeType = "gateway" | "service" | "database" | "cache" | "worker";

// ── Cluster layout (normalized 0-1 canvas coords) ─────────────────────────────
const CLUSTER_DEFS = [
  {
    nx: 0.105,
    ny: 0.4,
    types: ["gateway", "service", "service"] as NodeType[],
  },
  {
    nx: 0.285,
    ny: 0.2,
    types: ["service", "service", "worker", "worker"] as NodeType[],
  },
  {
    nx: 0.51,
    ny: 0.4,
    types: ["service", "service", "service", "worker", "worker"] as NodeType[],
  },
  { nx: 0.72, ny: 0.22, types: ["cache", "cache", "worker"] as NodeType[] },
  {
    nx: 0.855,
    ny: 0.55,
    types: ["database", "database", "service"] as NodeType[],
  },
  {
    nx: 0.475,
    ny: 0.74,
    types: ["service", "worker", "worker", "worker"] as NodeType[],
  },
];

// Inter-cluster connections: [clusterA, localNodeA, clusterB, localNodeB]
const INTER_DEFS: [number, number, number, number][] = [
  [0, 0, 1, 0],
  [0, 0, 2, 0],
  [1, 0, 2, 0],
  [2, 0, 3, 0],
  [2, 0, 4, 0],
  [2, 0, 5, 0],
  [3, 0, 4, 0],
  [4, 0, 5, 0],
  [1, 0, 5, 0],
];

// ── Internal types ────────────────────────────────────────────────────────────
interface TNode {
  cx: number;
  cy: number; // cluster center in canvas px (updated on resize)
  ox: number;
  oy: number; // current offset from center
  tx: number;
  ty: number; // target offset
  driftTimer: number;
  type: NodeType;
  radius: number;
  phase: number;
  load: number; // 0-1 simulated utilisation
  loadTarget: number;
  scale: number; // 0-1 for spawn/despawn animation
  scaleTarget: number;
  color: number;
}

interface TEdge {
  a: number;
  b: number; // node indices
  intra: boolean;
  activity: number; // 0-1 boosted by packet arrivals
  pulsePhase: number;
}

interface TPacket {
  ei: number; // edge index
  t: number; // 0-1 travel progress
  speed: number;
  trail: Array<{ x: number; y: number }>;
  active: boolean;
  color: number;
}

// ── DistributedSystemsScreen ──────────────────────────────────────────────────
export class DistributedSystemsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private topoTimer = 0;
  private spawnTimer = 0;

  private nodes: TNode[] = [];
  private edges: TEdge[] = [];
  private packets: TPacket[] = [];
  private clusterStart: number[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.build();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (!this.nodes?.length) return;
    for (let ci = 0; ci < CLUSTER_DEFS.length; ci++) {
      const { nx, ny } = CLUSTER_DEFS[ci];
      const start = this.clusterStart[ci];
      const count = CLUSTER_DEFS[ci].types.length;
      for (let k = 0; k < count; k++) {
        this.nodes[start + k].cx = nx * w;
        this.nodes[start + k].cy = ny * h;
      }
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.moveNodes(dt);
    this.pulseEdges(dt);
    this.advancePackets(dt);
    this.trySpawn(dt);
    this.topoEvent(dt);
    this.draw();
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  private build(): void {
    this.nodes = [];
    this.edges = [];
    this.packets = [];
    this.clusterStart = [];

    const { w, h } = this;

    for (let ci = 0; ci < CLUSTER_DEFS.length; ci++) {
      const def = CLUSTER_DEFS[ci];
      const cx = def.nx * w;
      const cy = def.ny * h;
      const start = this.nodes.length;
      this.clusterStart.push(start);

      for (let ni = 0; ni < def.types.length; ni++) {
        const type = def.types[ni];
        const base = orbitR(type);
        const angle =
          (ni / def.types.length) * Math.PI * 2 + Math.random() * 0.8;
        const dist = base + Math.random() * 20;
        const ox = Math.cos(angle) * dist;
        const oy = Math.sin(angle) * dist;

        this.nodes.push({
          cx,
          cy,
          ox,
          oy,
          tx: ox,
          ty: oy,
          driftTimer: Math.random() * 5,
          type,
          radius: nodeR(type),
          phase: Math.random() * Math.PI * 2,
          load: 0.2 + Math.random() * 0.5,
          loadTarget: 0.2 + Math.random() * 0.7,
          scale: 1,
          scaleTarget: 1,
          color: CLUSTER_COLORS[ci],
        });
      }

      // Fully connected intra-cluster mesh
      const n = def.types.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          this.edges.push({
            a: start + i,
            b: start + j,
            intra: true,
            activity: Math.random() * 0.4,
            pulsePhase: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    // Inter-cluster edges
    for (const [ca, lai, cb, lbi] of INTER_DEFS) {
      this.edges.push({
        a: this.clusterStart[ca] + lai,
        b: this.clusterStart[cb] + lbi,
        intra: false,
        activity: Math.random() * 0.2,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Packet pool — pre-allocate, no per-frame allocation
    for (let i = 0; i < PACKET_POOL; i++) {
      this.packets.push({
        ei: 0,
        t: 0,
        speed: 0,
        trail: Array.from({ length: TRAIL_LEN }, () => ({ x: 0, y: 0 })),
        active: false,
        color: C_PACKET,
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────
  private moveNodes(dt: number): void {
    for (const n of this.nodes) {
      n.scale += (n.scaleTarget - n.scale) * Math.min(1, dt * 2.2);
      n.load += (n.loadTarget - n.load) * Math.min(1, dt * 0.55);
      n.driftTimer -= dt;

      if (n.driftTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const base = orbitR(n.type);
        n.tx = Math.cos(angle) * (base + Math.random() * 22);
        n.ty = Math.sin(angle) * (base + Math.random() * 22);
        n.driftTimer = 5 + Math.random() * 6;
        n.loadTarget = 0.1 + Math.random() * 0.85;
      }

      n.ox += (n.tx - n.ox) * Math.min(1, dt * 0.3);
      n.oy += (n.ty - n.oy) * Math.min(1, dt * 0.3);
    }
  }

  private pulseEdges(dt: number): void {
    for (const e of this.edges) {
      e.pulsePhase += dt * PULSE_HZ * Math.PI * 2;
      const base = e.intra ? 0.22 : 0.08;
      e.activity += (base - e.activity) * dt * 0.35;
    }
  }

  private pos(i: number): [number, number] {
    const n = this.nodes[i];
    return [n.cx + n.ox, n.cy + n.oy];
  }

  private trySpawn(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);

    const ei = (Math.random() * this.edges.length) | 0;
    const e = this.edges[ei];
    if (this.nodes[e.a].scale < 0.3 || this.nodes[e.b].scale < 0.3) return;

    for (const p of this.packets) {
      if (p.active) continue;
      const [ax, ay] = this.pos(e.a);
      const [bx, by] = this.pos(e.b);
      const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) || 1;
      p.ei = ei;
      p.t = 0;
      p.speed = PACKET_SPEED / dist;
      p.color = this.nodes[e.a].color;
      p.trail.forEach((pt) => {
        pt.x = ax;
        pt.y = ay;
      });
      p.active = true;
      break;
    }
  }

  private advancePackets(dt: number): void {
    for (const p of this.packets) {
      if (!p.active) continue;
      p.t += p.speed * dt;

      if (p.t >= 1) {
        p.active = false;
        this.edges[p.ei].activity = Math.min(
          1,
          this.edges[p.ei].activity + 0.28,
        );
        continue;
      }

      const e = this.edges[p.ei];
      const [ax, ay] = this.pos(e.a);
      const [bx, by] = this.pos(e.b);
      const px = ax + (bx - ax) * p.t;
      const py = ay + (by - ay) * p.t;

      for (let i = TRAIL_LEN - 1; i > 0; i--) {
        p.trail[i].x = p.trail[i - 1].x;
        p.trail[i].y = p.trail[i - 1].y;
      }
      p.trail[0].x = px;
      p.trail[0].y = py;
    }
  }

  private topoEvent(dt: number): void {
    this.topoTimer -= dt;
    if (this.topoTimer > 0) return;
    this.topoTimer = TOPO_INTERVAL + Math.random() * 5;

    const workers = this.nodes.filter((n) => n.type === "worker");
    if (!workers.length) return;
    const n = workers[(Math.random() * workers.length) | 0];
    n.scaleTarget = n.scaleTarget > 0.5 ? 0 : 1;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  private draw(): void {
    const { w, h, time: t, gfx: g } = this;
    g.clear();

    // Background
    g.rect(0, 0, w, h).fill({ color: BG });

    // Grid
    for (let x = 0; x <= w; x += GRID_STEP)
      g.moveTo(x, 0)
        .lineTo(x, h)
        .stroke({ color: C_GRID, alpha: 0.55, width: 0.5 });
    for (let y = 0; y <= h; y += GRID_STEP)
      g.moveTo(0, y)
        .lineTo(w, y)
        .stroke({ color: C_GRID, alpha: 0.55, width: 0.5 });

    // Cluster halos
    for (let ci = 0; ci < CLUSTER_DEFS.length; ci++) {
      const { nx, ny } = CLUSTER_DEFS[ci];
      const cx = nx * w;
      const cy = ny * h;
      const r = 85 + Math.sin(t * 0.22 + ci * 1.1) * 7;
      g.circle(cx, cy, r).fill({ color: CLUSTER_COLORS[ci], alpha: 0.028 });
      g.circle(cx, cy, r * 0.45).fill({
        color: CLUSTER_COLORS[ci],
        alpha: 0.04,
      });
    }

    // Edges
    for (const e of this.edges) {
      const sMin = Math.min(this.nodes[e.a].scale, this.nodes[e.b].scale);
      if (sMin < 0.05) continue;

      const [ax, ay] = this.pos(e.a);
      const [bx, by] = this.pos(e.b);
      const pulse = 0.5 + Math.sin(e.pulsePhase) * 0.5;

      if (e.intra) {
        const alpha = (0.14 + e.activity * 0.48 * pulse) * sMin;
        g.moveTo(ax, ay)
          .lineTo(bx, by)
          .stroke({
            color: e.activity > 0.55 ? C_CONN_HOT : C_CONN_ACT,
            alpha,
            width: 0.7 + e.activity,
          });
      } else {
        const alpha = (0.055 + e.activity * 0.22 * pulse) * sMin;
        g.moveTo(ax, ay)
          .lineTo(bx, by)
          .stroke({
            color: e.activity > 0.4 ? C_CONN_HOT : C_CONN_ACT,
            alpha,
            width: 0.5 + e.activity * 0.5,
          });
      }
    }

    // Packets + trails
    for (const p of this.packets) {
      if (!p.active) continue;
      for (let i = TRAIL_LEN - 1; i >= 1; i--) {
        const frac = 1 - i / TRAIL_LEN;
        const r = frac * 1.8;
        if (r > 0.2)
          g.circle(p.trail[i].x, p.trail[i].y, r).fill({
            color: p.color,
            alpha: frac * 0.4,
          });
      }
      const hd = p.trail[0];
      g.circle(hd.x, hd.y, 6.5).fill({ color: p.color, alpha: 0.09 });
      g.circle(hd.x, hd.y, 2.8).fill({ color: p.color, alpha: 0.68 });
      g.circle(hd.x, hd.y, 1.1).fill({ color: 0xffffff, alpha: 0.94 });
    }

    // Nodes
    for (const n of this.nodes) {
      if (n.scale < 0.02) continue;
      const x = n.cx + n.ox;
      const y = n.cy + n.oy;
      const s = n.scale;
      const r = n.radius * s;
      const pulse =
        0.72 + Math.sin(t * PULSE_HZ * Math.PI * 2 + n.phase) * 0.28;

      // Glow halos
      g.circle(x, y, r * 5.5 * pulse).fill({
        color: n.color,
        alpha: 0.035 * s,
      });
      g.circle(x, y, r * 2.8).fill({ color: n.color, alpha: 0.07 * s });

      // Load ring (skipped for tiny workers)
      if (n.type !== "worker" && s > 0.4) {
        g.circle(x, y, r * 2.4).stroke({
          color: n.color,
          alpha: (0.1 + n.load * 0.3) * s,
          width: 0.8,
        });
      }

      // Core body + highlight
      g.circle(x, y, r).fill({ color: n.color, alpha: 0.72 });
      g.circle(x, y, r * 0.42).fill({ color: 0xffffff, alpha: 0.55 });

      // Gateway / database: slow pulsing outer ring
      if (n.type === "gateway" || n.type === "database") {
        const outerR = r * 1.7 + Math.sin(t * 1.0 + n.phase) * 1.4;
        g.circle(x, y, outerR).stroke({
          color: n.color,
          alpha: 0.2 * s,
          width: 0.7,
        });
      }

      // Topology animation ring (scales up while node spawns, expands while despawning)
      const delta = Math.abs(n.scaleTarget - n.scale);
      if (delta > 0.05) {
        const animR = r + n.radius * 2 * (1 - n.scale + 0.1);
        g.circle(x, y, animR).stroke({
          color: n.color,
          alpha: delta * 0.6,
          width: 0.9,
        });
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function nodeR(type: NodeType): number {
  switch (type) {
    case "gateway":
      return 9;
    case "database":
      return 8;
    case "cache":
      return 6;
    case "service":
      return 5;
    case "worker":
      return 3.5;
  }
}

function orbitR(type: NodeType): number {
  switch (type) {
    case "gateway":
      return 0;
    case "database":
      return 28;
    case "cache":
      return 32;
    case "service":
      return 42;
    case "worker":
      return 52;
  }
}
