import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CRUST = 0x11111b;
const MANTLE = 0x181825;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const OVERLAY1 = 0x7f849c;
const OVERLAY2 = 0x9399b2;
const SUBTEXT0 = 0xa6adc8;
const TEXT_W = 0xcdd6f4;
const LAVENDER = 0xb4befe;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const MAUVE = 0xcba6f7;
const PINK = 0xf5c2e7;

// ── Math helpers ──────────────────────────────────────────────────────────────
function gauss(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SIGMA_MIN = -3.5;
const SIGMA_MAX = 3.5;
const SIGMA_RANGE = 7.0;
const DENS_MAX = 0.44;
const FLOW_COUNT = 14;
const LOOP_SEC = 16;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Vertex {
  sigma: number;
  baseX: number;
  baseY: number;
  px: number; // shimmer phase X
  py: number; // shimmer phase Y
  sx: number; // shimmer amplitude X
  sy: number; // shimmer amplitude Y
  a: number; // base alpha
  r: number; // dot radius
}

interface Edge {
  a: number;
  b: number;
  ea: number; // edge alpha
  ew: number; // edge width
}

interface FlowParticle {
  dir: 1 | -1; // +1 = from right tail, -1 = from left tail
  phase: number; // 0 = at tail, 1 = at centre
  speed: number;
}

export class GaussianDistributionBgScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gridGfx = new Graphics();
  private readonly axesGfx = new Graphics();
  private readonly lblRoot = new Container();
  private readonly fillGfx = new Graphics();
  private readonly curveGfx = new Graphics();
  private readonly meshGfx = new Graphics();
  private readonly flowGfx = new Graphics();
  private readonly pulsGfx = new Graphics();

  private time = 0;
  private w = 1920;
  private h = 1080;

  // Plot bounds (recomputed in layout())
  private pL = 0;
  private pR = 0;
  private pT = 0;
  private pB = 0;
  private pW = 0;
  private pH = 0;

  private verts: Vertex[] = [];
  private edges: Edge[] = [];
  private flows: FlowParticle[] = [];

  constructor() {
    super();
    this.addChild(this.gridGfx);
    this.addChild(this.axesGfx);
    this.addChild(this.lblRoot);
    this.addChild(this.fillGfx);
    this.addChild(this.curveGfx);
    this.addChild(this.meshGfx);
    this.addChild(this.flowGfx);
    this.addChild(this.pulsGfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.layout();
    this.buildGrid();
    this.buildAxes();
    this.buildFill();
    this.buildMesh();
    this.buildFlows();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.layout();
    this.buildGrid();
    this.buildAxes();
    this.buildFill();
    this.buildMesh();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    // Subtle grid parallax — translate the pre-drawn grid slightly each frame
    this.gridGfx.x = Math.sin(this.time * 0.03) * 9;
    this.gridGfx.y = Math.cos(this.time * 0.025) * 6;

    for (const p of this.flows) {
      p.phase = (p.phase + p.speed * dt) % 1;
    }

    this.drawCurve();
    this.drawMesh();
    this.drawFlows();
    this.drawPulse();
  }

  // ── Layout helpers ────────────────────────────────────────────────────────

  private layout(): void {
    this.pL = Math.round(this.w * 0.115);
    this.pR = Math.round(this.w * 0.955);
    this.pT = Math.round(this.h * 0.075);
    this.pB = Math.round(this.h * 0.855);
    this.pW = this.pR - this.pL;
    this.pH = this.pB - this.pT;
  }

  /** Convert sigma units → screen X */
  private sigX(s: number): number {
    return this.pL + ((s - SIGMA_MIN) / SIGMA_RANGE) * this.pW;
  }

  /** Convert density → screen Y (density=0 at bottom, peak near top) */
  private denY(d: number): number {
    return this.pB - (d / DENS_MAX) * this.pH;
  }

  // ── Background grid (drawn once, translates for parallax) ─────────────────

  private buildGrid(): void {
    const g = this.gridGfx;
    g.clear();

    // Slightly oversized so the parallax shift never reveals the engine bg
    const ow = this.w + 80;
    const oh = this.h + 80;
    const ox = -40;
    const oy = -40;

    g.rect(ox, oy, ow, oh).fill({ color: CRUST });

    // Brushed-metal horizontal scan lines
    for (let y = oy; y <= oy + oh; y += 6) {
      g.moveTo(ox, y)
        .lineTo(ox + ow, y)
        .stroke({ color: MANTLE, width: 1, alpha: 0.08 });
    }

    // Regular cell grid
    const gCols = Math.round(this.w / 20);
    const gRows = Math.round(this.h / 12);
    for (let x = ox; x <= ox + ow; x += gCols) {
      g.moveTo(x, oy)
        .lineTo(x, oy + oh)
        .stroke({ color: SURFACE0, width: 1, alpha: 0.1 });
    }
    for (let y = oy; y <= oy + oh; y += gRows) {
      g.moveTo(ox, y)
        .lineTo(ox + ow, y)
        .stroke({ color: SURFACE0, width: 1, alpha: 0.1 });
    }

    // Sigma-aligned accent verticals
    for (let s = -4; s <= 4; s++) {
      const x = this.sigX(s);
      g.moveTo(x, oy)
        .lineTo(x, oy + oh)
        .stroke({ color: SURFACE1, width: 1, alpha: s === 0 ? 0.22 : 0.12 });
    }
  }

  // ── Axes, ticks, and labels (drawn once per show/resize) ──────────────────

  private buildAxes(): void {
    const g = this.axesGfx;
    g.clear();
    this.lblRoot.removeChildren();

    const { pL, pR, pT, pB } = this;

    // Y axis line + open-tip arrow
    g.moveTo(pL, pT - 28)
      .lineTo(pL, pB + 12)
      .stroke({ color: OVERLAY1, width: 2, alpha: 0.85 });
    g.moveTo(pL - 7, pT - 22)
      .lineTo(pL, pT - 38)
      .lineTo(pL + 7, pT - 22)
      .stroke({ color: OVERLAY1, width: 2, alpha: 0.85 });

    // X axis line + open-tip arrow
    g.moveTo(pL - 12, pB)
      .lineTo(pR + 28, pB)
      .stroke({ color: OVERLAY1, width: 2, alpha: 0.85 });
    g.moveTo(pR + 22, pB - 7)
      .lineTo(pR + 38, pB)
      .lineTo(pR + 22, pB + 7)
      .stroke({ color: OVERLAY1, width: 2, alpha: 0.85 });

    const tickSz = Math.round(this.h * 0.017);
    const labelSz = Math.round(this.h * 0.021);

    const tickStyle = new TextStyle({
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      fontSize: tickSz,
      fill: OVERLAY2,
    });

    const axisLabelStyle = new TextStyle({
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      fontSize: labelSz,
      fontWeight: "bold",
      fill: SUBTEXT0,
      letterSpacing: 3,
    });

    // X axis ticks
    for (let s = -3; s <= 3; s++) {
      const x = this.sigX(s);
      g.moveTo(x, pB)
        .lineTo(x, pB + 12)
        .stroke({ color: OVERLAY1, width: 1.5, alpha: 0.6 });
      const t = new Text({ text: s === 0 ? "0" : `${s}σ`, style: tickStyle });
      t.anchor.set(0.5, 0);
      t.position.set(x, pB + 16);
      this.lblRoot.addChild(t);
    }

    // Y axis ticks
    for (const d of [0, 0.1, 0.2, 0.3, 0.4]) {
      const y = this.denY(d);
      if (y > pB + 4 || y < pT - 4) continue;
      g.moveTo(pL - 12, y)
        .lineTo(pL, y)
        .stroke({ color: OVERLAY1, width: 1.5, alpha: 0.6 });
      const t = new Text({ text: d.toFixed(1), style: tickStyle });
      t.anchor.set(1, 0.5);
      t.position.set(pL - 16, y);
      this.lblRoot.addChild(t);
    }

    // "DENSITY" — rotated Y-axis label
    const densLabel = new Text({ text: "DENSITY", style: axisLabelStyle });
    densLabel.anchor.set(0.5, 0.5);
    densLabel.rotation = -Math.PI / 2;
    densLabel.position.set(pL - 72, (pT + pB) * 0.5);
    this.lblRoot.addChild(densLabel);

    // "VALUES (σ)" — X-axis label
    const valLabel = new Text({ text: "VALUES (σ)", style: axisLabelStyle });
    valLabel.anchor.set(0.5, 0);
    valLabel.position.set((pL + pR) * 0.5, pB + 56);
    this.lblRoot.addChild(valLabel);
  }

  // ── Static translucent fill under the Gaussian curve ─────────────────────

  private buildFill(): void {
    const g = this.fillGfx;
    g.clear();

    const N = 120;
    const pts: number[] = [this.sigX(SIGMA_MIN), this.denY(0)];
    for (let i = 0; i <= N; i++) {
      const s = SIGMA_MIN + (i / N) * SIGMA_RANGE;
      pts.push(this.sigX(s), this.denY(gauss(s)));
    }
    pts.push(this.sigX(SIGMA_MAX), this.denY(0));

    g.poly(pts).fill({ color: BLUE, alpha: 0.04 });
  }

  // ── Particle mesh (built once, animated via shimmer) ──────────────────────

  private buildMesh(): void {
    const rng = seededRng(42);
    const verts: Vertex[] = [];

    // Curve samples — evenly spaced along the bell
    for (let i = 0; i <= 90; i++) {
      const sigma = SIGMA_MIN + (i / 90) * SIGMA_RANGE;
      const d = gauss(sigma);
      const absSig = Math.abs(sigma);
      const ctr = Math.max(0, 1 - absSig / 2.5);
      verts.push({
        sigma,
        baseX: this.sigX(sigma),
        baseY: this.denY(d),
        px: rng() * Math.PI * 2,
        py: rng() * Math.PI * 2,
        sx: 1.2 + absSig * 2.5,
        sy: 1.2 + absSig * 2.5,
        a: 0.45 + ctr * 0.55,
        r: 1 + ctr * 2.2,
      });
    }

    // Gaussian-biased scatter — more points cluster near the centre
    for (let attempt = 0; verts.length < 300 && attempt < 900; attempt++) {
      const u1 = Math.max(1e-6, rng());
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
      const sigma = Math.max(SIGMA_MIN, Math.min(SIGMA_MAX, z * 1.3));
      const d = gauss(sigma);
      const absSig = Math.abs(sigma);
      const bx = this.sigX(sigma) + (rng() - 0.5) * 24;
      const by = this.denY(d) + (rng() - 0.5) * (28 + absSig * 55);
      if (by < this.pT - 20 || by > this.pB + 20) continue;
      const ctr = Math.max(0, 1 - absSig / 2.5);
      verts.push({
        sigma,
        baseX: bx,
        baseY: by,
        px: rng() * Math.PI * 2,
        py: rng() * Math.PI * 2,
        sx: 2 + absSig * 3.5,
        sy: 2 + absSig * 3.5,
        a: 0.22 + ctr * 0.45,
        r: 0.7 + ctr * 1.8,
      });
    }

    // Extra sparse scatter in the far tails
    for (let i = 0; i < 50; i++) {
      const side = (i % 2) * 2 - 1;
      const sigma = side * (2.3 + rng() * 1.2);
      const d = gauss(sigma);
      const bx = this.sigX(sigma) + (rng() - 0.5) * 110;
      const by = this.denY(d) + (rng() - 0.5) * 140;
      if (by < this.pT - 20 || by > this.pB + 50) continue;
      verts.push({
        sigma,
        baseX: bx,
        baseY: by,
        px: rng() * Math.PI * 2,
        py: rng() * Math.PI * 2,
        sx: 6 + rng() * 9,
        sy: 6 + rng() * 9,
        a: 0.1 + rng() * 0.18,
        r: 0.7,
      });
    }

    this.verts = verts;

    // Pre-compute edges (proximity-based, O(n²) done once)
    const MAX_D = 130;
    const MAX_D2 = MAX_D * MAX_D;
    const edges: Edge[] = [];

    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        const dx = verts[i].baseX - verts[j].baseX;
        const dy = verts[i].baseY - verts[j].baseY;
        const dSq = dx * dx + dy * dy;
        if (dSq > MAX_D2) continue;
        const t = 1 - Math.sqrt(dSq) / MAX_D;
        const avgA = (verts[i].a + verts[j].a) * 0.5;
        edges.push({
          a: i,
          b: j,
          ea: t * t * avgA * 0.42,
          ew: 0.45 + t * 0.85,
        });
      }
    }

    this.edges = edges;
  }

  private buildFlows(): void {
    this.flows = [];
    for (let i = 0; i < FLOW_COUNT; i++) {
      this.flows.push({
        dir: (i % 2 === 0 ? 1 : -1) as 1 | -1,
        phase: i / FLOW_COUNT,
        speed: 1 / LOOP_SEC + (Math.random() - 0.5) * 0.012,
      });
    }
  }

  // ── Per-frame draw calls ──────────────────────────────────────────────────

  private drawCurve(): void {
    const g = this.curveGfx;
    g.clear();

    const N = 200;
    const xs = new Float32Array(N + 1);
    const ys = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const s = SIGMA_MIN + (i / N) * SIGMA_RANGE;
      xs[i] = this.sigX(s);
      ys[i] = this.denY(gauss(s));
    }

    const path = () => {
      g.moveTo(xs[0], ys[0]);
      for (let i = 1; i <= N; i++) g.lineTo(xs[i], ys[i]);
    };

    path();
    g.stroke({ color: BLUE, width: 14, alpha: 0.05 });
    path();
    g.stroke({ color: BLUE, width: 7, alpha: 0.13 });
    path();
    g.stroke({ color: LAVENDER, width: 2.5, alpha: 0.78 });
  }

  private drawMesh(): void {
    const g = this.meshGfx;
    g.clear();

    const { verts, edges, time: t } = this;
    const ax = new Float32Array(verts.length);
    const ay = new Float32Array(verts.length);

    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      ax[i] = v.baseX + Math.sin(t * 0.8 + v.px) * v.sx;
      ay[i] = v.baseY + Math.cos(t * 0.7 + v.py) * v.sy;
    }

    for (const e of edges) {
      if (e.ea < 0.02) continue;
      g.moveTo(ax[e.a], ay[e.a])
        .lineTo(ax[e.b], ay[e.b])
        .stroke({ color: SAPPHIRE, width: e.ew, alpha: e.ea });
    }

    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const x = ax[i];
      const y = ay[i];
      if (v.r > 1.8) {
        g.circle(x, y, v.r * 2.8).fill({ color: BLUE, alpha: v.a * 0.16 });
      }
      g.circle(x, y, v.r).fill({
        color: v.r > 2.5 ? LAVENDER : BLUE,
        alpha: v.a,
      });
    }
  }

  private drawFlows(): void {
    const g = this.flowGfx;
    g.clear();

    for (const p of this.flows) {
      // absSigma decreases from SIGMA_MAX → 0 as phase goes 0 → 1
      const absSig = SIGMA_MAX * (1 - p.phase);
      if (absSig > SIGMA_MAX * 0.97) continue; // skip the invisible respawn jump

      const sigma = p.dir * absSig;
      const progress = 1 - absSig / SIGMA_MAX;
      const fadeOut = progress > 0.88 ? (1 - progress) / 0.12 : 1;
      const alpha = fadeOut * (0.25 + progress * 0.75);

      const sx = this.sigX(sigma);
      const sy = this.denY(gauss(sigma));

      // Trailing ghost dots (showing the path already travelled)
      for (let tr = 1; tr <= 5; tr++) {
        const tSig = sigma + p.dir * tr * 0.22; // step further from centre
        if (tSig < SIGMA_MIN || tSig > SIGMA_MAX) continue;
        g.circle(
          this.sigX(tSig),
          this.denY(gauss(tSig)),
          Math.max(0.5, 3 - tr * 0.45),
        ).fill({ color: MAUVE, alpha: alpha * (1 - tr / 6) * 0.45 });
      }

      // Particle glow + core
      g.circle(sx, sy, 11).fill({ color: MAUVE, alpha: alpha * 0.18 });
      g.circle(sx, sy, 5).fill({ color: MAUVE, alpha: alpha * 0.55 });
      g.circle(sx, sy, 2.5).fill({ color: PINK, alpha: alpha });
    }
  }

  private drawPulse(): void {
    const g = this.pulsGfx;
    g.clear();

    const px = this.sigX(0);
    const py = this.denY(gauss(0));
    const beat = (Math.sin(this.time * 1.6) + 1) * 0.5;

    g.circle(px, py, 72 + beat * 28).fill({ color: LAVENDER, alpha: 0.03 });
    g.circle(px, py, 50 + beat * 20).fill({ color: BLUE, alpha: 0.06 });
    g.circle(px, py, 34 + beat * 13).fill({ color: LAVENDER, alpha: 0.12 });
    g.circle(px, py, 22 + beat * 8).fill({ color: LAVENDER, alpha: 0.22 });
    g.circle(px, py, 11 + beat * 4).fill({ color: TEXT_W, alpha: 0.42 });
    g.circle(px, py, 4).fill({ color: TEXT_W, alpha: 0.92 });
  }
}
