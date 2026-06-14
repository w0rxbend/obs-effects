import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = 0x00e5ff;
const C_DIM = 0x001a2a;
const C_MID = 0x005f78;
const C_WARN = 0xffaa00;
const C_CRIT = 0xff4444;
const HDR_H = 44;

// ── Text style helper ─────────────────────────────────────────────────────────
function monoStyle(size: number, color: number = C): TextStyle {
  return new TextStyle({
    fill: color,
    fontSize: size,
    fontFamily: "monospace",
  });
}

// ── Corner accent brackets ────────────────────────────────────────────────────
function drawCorners(
  g: Graphics,
  w: number,
  h: number,
  sz = 7,
  color = C,
  alpha = 0.9,
  thick = 1.5,
): void {
  (
    [
      [-1, -1, 0, 0],
      [1, -1, w, 0],
      [-1, 1, 0, h],
      [1, 1, w, h],
    ] as const
  ).forEach(([sx, sy, ox, oy]) => {
    g.moveTo(ox, oy - sy * sz)
      .lineTo(ox, oy)
      .lineTo(ox + sx * sz, oy)
      .stroke({ color, alpha, width: thick });
  });
}

function panelBorder(g: Graphics, w: number, h: number): void {
  g.rect(0, 0, w, h).stroke({ color: C, alpha: 0.4, width: 1 });
  drawCorners(g, w, h);
  g.moveTo(0, 18).lineTo(w, 18).stroke({ color: C, alpha: 0.22, width: 0.5 });
}

// ── Hex stream ────────────────────────────────────────────────────────────────
const HEX_CHARS = "0123456789ABCDEF";
const randHex = (n: number) =>
  Array.from({ length: n }, () => HEX_CHARS[(Math.random() * 16) | 0]).join("");

class HexColumn {
  readonly con: Container;
  private readonly lines: Text[] = [];
  private readonly lineH = 14;
  private scrollY: number;
  private readonly speed: number;
  private refAcc = 0;
  private readonly refInt: number;

  constructor(x: number, bodyY: number, bodyH: number) {
    this.con = new Container();
    this.con.x = x;
    const count = Math.ceil(bodyH / this.lineH) + 2;
    for (let i = 0; i < count; i++) {
      const t = new Text({
        text: randHex(8),
        style: monoStyle(10),
      });
      t.alpha = 0.15 + Math.random() * 0.18;
      t.y = i * this.lineH;
      this.con.addChild(t);
      this.lines.push(t);
    }
    this.scrollY = Math.random() * this.lineH;
    this.speed = 12 + Math.random() * 10;
    this.refInt = 0.14 + Math.random() * 0.22;
    this.con.y = bodyY;
  }

  update(dt: number, bodyY: number): void {
    this.scrollY += this.speed * dt;
    if (this.scrollY >= this.lineH) {
      this.scrollY -= this.lineH;
      const first = this.lines.shift()!;
      first.y = this.lines[this.lines.length - 1].y + this.lineH;
      first.text = randHex(8);
      this.lines.push(first);
    }
    this.con.y = bodyY - this.scrollY;
    this.refAcc += dt;
    if (this.refAcc > this.refInt) {
      this.refAcc = 0;
      const i = (Math.random() * this.lines.length) | 0;
      this.lines[i].text = randHex(8);
    }
  }
}

// ── Line graph panel ─────────────────────────────────────────────────────────
class LineGraphPanel extends Container {
  private readonly pw: number;
  private readonly ph: number;
  private readonly data: number[];
  private time = 0;
  private tickAcc = 0;
  private readonly tickInt = 0.48;
  private readonly freq: number;
  private readonly phase: number;
  private readonly valT: Text;
  private readonly g: Graphics;

  constructor(pw: number, ph: number, label: string, freq = 0.38, phase = 0) {
    super();
    this.pw = pw;
    this.ph = ph;
    this.freq = freq;
    this.phase = phase;
    this.data = Array.from({ length: 60 }, () => 0.25 + Math.random() * 0.45);

    const b = new Graphics();
    panelBorder(b, pw, ph);
    this.addChild(b);

    const lbl = new Text({ text: label, style: monoStyle(10) });
    lbl.x = 6;
    lbl.y = 5;
    this.addChild(lbl);

    this.valT = new Text({ text: "--", style: monoStyle(10) });
    this.valT.x = pw - 52;
    this.valT.y = 5;
    this.addChild(this.valT);

    this.g = new Graphics();
    this.g.x = 4;
    this.g.y = 21;
    this.addChild(this.g);
  }

  update(dt: number): void {
    this.time += dt;
    this.tickAcc += dt;
    if (this.tickAcc >= this.tickInt) {
      this.tickAcc = 0;
      const v =
        0.5 +
        0.26 * Math.sin(this.time * this.freq + this.phase) +
        0.11 * Math.sin(this.time * this.freq * 3.3 + 1.4) +
        0.06 * (Math.random() - 0.5);
      this.data.shift();
      this.data.push(Math.max(0.03, Math.min(0.97, v)));
    }

    const gH = this.ph - 28;
    const gW = this.pw - 8;
    const n = this.data.length;
    const last = this.data[n - 1];
    const g = this.g;
    g.clear();

    const poly: number[] = [];
    for (let i = 0; i < n; i++) {
      poly.push((i / (n - 1)) * gW, gH - this.data[i] * gH);
    }
    poly.push(gW, gH, 0, gH);
    g.poly(poly).fill({ color: C, alpha: 0.07 });

    g.moveTo(0, gH - this.data[0] * gH);
    for (let i = 1; i < n; i++) {
      g.lineTo((i / (n - 1)) * gW, gH - this.data[i] * gH);
    }
    g.stroke({ color: C, alpha: 0.9, width: 1.2 });
    g.circle(gW, gH - last * gH, 2.5).fill({ color: C, alpha: 1 });

    const col = last > 0.8 ? C_CRIT : last > 0.6 ? C_WARN : C;
    this.valT.style.fill = col;
    this.valT.text = (last * 100).toFixed(1) + "%";
  }
}

// ── Telemetry panel ───────────────────────────────────────────────────────────
interface RowDef {
  label: string;
}

interface Row extends RowDef {
  val: number;
  phase: number;
}

interface BarEntry {
  g: Graphics;
  x: number;
  y: number;
  mw: number;
}

class TelemetryPanel extends Container {
  private time = 0;
  private readonly rows: Row[];
  private readonly barGs: BarEntry[] = [];
  private readonly valTs: Text[] = [];

  constructor(pw: number, ph: number, title: string, rowDefs: RowDef[]) {
    super();
    this.rows = rowDefs.map((r) => ({
      ...r,
      val: 0.18 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }));

    const b = new Graphics();
    panelBorder(b, pw, ph);
    this.addChild(b);

    const t = new Text({ text: title, style: monoStyle(10) });
    t.x = 6;
    t.y = 5;
    this.addChild(t);

    const rowH = (ph - 22) / rowDefs.length;

    for (let i = 0; i < rowDefs.length; i++) {
      const ry = 22 + i * rowH;

      const lbl = new Text({
        text: rowDefs[i].label,
        style: monoStyle(9, C_MID),
      });
      lbl.x = 6;
      lbl.y = ry + 2;
      this.addChild(lbl);

      const vt = new Text({ text: "0.0%", style: monoStyle(9) });
      vt.x = pw - 48;
      vt.y = ry + 2;
      this.addChild(vt);
      this.valTs.push(vt);

      const bbg = new Graphics();
      bbg.rect(6, ry + 14, pw - 12, 3).fill({ color: C_DIM, alpha: 0.6 });
      this.addChild(bbg);

      const bf = new Graphics();
      this.addChild(bf);
      this.barGs.push({ g: bf, x: 6, y: ry + 14, mw: pw - 12 });
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      r.val +=
        0.08 * Math.sin(this.time * 0.45 + r.phase) * dt +
        0.04 * (Math.random() - 0.5) * dt;
      r.val = Math.max(0.04, Math.min(0.96, r.val));

      const col = r.val > 0.8 ? C_CRIT : r.val > 0.62 ? C_WARN : C;
      const bar = this.barGs[i];
      bar.g.clear();
      bar.g
        .rect(bar.x, bar.y, bar.mw * r.val, 3)
        .fill({ color: col, alpha: 0.88 });
      this.valTs[i].text = (r.val * 100).toFixed(1) + "%";
      this.valTs[i].style.fill = col;
    }
  }
}

// ── Wireframe shape ───────────────────────────────────────────────────────────
type Vec3 = [number, number, number];
type Edge = [number, number];

class WireframeShape extends Container {
  private readonly FOV = 500;
  private rX: number;
  private rY: number;
  private rZ: number;
  private readonly dX: number;
  private readonly dY: number;
  private readonly dZ: number;
  private readonly sz: number;
  private readonly g: Graphics;
  private readonly verts: Vec3[] = [];
  private readonly edges: Edge[] = [];

  constructor(size: number, type: "cube" | "icosahedron" = "cube") {
    super();
    this.rX = Math.random() * Math.PI * 2;
    this.rY = Math.random() * Math.PI * 2;
    this.rZ = Math.random() * Math.PI * 2;
    this.dX = (Math.random() - 0.5) * 0.0045;
    this.dY = 0.004 + Math.random() * 0.004;
    this.dZ = (Math.random() - 0.5) * 0.0025;
    this.sz = size;
    this.g = new Graphics();
    this.addChild(this.g);
    this.build(size, type);
  }

  private build(s: number, type: "cube" | "icosahedron"): void {
    if (type === "cube") {
      this.verts.push(
        [-s, -s, -s],
        [s, -s, -s],
        [s, s, -s],
        [-s, s, -s],
        [-s, -s, s],
        [s, -s, s],
        [s, s, s],
        [-s, s, s],
      );
      this.edges.push(
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      );
    } else {
      const phi = (s * (1 + Math.sqrt(5))) / 2;
      this.verts.push(
        [0, s, phi],
        [0, -s, phi],
        [0, s, -phi],
        [0, -s, -phi],
        [s, phi, 0],
        [-s, phi, 0],
        [s, -phi, 0],
        [-s, -phi, 0],
        [phi, 0, s],
        [phi, 0, -s],
        [-phi, 0, s],
        [-phi, 0, -s],
      );
      this.edges.push(
        [0, 1],
        [0, 4],
        [0, 5],
        [0, 8],
        [0, 10],
        [1, 6],
        [1, 7],
        [1, 8],
        [1, 10],
        [2, 3],
        [2, 4],
        [2, 5],
        [2, 9],
        [2, 11],
        [3, 6],
        [3, 7],
        [3, 9],
        [3, 11],
        [4, 8],
        [4, 9],
        [5, 10],
        [5, 11],
        [6, 8],
        [6, 9],
        [7, 10],
        [7, 11],
        [8, 9],
        [10, 11],
      );
    }
  }

  private rx(v: Vec3, a: number): Vec3 {
    const c = Math.cos(a),
      s = Math.sin(a);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  }

  private ry(v: Vec3, a: number): Vec3 {
    const c = Math.cos(a),
      s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  }

  private rz(v: Vec3, a: number): Vec3 {
    const c = Math.cos(a),
      s = Math.sin(a);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  }

  private project(v: Vec3): Vec3 {
    const d = v[2] + this.FOV;
    return [(v[0] * this.FOV) / d, (v[1] * this.FOV) / d, v[2]];
  }

  update(dt: number): void {
    this.rX += this.dX * dt * 60;
    this.rY += this.dY * dt * 60;
    this.rZ += this.dZ * dt * 60;

    const p = this.verts.map((v) =>
      this.project(this.rz(this.ry(this.rx(v, this.rX), this.rY), this.rZ)),
    );
    const halfRange = this.sz * 1.8;
    const g = this.g;
    g.clear();

    for (const [ai, bi] of this.edges) {
      const depth = (p[ai][2] + p[bi][2]) / 2;
      const t = Math.max(0, Math.min(1, (depth + halfRange) / (halfRange * 2)));
      g.moveTo(p[ai][0], p[ai][1])
        .lineTo(p[bi][0], p[bi][1])
        .stroke({ color: C, alpha: 0.18 + t * 0.68, width: 0.9 });
    }
    for (const v of p) {
      const t = Math.max(0, Math.min(1, (v[2] + halfRange) / (halfRange * 2)));
      g.circle(v[0], v[1], 1.6).fill({ color: C, alpha: 0.35 + t * 0.65 });
    }
  }
}

// ── Data stream ───────────────────────────────────────────────────────────────
interface StreamPt {
  t: number;
  spd: number;
}

class DataStream {
  readonly lineG: Graphics;
  readonly dotG: Graphics;
  private readonly pts: StreamPt[];
  private readonly x1: number;
  private readonly y1: number;
  private readonly x2: number;
  private readonly y2: number;

  constructor(x1: number, y1: number, x2: number, y2: number, n = 8) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.pts = Array.from({ length: n }, (_, i) => ({
      t: i / n + Math.random() * 0.05,
      spd: 0.09 + Math.random() * 0.13,
    }));

    this.lineG = new Graphics();
    this.lineG
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke({ color: C, alpha: 0.1, width: 0.5 });

    this.dotG = new Graphics();
  }

  update(dt: number): void {
    const g = this.dotG;
    g.clear();
    for (const p of this.pts) {
      p.t = (p.t + p.spd * dt) % 1;
      g.circle(
        this.x1 + (this.x2 - this.x1) * p.t,
        this.y1 + (this.y2 - this.y1) * p.t,
        1.8,
      ).fill({ color: C, alpha: 0.8 });
    }
  }
}

// ── Scan line ─────────────────────────────────────────────────────────────────
class ScanLine {
  readonly g: Graphics;
  private y = 0;
  private readonly spd = 50;

  constructor(w: number) {
    this.g = new Graphics();
    this.g.rect(0, 0, w, 2).fill({ color: C, alpha: 0.04 });
  }

  update(dt: number, h: number): void {
    this.y = (this.y + this.spd * dt) % h;
    this.g.y = this.y;
  }
}

// ── Floating hex readout ───────────────────────────────────────────────────────
class FloatingReadout extends Container {
  private time: number;
  private readonly phase: number;
  private readonly valT: Text;

  constructor(pw: number, ph: number, label: string) {
    super();
    this.time = Math.random() * 100;
    this.phase = Math.random() * Math.PI * 2;

    const b = new Graphics();
    b.rect(0, 0, pw, ph).stroke({ color: C, alpha: 0.35, width: 0.8 });
    drawCorners(b, pw, ph, 5, C, 0.7, 1);
    this.addChild(b);

    const l = new Text({ text: label, style: monoStyle(9, C_MID) });
    l.x = 5;
    l.y = 4;
    this.addChild(l);

    this.valT = new Text({ text: "0x0000", style: monoStyle(11) });
    this.valT.x = 5;
    this.valT.y = 16;
    this.addChild(this.valT);
  }

  update(dt: number): void {
    this.time += dt;
    const v = Math.floor(
      Math.abs(Math.sin(this.time * 0.3 + this.phase)) * 0xffff,
    );
    this.valT.text = "0x" + v.toString(16).toUpperCase().padStart(4, "0");
  }
}

// ── Header ─────────────────────────────────────────────────────────────────────
function buildHeader(
  parent: Container,
  w: number,
): ReturnType<typeof setInterval> {
  const con = new Container();

  const bg = new Graphics();
  bg.rect(0, 0, w, HDR_H).fill({ color: 0x000b12, alpha: 0.96 });
  bg.moveTo(0, HDR_H)
    .lineTo(w, HDR_H)
    .stroke({ color: C, alpha: 0.45, width: 1 });
  bg.moveTo(0, 0).lineTo(0, HDR_H).stroke({ color: C, alpha: 0.6, width: 3 });
  con.addChild(bg);

  const title = new Text({
    text: "◈  DEV·HUD  v2.1",
    style: new TextStyle({
      fill: C,
      fontSize: 14,
      fontFamily: "monospace",
      fontWeight: "bold",
    }),
  });
  title.x = 14;
  title.y = 15;
  con.addChild(title);

  const states = [
    { lbl: "NET", ok: true },
    { lbl: "GPU", ok: true },
    { lbl: "SYS", ok: true },
    { lbl: "DBG", ok: false },
  ];
  let sx = w - 230;
  for (const s of states) {
    const dot = new Graphics();
    dot.circle(sx, HDR_H / 2, 4).fill({ color: s.ok ? 0x00ff88 : 0x334455 });
    con.addChild(dot);
    const lbl = new Text({ text: s.lbl, style: monoStyle(9, C_MID) });
    lbl.x = sx + 8;
    lbl.y = HDR_H / 2 - 6;
    con.addChild(lbl);
    sx += 54;
  }

  const clock = new Text({ text: "", style: monoStyle(10, C_MID) });
  clock.x = w / 2 - 70;
  clock.y = HDR_H / 2 - 6;
  con.addChild(clock);
  const tick = () => {
    clock.text = new Date().toISOString().slice(0, 19) + "Z";
  };
  tick();
  const interval = setInterval(tick, 1000);

  const rb = new Graphics();
  rb.moveTo(w, 0).lineTo(w, HDR_H).stroke({ color: C, alpha: 0.6, width: 3 });
  con.addChild(rb);

  parent.addChild(con);
  return interval;
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export class SciFiHudScreen extends Container {
  public static assetBundles: string[] = [];

  private w = 1920;
  private h = 1080;

  private hexCols: HexColumn[] = [];
  private graphs: LineGraphPanel[] = [];
  private wireframes: WireframeShape[] = [];
  private tels: TelemetryPanel[] = [];
  private readouts: FloatingReadout[] = [];
  private streams: DataStream[] = [];
  private scanLine: ScanLine | null = null;
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuild();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaTime / 60, 0.05);
    const bodyY = HDR_H;
    this.hexCols.forEach((c) => c.update(dt, bodyY));
    this.graphs.forEach((g) => g.update(dt));
    this.wireframes.forEach((wf) => wf.update(dt));
    this.tels.forEach((t) => t.update(dt));
    this.readouts.forEach((r) => r.update(dt));
    this.streams.forEach((s) => s.update(dt));
    this.scanLine?.update(dt, this.h);
  }

  public override destroy(): void {
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
    super.destroy({ children: true });
  }

  private rebuild(): void {
    this.removeChildren();
    this.hexCols = [];
    this.graphs = [];
    this.wireframes = [];
    this.tels = [];
    this.readouts = [];
    this.streams = [];
    if (this.clockInterval !== null) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }

    const W = this.w;
    const H = this.h;
    const L_W = Math.min(Math.floor(W * 0.2), 260);
    const R_W = Math.min(Math.floor(W * 0.2), 260);
    const MID_X = L_W;
    const MID_W = W - L_W - R_W;
    const BODY_Y = HDR_H;
    const BODY_H = H - HDR_H;

    // Background grid
    const grid = new Graphics();
    const sp = 55;
    for (let x = 0; x <= W; x += sp) grid.moveTo(x, 0).lineTo(x, H);
    for (let y = 0; y <= H; y += sp) grid.moveTo(0, y).lineTo(W, y);
    grid.stroke({ color: C_DIM, alpha: 0.55, width: 0.4 });
    this.addChild(grid);

    // Hex columns
    for (let x = MID_X + 10; x < MID_X + MID_W - 80; x += 72) {
      const col = new HexColumn(x, BODY_Y, BODY_H);
      this.addChild(col.con);
      this.hexCols.push(col);
    }

    // Header
    this.clockInterval = buildHeader(this, W) as unknown as ReturnType<
      typeof setInterval
    >;

    // Left: 3 line graphs
    const GRAPH_CFG = [
      { lbl: "CPU USAGE", freq: 0.35, phase: 0.0 },
      { lbl: "MEM USAGE", freq: 0.27, phase: 1.3 },
      { lbl: "NET  I/O ", freq: 0.52, phase: 2.6 },
    ];
    const graphRowH = Math.floor((BODY_H - 16) / GRAPH_CFG.length);
    this.graphs = GRAPH_CFG.map((cfg, i) => {
      const g = new LineGraphPanel(
        L_W - 10,
        graphRowH - 5,
        cfg.lbl,
        cfg.freq,
        cfg.phase,
      );
      g.x = 5;
      g.y = BODY_Y + 5 + i * graphRowH;
      this.addChild(g);
      return g;
    });

    // Right: two telemetry panels
    const TEL_DEFS = [
      {
        title: "■  TELEMETRY",
        rows: [
          { label: "RENDER" },
          { label: "SHADER" },
          { label: "BUFFER" },
          { label: "VRAM  " },
          { label: "DRAW  " },
        ],
        hFrac: 0.46,
      },
      {
        title: "■  SYSTEM   ",
        rows: [
          { label: "THREAD" },
          { label: "QUEUE " },
          { label: "CACHE " },
          { label: "DISK  " },
        ],
        hFrac: 0.41,
      },
    ];
    let telOffY = BODY_Y + 5;
    this.tels = TEL_DEFS.map((def) => {
      const ph = Math.floor(BODY_H * def.hFrac);
      const p = new TelemetryPanel(R_W - 10, ph, def.title, def.rows);
      p.x = W - R_W + 5;
      p.y = telOffY;
      this.addChild(p);
      telOffY += ph + 8;
      return p;
    });

    // Right: floating hex readouts
    let roY = telOffY + 4;
    this.readouts = ["0xADDR", "0xOFFSET"].map((lbl) => {
      const ro = new FloatingReadout(R_W - 10, 35, lbl);
      ro.x = W - R_W + 5;
      ro.y = roY;
      this.addChild(ro);
      roY += 42;
      return ro;
    });

    // Center: wireframe shapes
    const WF_CFG = [
      {
        x: MID_X + MID_W * 0.3,
        y: BODY_Y + BODY_H * 0.44,
        size: 52,
        type: "cube" as const,
      },
      {
        x: MID_X + MID_W * 0.68,
        y: BODY_Y + BODY_H * 0.46,
        size: 42,
        type: "icosahedron" as const,
      },
    ];
    this.wireframes = WF_CFG.map((cfg) => {
      const wf = new WireframeShape(cfg.size, cfg.type);
      wf.x = cfg.x;
      wf.y = cfg.y;
      this.addChild(wf);
      return wf;
    });

    // Data streams
    this.streams = [
      new DataStream(
        L_W + 5,
        BODY_Y + BODY_H * 0.42,
        WF_CFG[0].x,
        WF_CFG[0].y,
        7,
      ),
      new DataStream(WF_CFG[0].x, WF_CFG[0].y, WF_CFG[1].x, WF_CFG[1].y, 9),
      new DataStream(
        WF_CFG[1].x,
        WF_CFG[1].y,
        W - R_W - 5,
        BODY_Y + BODY_H * 0.42,
        7,
      ),
    ];
    this.streams.forEach((s) => {
      this.addChild(s.lineG);
      this.addChild(s.dotG);
    });

    // Scan line
    this.scanLine = new ScanLine(W);
    this.addChild(this.scanLine.g);

    // Side vignettes
    const vig = new Graphics();
    vig.rect(0, 0, L_W, H).fill({ color: 0x000000, alpha: 0.18 });
    vig.rect(W - R_W, 0, R_W, H).fill({ color: 0x000000, alpha: 0.18 });
    this.addChild(vig);
  }
}
