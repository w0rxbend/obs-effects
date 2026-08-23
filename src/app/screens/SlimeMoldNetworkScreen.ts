import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { randRange as rnd, TAU } from "../../lib/math";

const C_BG = 0x010905;
const C_NODE_HOT = 0x44ffaa;

const C_EDGE_MID = 0x008855;
const C_EDGE_HOT = 0x33ff88;
const C_PACKET = 0xaaffcc;

const SEED_COUNT = 5;
const MAX_NODES = 180;
const MAX_EDGES = 480;
const CONNECT_RADIUS_FRAC = 0.18; // fraction of screen diagonal
const GROW_INTERVAL = 0.55; // seconds between node spawns
const PACKET_SPEED_MIN = 0.22;
const PACKET_SPEED_MAX = 0.55;
const PACKET_SPAWN_INTERVAL = 0.12;
const ACTIVATION_DECAY = 0.18; // per second
const MAX_ACTIVATION = 3.0;

interface SNode {
  x: number; // screen fraction
  y: number;
  activation: number;
  age: number;
}

interface SEdge {
  a: number; // node index
  b: number;
  flow: number; // accumulated packet traffic [0..MAX_ACTIVATION]
  age: number;
  length: number; // pixel length, computed at draw time
}

interface Packet {
  edge: number; // edge index
  t: number; // 0..1 progress
  dir: 1 | -1; // +1 from a→b, -1 from b→a
  speed: number;
}

export class SlimeMoldNetworkScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private nodes: SNode[] = [];
  private edges: SEdge[] = [];
  private packets: Packet[] = [];
  private w = 1920;
  private h = 1080;
  private t = 0;
  private growTimer = 0;
  private packetTimer = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  private init(): void {
    this.nodes = [];
    this.edges = [];
    this.packets = [];
    this.t = 0;
    this.growTimer = 0;
    this.packetTimer = 0;

    for (let i = 0; i < SEED_COUNT; i++) {
      this.nodes.push({
        x: rnd(0.2, 0.8),
        y: rnd(0.2, 0.8),
        activation: 1,
        age: 0,
      });
    }
    // Initial connections between seeds
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (this.edges.length < MAX_EDGES) this.tryConnect(i, j);
      }
    }
  }

  private tryConnect(a: number, b: number): boolean {
    const { nodes, w, h } = this;
    const diag = Math.sqrt(w * w + h * h);
    const dx = (nodes[a].x - nodes[b].x) * w;
    const dy = (nodes[a].y - nodes[b].y) * h;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > CONNECT_RADIUS_FRAC * diag) return false;
    // Check not already connected
    if (
      this.edges.some(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
      )
    )
      return false;
    this.edges.push({ a, b, flow: 0, age: 0, length: dist });
    return true;
  }

  private grow(): void {
    if (this.nodes.length >= MAX_NODES) return;

    // Pick a random existing node to branch from
    const parentIdx = Math.floor(Math.random() * this.nodes.length);
    const parent = this.nodes[parentIdx];

    // Grow in a random direction, biased toward less-dense areas
    const angle = rnd(0, TAU);
    const dist = rnd(0.04, 0.12);
    const nx = Math.max(
      0.02,
      Math.min(0.98, parent.x + Math.cos(angle) * dist),
    );
    const ny = Math.max(
      0.02,
      Math.min(0.98, parent.y + Math.sin(angle) * dist),
    );

    const newIdx = this.nodes.length;
    this.nodes.push({ x: nx, y: ny, activation: 0, age: 0 });

    // Connect to parent and nearby nodes
    if (this.edges.length < MAX_EDGES) this.tryConnect(parentIdx, newIdx);
    for (
      let i = 0;
      i < this.nodes.length - 1 && this.edges.length < MAX_EDGES;
      i++
    ) {
      if (Math.random() < 0.3) this.tryConnect(i, newIdx);
    }
  }

  private spawnPacket(): void {
    if (this.edges.length === 0) return;

    // Prefer high-activation nodes as sources
    const srcIdx =
      Math.random() < 0.6
        ? this.nodes.reduce(
            (best, n, i) =>
              n.activation > this.nodes[best].activation ? i : best,
            0,
          )
        : Math.floor(Math.random() * this.nodes.length);

    // Find edges from this node
    const candidates = this.edges
      .map((e, i) => ({ i, e }))
      .filter(({ e }) => e.a === srcIdx || e.b === srcIdx);

    if (candidates.length === 0) return;

    const { i: eIdx, e } =
      candidates[Math.floor(Math.random() * candidates.length)];
    const dir = e.a === srcIdx ? 1 : -1;

    this.packets.push({
      edge: eIdx,
      t: dir === 1 ? 0 : 1,
      dir: dir as 1 | -1,
      speed: rnd(PACKET_SPEED_MIN, PACKET_SPEED_MAX),
    });
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.t += dt;

    // Growth
    this.growTimer += dt;
    if (this.growTimer > GROW_INTERVAL) {
      this.grow();
      this.growTimer = 0;
    }

    // Packet spawning
    this.packetTimer += dt;
    if (this.packetTimer > PACKET_SPAWN_INTERVAL) {
      this.spawnPacket();
      this.packetTimer = 0;
    }

    // Move packets
    for (const p of this.packets) {
      p.t += p.dir * p.speed * dt;
      const e = this.edges[p.edge];
      if (e) {
        e.flow = Math.min(MAX_ACTIVATION, e.flow + 1.5 * dt);
        // Activate destination node when packet arrives
        const dstIdx = p.dir === 1 ? e.b : e.a;
        if (this.nodes[dstIdx]) {
          this.nodes[dstIdx].activation = Math.min(
            MAX_ACTIVATION,
            this.nodes[dstIdx].activation + 0.8,
          );
        }
      }
    }

    // Remove arrived packets
    this.packets = this.packets.filter((p) => p.t >= 0 && p.t <= 1);

    // Decay
    for (const e of this.edges) {
      e.flow = Math.max(0, e.flow - ACTIVATION_DECAY * dt);
      e.age += dt;
    }
    for (const n of this.nodes) {
      n.activation = Math.max(0, n.activation - 0.8 * dt);
      n.age += dt;
    }

    this.draw();
  }

  private draw(): void {
    const { gfx, nodes, edges, packets, w, h, t } = this;
    gfx.clear();
    gfx.rect(0, 0, w, h).fill({ color: C_BG });

    // Subtle organic background noise (a few dim radial blobs)
    for (let i = 0; i < 4; i++) {
      const bx = (0.2 + i * 0.2) * w;
      const by = (0.3 + Math.sin(t * 0.04 + i * 1.3) * 0.2) * h;
      gfx.circle(bx, by, 180 + i * 40).fill({ color: 0x002210, alpha: 0.06 });
    }

    // Edges
    for (const e of edges) {
      const na = nodes[e.a];
      const nb = nodes[e.b];
      if (!na || !nb) continue;

      const x0 = na.x * w;
      const y0 = na.y * h;
      const x1 = nb.x * w;
      const y1 = nb.y * h;
      const fadeIn = Math.min(1, e.age / 1.5);
      const flow01 = Math.min(1, e.flow / MAX_ACTIVATION);
      const baseAlpha = (0.12 + 0.55 * flow01) * fadeIn;

      if (flow01 > 0.05) {
        // Glow layers for active veins
        gfx
          .moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({
            color: C_EDGE_MID,
            alpha: 0.05 * flow01 * fadeIn,
            width: 8,
          });
        gfx
          .moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({
            color: C_EDGE_HOT,
            alpha: 0.12 * flow01 * fadeIn,
            width: 3,
          });
      }
      gfx
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: C_EDGE_HOT, alpha: baseAlpha, width: 0.8 });
    }

    // Packets as glowing dots traveling along edges
    for (const p of packets) {
      const e = edges[p.edge];
      if (!e) continue;
      const na = nodes[e.a];
      const nb = nodes[e.b];
      if (!na || !nb) continue;

      const px = na.x * w + (nb.x - na.x) * w * p.t;
      const py = na.y * h + (nb.y - na.y) * h * p.t;

      gfx.circle(px, py, 7).fill({ color: C_EDGE_HOT, alpha: 0.08 });
      gfx.circle(px, py, 3).fill({ color: C_PACKET, alpha: 0.35 });
      gfx.circle(px, py, 1.2).fill({ color: 0xeeffee, alpha: 0.9 });
    }

    // Nodes
    for (const n of nodes) {
      if (!n) continue;
      const nx = n.x * w;
      const ny = n.y * h;
      const fadeIn = Math.min(1, n.age / 1.2);
      const act = Math.min(1, n.activation / MAX_ACTIVATION);
      const pulse = 0.8 + 0.2 * Math.sin(t * 2.2 + nx * 0.01);

      if (act > 0.1) {
        gfx
          .circle(nx, ny, 12 * act * pulse)
          .fill({ color: C_NODE_HOT, alpha: 0.06 * act * fadeIn });
        gfx
          .circle(nx, ny, 5 * act)
          .fill({ color: C_NODE_HOT, alpha: 0.18 * act * fadeIn });
      }
      gfx.circle(nx, ny, 1.8 + act * 2).fill({
        color: C_NODE_HOT,
        alpha: (0.25 + 0.55 * act) * fadeIn * pulse,
      });
    }
  }
}
