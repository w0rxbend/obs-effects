import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

const TAU = Math.PI * 2;

const C = {
  BG: 0x030d1f,
  GRID: 0x00c8ff,
  BORDER: 0x00c8ff,
  LINE_DIM: 0x005577,
  LINE_MID: 0x0099bb,
  LINE_HI: 0x00ccff,
  DOT: 0x55ddff,
  DOT_HI: 0xffffff,
  GLOW: 0x0099ff,
  CALLOUT: 0x00ccee,
  HEX_TEXT: 0x003d55,
  ANNOT: 0x00aacc,
  ANNOT_DIM: 0x336688,
} as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Blueprint Grid & Frame ─────────────────────────────────────────────────────

class BlueprintGrid extends Graphics {
  resize(W: number, H: number): void {
    this.clear();
    const m = 22;

    for (let x = 0; x <= W; x += 40) {
      this.moveTo(x, 0)
        .lineTo(x, H)
        .stroke({ color: C.GRID, width: 0.4, alpha: 0.055 });
    }
    for (let y = 0; y <= H; y += 40) {
      this.moveTo(0, y)
        .lineTo(W, y)
        .stroke({ color: C.GRID, width: 0.4, alpha: 0.055 });
    }

    for (let x = 0; x <= W; x += 200) {
      this.moveTo(x, 0)
        .lineTo(x, H)
        .stroke({ color: C.GRID, width: 0.7, alpha: 0.13 });
    }
    for (let y = 0; y <= H; y += 200) {
      this.moveTo(0, y)
        .lineTo(W, y)
        .stroke({ color: C.GRID, width: 0.7, alpha: 0.13 });
    }

    this.rect(m, m, W - m * 2, H - m * 2).stroke({
      color: C.BORDER,
      width: 1.5,
      alpha: 0.52,
    });
    this.rect(m + 7, m + 7, W - (m + 7) * 2, H - (m + 7) * 2).stroke({
      color: C.BORDER,
      width: 0.5,
      alpha: 0.17,
    });

    for (let x = 40; x < W; x += 40) {
      const tl = x % 200 === 0 ? 12 : 5;
      this.moveTo(x, m)
        .lineTo(x, m + tl)
        .stroke({ color: C.BORDER, width: 0.8, alpha: 0.32 });
      this.moveTo(x, H - m)
        .lineTo(x, H - m - tl)
        .stroke({ color: C.BORDER, width: 0.8, alpha: 0.32 });
    }
    for (let y = 40; y < H; y += 40) {
      const tl = y % 200 === 0 ? 12 : 5;
      this.moveTo(m, y)
        .lineTo(m + tl, y)
        .stroke({ color: C.BORDER, width: 0.8, alpha: 0.32 });
      this.moveTo(W - m, y)
        .lineTo(W - m - tl, y)
        .stroke({ color: C.BORDER, width: 0.8, alpha: 0.32 });
    }

    const bLen = 52,
      bm = m + 14;
    const corners: [number, number, number, number][] = [
      [bm, bm, 1, 1],
      [W - bm, bm, -1, 1],
      [bm, H - bm, 1, -1],
      [W - bm, H - bm, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      this.moveTo(cx + sx * bLen, cy)
        .lineTo(cx, cy)
        .lineTo(cx, cy + sy * bLen)
        .stroke({ color: C.BORDER, width: 2, alpha: 0.65 });
    }

    this.moveTo(W * 0.5, m)
      .lineTo(W * 0.5, H - m)
      .stroke({ color: C.GRID, width: 0.3, alpha: 0.07 });
    this.moveTo(m, H * 0.5)
      .lineTo(W - m, H * 0.5)
      .stroke({ color: C.GRID, width: 0.3, alpha: 0.07 });
  }
}

// ── Crosshair Markers ─────────────────────────────────────────────────────────

class CrosshairSet extends Graphics {
  setup(W: number, H: number): void {
    this.clear();
    const positions = [
      [0.13, 0.21],
      [0.87, 0.21],
      [0.13, 0.79],
      [0.87, 0.79],
      [0.5, 0.1],
      [0.5, 0.9],
      [0.21, 0.5],
      [0.79, 0.5],
    ];
    for (const [nx, ny] of positions) {
      const x = nx * W,
        y = ny * H,
        r = 9;
      this.moveTo(x - r * 2, y)
        .lineTo(x - r * 0.45, y)
        .moveTo(x + r * 0.45, y)
        .lineTo(x + r * 2, y)
        .moveTo(x, y - r * 2)
        .lineTo(x, y - r * 0.45)
        .moveTo(x, y + r * 0.45)
        .lineTo(x, y + r * 2)
        .stroke({ color: C.CALLOUT, width: 0.7, alpha: 0.42 });
      this.circle(x, y, r).stroke({
        color: C.CALLOUT,
        width: 0.7,
        alpha: 0.35,
      });
    }
  }
}

// ── Technical Callout Bubbles (static graphics, pulsing text) ─────────────────

interface CalloutDef {
  box: [number, number];
  tip: [number, number];
  lines: string[];
}

class CalloutLayer extends Container {
  private gfx = new Graphics();
  private textNodes: {
    t: Text;
    baseAlpha: number;
    phase: number;
    spd: number;
  }[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  setup(W: number, H: number): void {
    while (this.children.length > 1) this.removeChildAt(1);
    this.textNodes = [];
    this.gfx.clear();

    const defs: CalloutDef[] = [
      {
        box: [0.065, 0.27],
        tip: [0.285, 0.38],
        lines: ["KERNEL_MODULE_v6.1", "STATUS: LOADED"],
      },
      {
        box: [0.875, 0.27],
        tip: [0.715, 0.38],
        lines: ["FS_TYPE: EXT4", "MOUNT: /"],
      },
      {
        box: [0.065, 0.6],
        tip: [0.265, 0.53],
        lines: ["PARTICLE_DENSITY_HIGH", "ρ = 4.2e+03"],
      },
      {
        box: [0.875, 0.6],
        tip: [0.735, 0.51],
        lines: ["SYS_CLOCK: 3.6GHz", "ARCH: x86_64"],
      },
      {
        box: [0.5, 0.066],
        tip: [0.5, 0.215],
        lines: ["PENGUIN_ID: TUX_1.0", "BUILD: v6.1.0"],
      },
      {
        box: [0.5, 0.925],
        tip: [0.5, 0.775],
        lines: ["NET: eth0 ACTIVE", "TX/RX: NOMINAL"],
      },
      {
        box: [0.175, 0.08],
        tip: [0.33, 0.24],
        lines: ["MESH_NODES: AUTO", "SAMPLING: 7px"],
      },
      {
        box: [0.825, 0.08],
        tip: [0.67, 0.24],
        lines: ["DEPTH_SORT: ON", "AURA_HALO: ON"],
      },
    ];

    const style = new TextStyle({
      fill: C.CALLOUT,
      fontFamily: "monospace",
      fontSize: 10,
      lineHeight: 14,
    });
    const annoStyle = new TextStyle({
      fill: C.ANNOT_DIM,
      fontFamily: "monospace",
      fontSize: 9,
    });

    const BW = 148,
      lineH = 14;

    for (const d of defs) {
      const bx = d.box[0] * W,
        by = d.box[1] * H;
      const tipX = d.tip[0] * W,
        tipY = d.tip[1] * H;
      const isRight = d.box[0] > 0.5;
      const isBottom = d.box[1] > 0.5;
      const boxH = 10 + d.lines.length * lineH;
      const boxLeft = isRight ? bx - BW : bx;
      const boxTop = by - boxH * 0.5;
      const leaderX = isRight ? boxLeft : boxLeft + BW;
      const leaderY = isBottom ? boxTop : boxTop + boxH;

      this.gfx
        .moveTo(tipX, tipY)
        .lineTo(leaderX, leaderY)
        .stroke({ color: C.CALLOUT, width: 0.7, alpha: 0.48 });
      this.gfx.circle(tipX, tipY, 2.5).fill({ color: C.CALLOUT, alpha: 0.7 });
      this.gfx
        .rect(boxLeft, boxTop, BW, boxH)
        .fill({ color: 0x000d1a, alpha: 0.78 });
      this.gfx
        .rect(boxLeft, boxTop, BW, boxH)
        .stroke({ color: C.CALLOUT, width: 0.7, alpha: 0.52 });

      for (let i = 0; i < d.lines.length; i++) {
        const t = new Text({ text: d.lines[i], style });
        t.position.set(boxLeft + 5, boxTop + 4 + i * lineH);
        const baseAlpha = i === 0 ? 0.88 : 0.52;
        t.alpha = baseAlpha;
        this.addChild(t);
        this.textNodes.push({
          t,
          baseAlpha,
          phase: Math.random() * TAU,
          spd: 0.01 + Math.random() * 0.01,
        });
      }
    }

    // Measurement brackets around the penguin area
    const px = W * 0.285,
      py = H * 0.38,
      pw = W * 0.43,
      ph = H * 0.54;
    const brackY = H * 0.82;
    this.gfx
      .moveTo(px, brackY)
      .lineTo(px + pw, brackY)
      .stroke({ color: C.ANNOT_DIM, width: 0.6, alpha: 0.28 });
    this.gfx
      .moveTo(px, brackY - 5)
      .lineTo(px, brackY + 5)
      .stroke({ color: C.ANNOT_DIM, width: 0.6, alpha: 0.28 });
    this.gfx
      .moveTo(px + pw, brackY - 5)
      .lineTo(px + pw, brackY + 5)
      .stroke({ color: C.ANNOT_DIM, width: 0.6, alpha: 0.28 });
    const lbl1 = new Text({ text: "512 UNITS", style: annoStyle });
    lbl1.anchor.set(0.5, 0);
    lbl1.position.set(px + pw * 0.5, brackY + 7);
    lbl1.alpha = 0.28;
    this.addChild(lbl1);

    const brackX = W * 0.73;
    this.gfx
      .moveTo(brackX, py)
      .lineTo(brackX, py + ph)
      .stroke({ color: C.ANNOT_DIM, width: 0.6, alpha: 0.28 });
    this.gfx
      .moveTo(brackX - 5, py)
      .lineTo(brackX + 5, py)
      .stroke({ color: C.ANNOT_DIM, width: 0.6, alpha: 0.28 });
    this.gfx
      .moveTo(brackX - 5, py + ph)
      .lineTo(brackX + 5, py + ph)
      .stroke({ color: C.ANNOT_DIM, width: 0.6, alpha: 0.28 });
    const lbl2 = new Text({ text: "HEIGHT", style: annoStyle });
    lbl2.anchor.set(0, 0.5);
    lbl2.position.set(brackX + 8, py + ph * 0.5);
    lbl2.alpha = 0.28;
    this.addChild(lbl2);
  }

  update(ticker: Ticker): void {
    for (const n of this.textNodes) {
      n.phase += n.spd * ticker.deltaTime;
      n.t.alpha = n.baseAlpha * (0.72 + 0.28 * Math.sin(n.phase));
    }
  }
}

// ── Scrolling Hex Code ────────────────────────────────────────────────────────

const HEX_CHARS = "0123456789ABCDEF";
function randHex(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += HEX_CHARS[Math.floor(Math.random() * 16)];
    if (i < len - 1) s += " ";
  }
  return s;
}

interface HexLine {
  t: Text;
  vy: number;
  screenH: number;
}

class HexScroller extends Container {
  private lines: HexLine[] = [];

  setup(W: number, H: number): void {
    while (this.children.length > 0) this.removeChildAt(0);
    this.lines = [];
    const style = new TextStyle({
      fill: C.HEX_TEXT,
      fontFamily: "monospace",
      fontSize: 9,
    });
    const count = 28;
    for (let i = 0; i < count; i++) {
      const right = i >= count / 2;
      const idx = i % (count / 2);
      const t = new Text({ text: randHex(7), style });
      t.x = right ? W - 115 : 28;
      t.y = (idx / (count / 2)) * H + Math.random() * (H / count);
      t.alpha = 0.18 + Math.random() * 0.14;
      this.addChild(t);
      this.lines.push({
        t,
        vy: right
          ? -(0.38 + Math.random() * 0.42)
          : 0.38 + Math.random() * 0.42,
        screenH: H,
      });
    }
  }

  update(ticker: Ticker): void {
    for (const l of this.lines) {
      l.t.y += l.vy * ticker.deltaTime;
      if (l.t.y > l.screenH + 20) l.t.y = -12;
      if (l.t.y < -20) l.t.y = l.screenH + 12;
      if (Math.random() < 0.022) l.t.text = randHex(7);
    }
  }
}

// ── Corner Text Blocks ────────────────────────────────────────────────────────

function makeCorner(lines: string[], anchorRight: boolean): Container {
  const c = new Container();
  const style = new TextStyle({
    fill: C.ANNOT,
    fontFamily: "monospace",
    fontSize: 11,
  });
  for (let i = 0; i < lines.length; i++) {
    const t = new Text({ text: lines[i], style });
    t.y = i * 15;
    t.alpha = i === 0 ? 0.72 : 0.36;
    if (anchorRight) t.anchor.set(1, 0);
    c.addChild(t);
  }
  return c;
}

const TL = [
  "SCHEMATIC: TUX-MESH-01",
  "REV 1.0 / 2026-05-08",
  "PROJ: BLUEPRINT_VIZ",
  "RENDERER: PIXI.JS 8",
  "OBS: BROWSER SOURCE",
];
const TR = [
  "TELEMETRY  ACTIVE",
  "KERNEL: 6.1.0-LTS",
  "ARCH: x86_64",
  "PARTICLES: DYNAMIC",
  "MESH: WIREFRAME",
];
const BL = [
  "> KERNEL_MODULE_v6.1",
  "> FS_TYPE: EXT4",
  "> PARTICLE_DENSITY_HIGH",
  "> DEPTH_SORT: ACTIVE",
];
const BR = ["SYS: ONLINE", "NET: NOMINAL", "GPU: ACTIVE", "FPS: TARGET 60"];

// ── Tux Particle Mesh ─────────────────────────────────────────────────────────

interface TuxParticle {
  nx: number;
  ny: number;
  phase: number;
  spd: number;
  bright: boolean;
}

interface TuxEdge {
  a: number;
  b: number;
}

class TuxMesh extends Container {
  private gfx = new Graphics();
  private particles: TuxParticle[] = [];
  private edges: TuxEdge[] = [];
  private time = 0;
  private ready = false;

  private W = 1920;
  private H = 1080;
  private meshScale = 756;
  private offX = 582;
  private offY = 162;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  layout(W: number, H: number): void {
    this.W = W;
    this.H = H;
    const PAD = 220; // px padding on each side
    const targetH = Math.min(H - PAD * 2, W - PAD * 2) * 0.74;
    this.meshScale = targetH;
    this.offX = (W - targetH) * 0.5;
    this.offY = (H - targetH) * 0.5;
  }

  async load(): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          this.buildFromImage(img);
        } catch {
          /* noop */
        }
        this.ready = true;
        resolve();
      };
      img.onerror = () => {
        this.ready = true;
        resolve();
      };
      img.src = `${import.meta.env.BASE_URL}assets/main/linux.svg`;
    });
  }

  private buildFromImage(img: HTMLImageElement): void {
    const SZ = 512,
      STEP = 7;
    const canvas = document.createElement("canvas");
    canvas.width = SZ;
    canvas.height = SZ;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, SZ, SZ);
    const data = ctx.getImageData(0, 0, SZ, SZ).data;

    const GR = Math.ceil(SZ / STEP),
      GC = Math.ceil(SZ / STEP);
    const valid = new Uint8Array(GR * GC);
    let minR = GR,
      maxR = 0,
      minC = GC,
      maxC = 0;

    for (let r = 0; r < GR; r++) {
      for (let c = 0; c < GC; c++) {
        const px = c * STEP,
          py = r * STEP;
        if (px >= SZ || py >= SZ) continue;
        const i = (py * SZ + px) * 4;
        if (data[i + 3] > 80 && data[i] + data[i + 1] + data[i + 2] < 450) {
          valid[r * GC + c] = 1;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    const rangeR = Math.max(1, maxR - minR);
    const rangeC = Math.max(1, maxC - minC);
    const idxMap = new Map<number, number>();
    this.particles = [];

    for (let r = 0; r < GR; r++) {
      for (let c = 0; c < GC; c++) {
        if (!valid[r * GC + c]) continue;
        idxMap.set(r * GC + c, this.particles.length);
        this.particles.push({
          nx: (c - minC) / rangeC,
          ny: (r - minR) / rangeR,
          phase: Math.random() * TAU,
          spd: 0.007 + Math.random() * 0.012,
          bright: Math.random() < 0.055,
        });
      }
    }

    // Grid-adjacent edges only — O(N)
    this.edges = [];
    const dirs: [number, number][] = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (let r = 0; r < GR; r++) {
      for (let c = 0; c < GC; c++) {
        if (!valid[r * GC + c]) continue;
        const ai = idxMap.get(r * GC + c)!;
        for (const [dr, dc] of dirs) {
          const nr = r + dr,
            nc = c + dc;
          if (nr >= GR || nc < 0 || nc >= GC) continue;
          if (!valid[nr * GC + nc]) continue;
          this.edges.push({ a: ai, b: idxMap.get(nr * GC + nc)! });
        }
      }
    }
  }

  update(ticker: Ticker): void {
    this.time += Math.min(ticker.deltaMS * 0.001, 0.04);
    if (!this.ready) return;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const { meshScale: ms, offX, offY, W, H } = this;
    const t = this.time;
    const P = this.particles;
    const N = P.length;
    if (N === 0) return;

    const sx = new Float32Array(N);
    const sy = new Float32Array(N);
    const pu = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const p = P[i];
      p.phase += p.spd;
      pu[i] = (Math.sin(p.phase * 1.3 + t * 1.6) + 1) * 0.5;
      const dx =
        Math.sin(p.phase * 1.1 + p.nx * 4.2 + t * 0.55) * 3.0 +
        Math.cos(p.phase * 0.75 + p.ny * 3.8 + t * 0.42) * 1.6;
      const dy =
        Math.cos(p.phase * 0.88 + p.nx * 3.9 + t * 0.48) * 2.8 +
        Math.sin(p.phase * 1.15 + p.ny * 4.1 + t * 0.38) * 1.4;
      sx[i] = offX + p.nx * ms + dx;
      sy[i] = offY + p.ny * ms + dy;
    }

    // Ambient halo behind silhouette
    const cx = offX + ms * 0.5,
      cy = offY + ms * 0.5,
      gr = ms * 0.44;
    g.circle(cx, cy, gr * 1.18).fill({ color: 0x001428, alpha: 0.22 });
    g.circle(cx, cy, gr * 0.9).fill({ color: 0x002244, alpha: 0.14 });
    g.circle(cx, cy, gr * 0.65).fill({ color: 0x003366, alpha: 0.08 });

    // Mesh edges
    for (const e of this.edges) {
      const p = (pu[e.a] + pu[e.b]) * 0.5;
      const color = p > 0.65 ? C.LINE_HI : p > 0.3 ? C.LINE_MID : C.LINE_DIM;
      g.moveTo(sx[e.a], sy[e.a])
        .lineTo(sx[e.b], sy[e.b])
        .stroke({ color, width: 0.32 + p * 0.28, alpha: 0.05 + p * 0.14 });
    }

    // Particle dots
    for (let i = 0; i < N; i++) {
      const p = P[i];
      const pulse = pu[i];
      if (p.bright) {
        const r = 2.2 + pulse * 1.8,
          a = 0.65 + pulse * 0.35;
        g.circle(sx[i], sy[i], r * 3.8).fill({
          color: C.GLOW,
          alpha: a * 0.08,
        });
        g.circle(sx[i], sy[i], r * 1.5).fill({
          color: C.GLOW,
          alpha: a * 0.14,
        });
        g.circle(sx[i], sy[i], r).fill({ color: C.DOT_HI, alpha: a });
      } else {
        const r = 0.75 + pulse * 0.5,
          a = 0.17 + pulse * 0.3;
        g.circle(sx[i], sy[i], r * 3).fill({ color: C.GLOW, alpha: a * 0.06 });
        g.circle(sx[i], sy[i], r).fill({ color: C.DOT, alpha: a });
      }
    }

    // Scan-line sweep
    const sweepY = offY + ((t * 55) % (ms * 1.1));
    if (sweepY > offY && sweepY < offY + ms) {
      g.rect(offX - 4, sweepY - 1, ms + 8, 1.5).fill({
        color: C.LINE_HI,
        alpha: 0.06,
      });
    }

    void W;
    void H;
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export class LinuxBlueprintScreen extends Container {
  public static assetBundles: string[] = [];

  private bg = new Graphics();
  private grid = new BlueprintGrid();
  private xhairs = new CrosshairSet();
  private tux = new TuxMesh();
  private callouts = new CalloutLayer();
  private hex = new HexScroller();
  private tl!: Container;
  private tr!: Container;
  private bl!: Container;
  private br!: Container;

  constructor() {
    super();
    this.addChild(this.bg);
    this.addChild(this.grid);
    this.addChild(this.xhairs);
    this.addChild(this.tux);
    this.addChild(this.callouts);
    this.addChild(this.hex);
    this.tl = makeCorner(TL, false);
    this.tr = makeCorner(TR, true);
    this.bl = makeCorner(BL, false);
    this.br = makeCorner(BR, true);
    for (const b of [this.tl, this.tr, this.bl, this.br]) this.addChild(b);
  }

  public async show(): Promise<void> {
    const W = window.innerWidth || 1920;
    const H = window.innerHeight || 1080;
    this.resize(W, H);
    await this.tux.load();
  }

  public async hide(): Promise<void> {}

  public resize(W: number, H: number): void {
    const PAD = 58;
    this.bg.clear();
    this.bg.rect(0, 0, W, H).fill({ color: C.BG });
    this.grid.resize(W, H);
    this.xhairs.setup(W, H);
    this.callouts.setup(W, H);
    this.hex.setup(W, H);
    this.tux.layout(W, H);
    this.tl.position.set(PAD, PAD);
    this.tr.position.set(W - PAD, PAD);
    this.bl.position.set(PAD, H - PAD - (BL.length - 1) * 15);
    this.br.position.set(W - PAD, H - PAD - (BR.length - 1) * 15);
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaTime, 0.5, 3);
    const ft = { ...ticker, deltaTime: dt } as Ticker;
    this.tux.update(ft);
    this.callouts.update(ft);
    this.hex.update(ft);
  }
}
