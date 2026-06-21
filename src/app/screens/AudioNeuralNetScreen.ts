import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG = 0x030810;
const C_HUB = 0xbb44ff;
const C_MID = 0x22ddcc;
const C_PERF = 0x1177bb;
const C_SIGNAL = 0x44ccff;
const C_SIGNAL_HOT = 0xffffff;
const C_EDGE_Q = 0x0a1828;
const C_EDGE_A = 0x1155aa;
const C_MEMORY = 0x7722cc;

// ─── Config ───────────────────────────────────────────────────────────────────
const N_HUB = 10;
const N_MID = 60;
const N_PERF = 90;
const PULSE_POOL = 280;
const DECAY_ACT = 1.0;
const DECAY_MEM = 0.15;
const DECAY_EDGE = 0.55;
const FIRE_CD = 0.28;
const FIRE_TH = 0.4;
const SIG_SPEED = 290;
const R_HUB = 95;
const R_MID_LO = 230;
const R_MID_HI = 370;
const R_PERF_LO = 380;
const R_PERF_HI = 510;
const D_HH = 200;
const D_HM = 320;
const D_MM = 250;
const D_MP = 210;
const D_PP = 175;
const MAX_ADJ = 8;

// ─── Types ────────────────────────────────────────────────────────────────────
interface NNode {
  x: number;
  y: number;
  layer: 0 | 1 | 2;
  activation: number;
  memory: number;
  phase: number;
  fireTimer: number;
  adjEdges: number[];
}

interface NEdge {
  a: number;
  b: number;
  weight: number;
  activity: number;
}

interface Pulse {
  a: number;
  b: number;
  edgeIdx: number;
  t: number;
  speed: number;
  strength: number;
  hot: boolean;
  active: boolean;
}

// ─── AudioNeuralNetScreen ─────────────────────────────────────────────────────
export class AudioNeuralNetScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private nodes: NNode[] = [];
  private edges: NEdge[] = [];
  private readonly pulses: Pulse[] = [];

  private autoTimer = 0;
  private waveTimer = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    for (let i = 0; i < PULSE_POOL; i++) {
      this.pulses.push({
        a: 0,
        b: 0,
        edgeIdx: 0,
        t: 0,
        speed: 1,
        strength: 0,
        hot: false,
        active: false,
      });
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.buildGraph();
    void obsAudio.connect();
    // Seed initial hub activity so the network is live immediately
    for (let i = 0; i < 4; i++) {
      const idx = Math.floor(Math.random() * N_HUB);
      this.nodes[idx].activation = 0.5 + Math.random() * 0.4;
    }
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.buildGraph();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    obsAudio.update(dt);
    this.updateNodes(dt);
    this.updatePulses(dt);
    this.updateEdges(dt);
    this.injectAudio(dt);
    this.draw();
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  private buildGraph(): void {
    this.nodes = [];
    this.edges = [];
    for (const p of this.pulses) p.active = false;

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;

    // Hub cluster at center
    for (let i = 0; i < N_HUB; i++) {
      const a = (i / N_HUB) * Math.PI * 2;
      const r = R_HUB * Math.sqrt(Math.random());
      this.nodes.push({
        x: cx + Math.cos(a) * r + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(a) * r + (Math.random() - 0.5) * 30,
        layer: 0,
        activation: 0,
        memory: 0,
        phase: i * ((Math.PI * 2) / N_HUB),
        fireTimer: 0,
        adjEdges: [],
      });
    }

    // Five mid-layer clusters at medium radius
    for (let c = 0; c < 5; c++) {
      const ba = (c / 5) * Math.PI * 2 + Math.random() * 0.3;
      const cr = R_MID_LO + Math.random() * (R_MID_HI - R_MID_LO);
      const clx = cx + Math.cos(ba) * cr;
      const cly = cy + Math.sin(ba) * cr;
      for (let i = 0; i < N_MID / 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 85;
        this.nodes.push({
          x: clx + Math.cos(a) * r,
          y: cly + Math.sin(a) * r,
          layer: 1,
          activation: 0,
          memory: 0,
          phase: Math.random() * Math.PI * 2,
          fireTimer: Math.random() * FIRE_CD,
          adjEdges: [],
        });
      }
    }

    // Peripheral scatter at outer ring
    for (let i = 0; i < N_PERF; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R_PERF_LO + Math.random() * (R_PERF_HI - R_PERF_LO);
      this.nodes.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        layer: 2,
        activation: 0,
        memory: 0,
        phase: Math.random() * Math.PI * 2,
        fireTimer: Math.random() * FIRE_CD,
        adjEdges: [],
      });
    }

    // Build edges via proximity thresholds per layer pair
    const adjCount = new Uint8Array(this.nodes.length);
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (adjCount[i] >= MAX_ADJ || adjCount[j] >= MAX_ADJ) continue;
        const ni = this.nodes[i];
        const nj = this.nodes[j];
        const dx = ni.x - nj.x;
        const dy = ni.y - nj.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const li = ni.layer;
        const lj = nj.layer;
        let thr = 0;
        if (li === 0 && lj === 0) thr = D_HH;
        else if ((li === 0 && lj === 1) || (li === 1 && lj === 0)) thr = D_HM;
        else if (li === 1 && lj === 1) thr = D_MM;
        else if ((li === 1 && lj === 2) || (li === 2 && lj === 1)) thr = D_MP;
        else if (li === 2 && lj === 2) thr = D_PP;
        if (thr > 0 && d < thr) {
          const ei = this.edges.length;
          this.edges.push({
            a: i,
            b: j,
            weight: 0.3 + Math.random() * 0.7,
            activity: 0,
          });
          ni.adjEdges.push(ei);
          nj.adjEdges.push(ei);
          adjCount[i]++;
          adjCount[j]++;
        }
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  private updateNodes(dt: number): void {
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      n.fireTimer = Math.max(0, n.fireTimer - dt);
      n.activation = Math.max(0, n.activation - DECAY_ACT * dt);
      n.memory = Math.max(0, n.memory - DECAY_MEM * dt);

      if (n.activation >= FIRE_TH && n.fireTimer <= 0) {
        n.fireTimer = FIRE_CD;
        n.memory = Math.min(1, n.memory + 0.22);
        // Overclock triples branching; 28% chance of double-fire normally
        const branches =
          1 + (obsAudio.overclock ? 2 : Math.random() < 0.28 ? 1 : 0);
        for (let b = 0; b < branches; b++)
          this.firePulse(i, obsAudio.overclock);
      }
    }
  }

  private updatePulses(dt: number): void {
    for (const p of this.pulses) {
      if (!p.active) continue;
      p.t += p.speed * dt;
      if (p.t >= 1) {
        p.active = false;
        const e = this.edges[p.edgeIdx];
        // Hebbian strengthening: active edges grow in weight
        e.activity = Math.min(1, e.activity + 0.55);
        e.weight = Math.min(1, e.weight + 0.018);
        this.nodes[p.b].activation = Math.min(
          1,
          this.nodes[p.b].activation + p.strength * 0.62,
        );
      }
    }
  }

  private updateEdges(dt: number): void {
    for (const e of this.edges) {
      e.activity = Math.max(0, e.activity - DECAY_EDGE * dt);
      // Synaptic pruning: unused edges lose strength
      if (e.activity < 0.01) e.weight = Math.max(0.1, e.weight - 0.004 * dt);
    }
  }

  private injectAudio(dt: number): void {
    // Autonomous idle signal: keeps network alive even in silence
    this.autoTimer += dt;
    const autoPeriod = 0.7 / Math.max(0.1, obsAudio.level * 3 + 0.15);
    if (this.autoTimer >= autoPeriod) {
      this.autoTimer = 0;
      const idx = Math.floor(Math.random() * N_HUB);
      this.nodes[idx].activation = Math.min(
        1,
        this.nodes[idx].activation + 0.25,
      );
    }

    // Vocals → hub cluster excitation
    if (obsAudio.vocal > 0.12) {
      for (let i = 0; i < N_HUB; i++) {
        this.nodes[i].activation = Math.min(
          1,
          this.nodes[i].activation + obsAudio.vocal * 0.9 * dt * 5,
        );
      }
    }

    // Percussion beat → burst from random hub
    if (obsAudio.beat) {
      const idx = Math.floor(Math.random() * N_HUB);
      this.nodes[idx].activation = Math.min(
        1,
        this.nodes[idx].activation + 0.85,
      );
      this.nodes[idx].memory = Math.min(1, this.nodes[idx].memory + 0.45);
    }

    // Harmonics → radial wave propagation through mid-layer
    this.waveTimer += dt;
    const wavePeriod = 0.4 / Math.max(0.08, obsAudio.harm * 4);
    if (obsAudio.harm > 0.1 && this.waveTimer >= wavePeriod) {
      this.waveTimer = 0;
      const cx = this.w * 0.5;
      const cy = this.h * 0.5;
      const phase = this.time * 2.2;
      for (let i = N_HUB; i < N_HUB + N_MID; i++) {
        const n = this.nodes[i];
        const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
        const wv = Math.sin(phase - d * 0.018) * 0.5 + 0.5;
        if (wv > 0.65) {
          n.activation = Math.min(1, n.activation + obsAudio.harm * 0.7);
        }
      }
    }

    // Intensity → peripheral activity density
    if (obsAudio.level > 0.22) {
      const perifStart = N_HUB + N_MID;
      const count = Math.floor(obsAudio.level * 10 * dt * 5);
      for (let k = 0; k < count; k++) {
        const i = perifStart + Math.floor(Math.random() * N_PERF);
        this.nodes[i].activation = Math.min(1, this.nodes[i].activation + 0.18);
      }
    }
  }

  private firePulse(nodeIdx: number, hot: boolean): void {
    const n = this.nodes[nodeIdx];
    if (n.adjEdges.length === 0) return;
    // Weighted random edge selection (higher weight = preferred routing)
    let total = 0;
    for (const ei of n.adjEdges) total += this.edges[ei].weight;
    if (total === 0) return;
    let pick = Math.random() * total;
    for (const ei of n.adjEdges) {
      const e = this.edges[ei];
      pick -= e.weight;
      if (pick <= 0) {
        const dest = e.a === nodeIdx ? e.b : e.a;
        const na = this.nodes[nodeIdx];
        const nb = this.nodes[dest];
        const d = Math.sqrt((nb.x - na.x) ** 2 + (nb.y - na.y) ** 2) || 1;
        for (const p of this.pulses) {
          if (p.active) continue;
          p.a = nodeIdx;
          p.b = dest;
          p.edgeIdx = ei;
          p.t = 0;
          p.speed = (SIG_SPEED * e.weight) / d;
          p.strength = 0.38 + Math.random() * 0.38;
          p.hot = hot;
          p.active = true;
          return;
        }
        return;
      }
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  private draw(): void {
    const { w, h, time } = this;
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, w, h).fill({ color: BG });

    // Overclock: deep-violet tint floods the background
    if (obsAudio.overclock) {
      g.rect(0, 0, w, h).fill({ color: 0x220044, alpha: 0.14 });
    }

    // Central hub aggregate glow
    let hubAct = 0;
    for (let i = 0; i < N_HUB; i++) hubAct += this.nodes[i].activation;
    hubAct /= N_HUB;
    if (hubAct > 0.04) {
      const cx = w * 0.5;
      const cy = h * 0.5;
      g.circle(cx, cy, 220).fill({ color: C_HUB, alpha: hubAct * 0.06 });
      g.circle(cx, cy, 110).fill({ color: C_HUB, alpha: hubAct * 0.1 });
      g.circle(cx, cy, 55).fill({ color: 0xffffff, alpha: hubAct * 0.04 });
    }

    // Edges — faint topology always visible, brighten on activity
    for (const e of this.edges) {
      const na = this.nodes[e.a];
      const nb = this.nodes[e.b];
      const memBoost = (na.memory + nb.memory) * 0.04;
      const alpha = Math.min(0.82, 0.035 + e.activity * 0.65 + memBoost);
      const col = e.activity > 0.12 ? C_EDGE_A : C_EDGE_Q;
      const width = 0.25 + e.weight * 0.55 + e.activity * 1.6;
      g.moveTo(na.x, na.y)
        .lineTo(nb.x, nb.y)
        .stroke({ color: col, alpha, width });
    }

    // Signal pulses traversing edges
    for (const p of this.pulses) {
      if (!p.active) continue;
      const na = this.nodes[p.a];
      const nb = this.nodes[p.b];
      const x = na.x + (nb.x - na.x) * p.t;
      const y = na.y + (nb.y - na.y) * p.t;
      const col = p.hot ? C_SIGNAL_HOT : C_SIGNAL;
      const r = p.hot ? 3.8 : 2.6;
      g.circle(x, y, r * 5.0).fill({ color: col, alpha: 0.07 });
      g.circle(x, y, r * 2.2).fill({ color: col, alpha: 0.22 });
      g.circle(x, y, r).fill({ color: col, alpha: 0.88 });
      g.circle(x, y, r * 0.35).fill({ color: 0xffffff, alpha: 1 });
    }

    // Nodes
    for (const n of this.nodes) {
      const a = n.activation;
      const m = n.memory;
      const baseColor = n.layer === 0 ? C_HUB : n.layer === 1 ? C_MID : C_PERF;
      const baseR = n.layer === 0 ? 5 : n.layer === 1 ? 3.5 : 2.2;
      const coreR = baseR + a * 5;
      const pulse = 0.72 + Math.sin(time * 2.0 + n.phase) * 0.28;

      // Memory halo: slower-decaying purple cloud
      if (m > 0.04) {
        g.circle(n.x, n.y, coreR * 6).fill({
          color: C_MEMORY,
          alpha: m * 0.07,
        });
      }

      // Activation glow layers
      if (a > 0.05) {
        g.circle(n.x, n.y, coreR * 4.5).fill({
          color: baseColor,
          alpha: a * 0.1 * pulse,
        });
        g.circle(n.x, n.y, coreR * 2.5).fill({
          color: baseColor,
          alpha: a * 0.22 * pulse,
        });
      }

      // Core body — always slightly visible to show topology
      g.circle(n.x, n.y, coreR).fill({
        color: baseColor,
        alpha: Math.min(1, 0.18 + a * 0.82),
      });

      // Bright center pinpoint
      g.circle(n.x, n.y, Math.max(0.6, coreR * 0.32)).fill({
        color: 0xffffff,
        alpha: Math.min(1, 0.08 + a * 0.92),
      });

      // Overclock ring — electric white pulse ring on active nodes
      if (obsAudio.overclock && a > 0.15) {
        g.circle(n.x, n.y, coreR + 10).stroke({
          color: 0xffffff,
          alpha: a * 0.38,
          width: 0.7,
        });
      }
    }
  }
}
