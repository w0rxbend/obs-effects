import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const N_NODES = 58;
const CONNECT_DIST_FRAC = 0.27;
const MAX_CONN = 4;

const C_BG = 0x000000;
const C_WHITE = 0xffffff;
const C_CYAN = 0x00e5ff;

// Accent fraction and triangle/polygon decoration counts
const ACCENT_CHANCE = 0.18;
const N_POLY = 6; // floating polygon outlines

interface Node {
  ox: number; // orbit center (fraction)
  oy: number;
  rx: number; // orbit radius (fraction of w/h)
  ry: number;
  phaseX: number;
  phaseY: number;
  freqX: number;
  freqY: number;
  accent: boolean;
}

interface Poly {
  ox: number;
  oy: number;
  rx: number;
  ry: number;
  sides: number;
  rot0: number;
  rotSpeed: number;
  phaseX: number;
  phaseY: number;
  freqX: number;
  freqY: number;
  accent: boolean;
}

export class GeometricLinesScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly nodes: Node[] = [];
  private readonly polys: Poly[] = [];
  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.initNodes();
    this.initPolys();
  }

  private initNodes(): void {
    for (let i = 0; i < N_NODES; i++) {
      const ox = 0.05 + Math.random() * 0.9;
      const oy = 0.05 + Math.random() * 0.9;
      this.nodes.push({
        ox,
        oy,
        rx: 0.03 + Math.random() * 0.1,
        ry: 0.03 + Math.random() * 0.08,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        freqX: 0.02 + Math.random() * 0.055,
        freqY: 0.02 + Math.random() * 0.055,
        accent: Math.random() < ACCENT_CHANCE,
      });
    }
  }

  private initPolys(): void {
    for (let i = 0; i < N_POLY; i++) {
      this.polys.push({
        ox: 0.1 + Math.random() * 0.8,
        oy: 0.1 + Math.random() * 0.8,
        rx: 0.05 + Math.random() * 0.08,
        ry: 0.04 + Math.random() * 0.06,
        sides: Math.random() < 0.5 ? 5 : 6,
        rot0: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.018,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        freqX: 0.012 + Math.random() * 0.025,
        freqY: 0.012 + Math.random() * 0.025,
        accent: Math.random() < 0.4,
      });
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.draw();
  }

  private draw(): void {
    const { gfx, nodes, polys, w, h, time } = this;
    gfx.clear();

    gfx.rect(0, 0, w, h).fill({ color: C_BG });

    const diag = Math.sqrt(w * w + h * h);
    const connectDist = diag * CONNECT_DIST_FRAC;

    // Resolve node positions
    const pts: { x: number; y: number; accent: boolean }[] = nodes.map((n) => ({
      x: (n.ox + Math.sin(time * n.freqX + n.phaseX) * n.rx) * w,
      y: (n.oy + Math.cos(time * n.freqY + n.phaseY) * n.ry) * h,
      accent: n.accent,
    }));

    // Build connection graph
    const connSet = new Set<string>();
    const edges: [number, number][] = [];
    const adj = new Map<number, Set<number>>();

    for (let i = 0; i < pts.length; i++) {
      const dists: { j: number; d: number }[] = [];
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < connectDist) dists.push({ j, d });
      }
      dists.sort((a, b) => a.d - b.d);
      for (let k = 0; k < Math.min(dists.length, MAX_CONN); k++) {
        const key = `${i}-${dists[k].j}`;
        if (!connSet.has(key)) {
          connSet.add(key);
          edges.push([i, dists[k].j]);
          if (!adj.has(i)) adj.set(i, new Set());
          if (!adj.has(dists[k].j)) adj.set(dists[k].j, new Set());
          adj.get(i)!.add(dists[k].j);
          adj.get(dists[k].j)!.add(i);
        }
      }
    }

    // Draw filled triangles
    for (let i = 0; i < pts.length; i++) {
      const ni = adj.get(i);
      if (!ni) continue;
      const nbrs = [...ni];
      for (let ai = 0; ai < nbrs.length; ai++) {
        const a = nbrs[ai];
        if (a <= i) continue;
        const na = adj.get(a);
        if (!na) continue;
        for (let bi = ai + 1; bi < nbrs.length; bi++) {
          const b = nbrs[bi];
          if (b <= a || !na.has(b)) continue;
          const isAccent = pts[i].accent || pts[a].accent || pts[b].accent;
          gfx
            .poly([pts[i].x, pts[i].y, pts[a].x, pts[a].y, pts[b].x, pts[b].y])
            .fill({ color: isAccent ? C_CYAN : C_WHITE, alpha: 0.022 });
        }
      }
    }

    // Draw edges
    for (const [i, j] of edges) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const alpha = (1 - d / connectDist) * 0.38;
      const isAccent = pts[i].accent || pts[j].accent;
      gfx
        .moveTo(pts[i].x, pts[i].y)
        .lineTo(pts[j].x, pts[j].y)
        .stroke({ color: isAccent ? C_CYAN : C_WHITE, alpha, width: 0.6 });
    }

    // Draw nodes
    for (const pt of pts) {
      const r = pt.accent ? 2.8 : 1.6;
      const alpha = pt.accent ? 0.72 : 0.42;
      gfx
        .circle(pt.x, pt.y, r)
        .fill({ color: pt.accent ? C_CYAN : C_WHITE, alpha });
    }

    // Draw floating polygon outlines
    for (const p of polys) {
      const cx = (p.ox + Math.sin(time * p.freqX + p.phaseX) * p.rx) * w;
      const cy = (p.oy + Math.cos(time * p.freqY + p.phaseY) * p.ry) * h;
      const rot = p.rot0 + time * p.rotSpeed;
      const rw = p.rx * w * 0.65;
      const rh = p.ry * h * 0.65;
      const verts: number[] = [];
      for (let k = 0; k < p.sides; k++) {
        const a = rot + (k / p.sides) * Math.PI * 2;
        verts.push(cx + Math.cos(a) * rw, cy + Math.sin(a) * rh);
      }
      const color = p.accent ? C_CYAN : C_WHITE;
      gfx.poly(verts).stroke({ color, alpha: 0.12, width: 0.7 });
    }
  }
}
