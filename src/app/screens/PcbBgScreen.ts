import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ─── Canvas ──────────────────────────────────────────────────────────────────
const W = 1920, H = 1080, CX = W / 2, CY = H / 2;

// ─── Catppuccin Mocha ────────────────────────────────────────────────────────
const CRUST    = 0x11111b;
const MANTLE   = 0x181825;
const BASE     = 0x1e1e2e;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const SURFACE2 = 0x585b70;
const SUBTEXT0 = 0xa6adc8;
const BLUE     = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const TEAL     = 0x94e2d5;
const GREEN    = 0xa6e3a1;
const MAUVE    = 0xcba6f7;
const LAVENDER = 0xb4befe;
const PINK     = 0xf38ba8;
const FLAMINGO = 0xf2cdcd;
const PEACH    = 0xfab387;
const YELLOW   = 0xf9e2af;

// ─── Grid (48 × 45 px cells → 41 × 25 nodes covers 1920 × 1080) ─────────────
const GW = 48, GH = 45;
const COLS = 41, ROWS = 25;

// MCU centre falls exactly on grid node (20,12): 20×48=960, 12×45=540
const MC = 20, MR = 12;
const EXCL = 3; // exclusion radius around MCU in grid cells

// ─── Types ───────────────────────────────────────────────────────────────────
type TraceType = "power" | "gnd" | "signal" | "clock" | "data";

interface Seg {
  x1: number; y1: number; x2: number; y2: number;
  type: TraceType; w: number; len: number;
}

interface Via { x: number; y: number; r: number; flashColor: number; flashFrames: number; }

interface Electron {
  si: number; t: number; dir: 1 | -1;
  pxPerSec: number; color: number; halo: number;
  type: TraceType; pause: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rnd(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }
function rndInt(lo: number, hi: number) { return Math.floor(rnd(lo, hi + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Screen ──────────────────────────────────────────────────────────────────
export class PcbBgScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx  = new Graphics();
  private readonly lblCtr = new Container();
  private readonly eGfx   = new Graphics();

  private active: boolean[]                   = [];
  private segs: Seg[]                         = [];
  private vias: Via[]                         = [];
  private electrons: Electron[]               = [];
  private nodeSegs: Map<string, number[]>     = new Map();

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.lblCtr);
    this.addChild(this.eGfx);
  }

  public async show(): Promise<void>  { this.build(); }
  public async hide(): Promise<void>  {}

  public resize(_w: number, _h: number): void {
    this.bgGfx.clear();
    this.eGfx.clear();
    for (const c of [...this.lblCtr.children]) { this.lblCtr.removeChild(c); c.destroy(); }
    this.active = []; this.segs = []; this.vias = []; this.electrons = [];
    this.nodeSegs.clear();
    this.build();
  }

  // ─── Grid helpers ────────────────────────────────────────────────────────
  private gx(c: number) { return c * GW; }
  private gy(r: number) { return r * GH; }
  private fi(c: number, r: number) { return r * COLS + c; }
  private inBounds(c: number, r: number) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  private inExcl(c: number, r: number) { return Math.abs(c - MC) <= EXCL && Math.abs(r - MR) <= EXCL; }
  private isOn(c: number, r: number): boolean {
    return this.inBounds(c, r) && !!this.active[this.fi(c, r)];
  }
  private nodeKey(c: number, r: number) { return `${c * GW},${r * GH}`; }

  // ─── Master build ────────────────────────────────────────────────────────
  private build(): void {
    const g = this.bgGfx;

    // Background + ground pour haze
    g.rect(0, 0, W, H).fill({ color: CRUST });
    g.rect(0, 0, W, H).fill({ color: SURFACE0, alpha: 0.04 });

    // 1. Activate grid nodes
    this.activateNodes();

    // 2. Trace network (fills segs + nodeSegs)
    this.drawTraces(g);

    // 3. Junction pads at multi-connection nodes
    this.drawJunctions(g);

    // 4. Vias at some junctions
    this.buildVias(g);

    // 5. MCU body + pads
    this.drawMCU(g);

    // 6. Discrete components
    this.drawComponents(g);

    // 7. Silkscreen
    this.buildSilkscreen(g);

    // 8. Atmosphere (scanlines + vignette — drawn last over static content)
    this.buildAtmosphere(g);

    // 9. Spawn electrons
    this.spawnElectrons();
  }

  // ─── Node activation ─────────────────────────────────────────────────────
  private activateNodes(): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.inExcl(c, r)) { this.active.push(false); continue; }
        const border  = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
        const nearMCU = Math.abs(c - MC) === EXCL + 1 || Math.abs(r - MR) === EXCL + 1;
        const prob    = border ? 0.88 : nearMCU ? 0.95 : 0.64;
        this.active.push(Math.random() < prob);
      }
    }
  }

  // ─── Trace network ───────────────────────────────────────────────────────
  private drawTraces(g: Graphics): void {
    const types: TraceType[] = ["signal", "signal", "signal", "power", "gnd", "clock", "data"];

    // Horizontal edges
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        if (!this.isOn(c, r) || !this.isOn(c + 1, r)) continue;
        this.addHSeg(g, c, r, pick(types));
      }
    }

    // Vertical edges
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.isOn(c, r) || !this.isOn(c, r + 1)) continue;
        this.addVSeg(g, c, r, pick(types));
      }
    }

    // Long-span power/ground bus traces (skip one inactive node)
    for (let r = 0; r < ROWS; r += 3) {
      for (let c = 0; c < COLS - 2; c++) {
        if (!this.isOn(c, r) || this.isOn(c + 1, r) || !this.isOn(c + 2, r)) continue;
        if (this.inExcl(c + 1, r)) continue;
        if (Math.random() > 0.22) continue;
        const type: TraceType = pick(["power", "gnd"]);
        const x1 = this.gx(c), x2 = this.gx(c + 2), y = this.gy(r);
        const w = 4;
        g.rect(x1, y - 2, x2 - x1 + w, w).fill({ color: SURFACE1, alpha: 0.85 });
        const si = this.segs.length;
        this.segs.push({ x1, y1: y, x2, y2: y, type, w, len: x2 - x1 });
        this.regSeg(c, r, si);
        this.regSegXY(x2, y, si);
      }
    }
  }

  private addHSeg(g: Graphics, c: number, r: number, type: TraceType): void {
    const x1 = this.gx(c), x2 = this.gx(c + 1), y = this.gy(r);
    const [w, color, alpha] = this.traceStyle(type);
    g.rect(x1, y - Math.ceil(w / 2), x2 - x1 + w, w).fill({ color, alpha });
    const si = this.segs.length;
    this.segs.push({ x1, y1: y, x2, y2: y, type, w, len: x2 - x1 });
    this.regSeg(c, r, si);
    this.regSeg(c + 1, r, si);
  }

  private addVSeg(g: Graphics, c: number, r: number, type: TraceType): void {
    const x = this.gx(c), y1 = this.gy(r), y2 = this.gy(r + 1);
    const [w, color, alpha] = this.traceStyle(type);
    g.rect(x - Math.ceil(w / 2), y1, w, y2 - y1 + w).fill({ color, alpha });
    const si = this.segs.length;
    this.segs.push({ x1: x, y1, x2: x, y2, type, w, len: y2 - y1 });
    this.regSeg(c, r, si);
    this.regSeg(c, r + 1, si);
  }

  private traceStyle(type: TraceType): [number, number, number] {
    switch (type) {
      case "power": case "gnd": return [4, SURFACE1, 0.85];
      case "clock":             return [2, SURFACE0, 0.75];
      case "data":              return [2, SURFACE0, 0.70];
      default:                  return [Math.random() < 0.3 ? 3 : 2, SURFACE0, 0.70];
    }
  }

  private regSeg(c: number, r: number, si: number): void {
    const key = this.nodeKey(c, r);
    const arr = this.nodeSegs.get(key);
    if (arr) arr.push(si); else this.nodeSegs.set(key, [si]);
  }

  private regSegXY(x: number, y: number, si: number): void {
    const key = `${x},${y}`;
    const arr = this.nodeSegs.get(key);
    if (arr) arr.push(si); else this.nodeSegs.set(key, [si]);
  }

  // ─── Junction pads ───────────────────────────────────────────────────────
  private drawJunctions(g: Graphics): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.isOn(c, r)) continue;
        const segsHere = this.nodeSegs.get(this.nodeKey(c, r)) ?? [];
        const n = segsHere.length;
        if (n === 0) continue;
        const x = this.gx(c), y = this.gy(r);
        const s = n >= 3 ? 5 : n === 2 ? 4 : 3;
        g.rect(x - s, y - s, s * 2, s * 2).fill({ color: n >= 2 ? SURFACE2 : SURFACE1, alpha: 0.9 });
      }
    }
  }

  // ─── Vias ────────────────────────────────────────────────────────────────
  private buildVias(g: Graphics): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.isOn(c, r) || this.inExcl(c, r)) continue;
        const n = (this.nodeSegs.get(this.nodeKey(c, r)) ?? []).length;
        if (n < 2 || Math.random() > 0.11) continue;
        const x = this.gx(c), y = this.gy(r);
        const vr = rnd(4, 6);
        this.vias.push({ x, y, r: vr, flashColor: SURFACE2, flashFrames: 0 });
        this.drawVia(g, x, y, vr);
      }
    }
    // Edge stitching rows
    for (const sr of [1, ROWS - 2]) {
      for (let c = 2; c < COLS - 2; c += 2) {
        if (!this.isOn(c, sr)) continue;
        const x = this.gx(c), y = this.gy(sr);
        this.vias.push({ x, y, r: 4, flashColor: SURFACE2, flashFrames: 0 });
        this.drawVia(g, x, y, 4);
      }
    }
    for (const sc of [1, COLS - 2]) {
      for (let r = 2; r < ROWS - 2; r += 2) {
        if (!this.isOn(sc, r)) continue;
        const x = this.gx(sc), y = this.gy(r);
        this.vias.push({ x, y, r: 4, flashColor: SURFACE2, flashFrames: 0 });
        this.drawVia(g, x, y, 4);
      }
    }
  }

  private drawVia(g: Graphics, x: number, y: number, r: number): void {
    g.circle(x, y, r).fill({ color: SURFACE1 });
    g.circle(x, y, r * 0.44).fill({ color: CRUST });
  }

  // ─── Main MCU ────────────────────────────────────────────────────────────
  private drawMCU(g: Graphics): void {
    const SZ = 180, HALF = SZ / 2;
    const PAD_W = 3, PAD_H = 8, PADS = 36;

    // Body
    g.rect(CX - HALF, CY - HALF, SZ, SZ).fill({ color: MANTLE });

    // Surface texture: fine dot grid
    for (let dx = -HALF + 8; dx < HALF; dx += 8) {
      for (let dy = -HALF + 8; dy < HALF; dy += 8) {
        g.circle(CX + dx, CY + dy, 0.5).fill({ color: SURFACE0, alpha: 0.18 });
      }
    }

    // Silkscreen outline + pin 1 marker
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.65 });
    g.rect(CX - HALF - 1, CY - HALF - 1, SZ + 2, SZ + 2).stroke();
    g.rect(CX - HALF + 3, CY - HALF + 3, 8, 8).fill({ color: SUBTEXT0 }); // pin 1 square

    // Pads + trace stubs on all 4 sides
    const span = SZ - 10;
    for (let i = 0; i < PADS; i++) {
      const offset = -span / 2 + (i / (PADS - 1)) * span;

      // Top pads — stub goes up to grid row MR-EXCL-1
      const topPadX = CX + offset;
      const topPadY = CY - HALF - PAD_H;
      g.rect(topPadX - PAD_W / 2, topPadY, PAD_W, PAD_H).fill({ color: SURFACE2 });
      const topGridY = this.gy(MR - EXCL - 1);
      g.rect(topPadX - 1, topGridY, 2, topPadY - topGridY).fill({ color: SURFACE0, alpha: 0.55 });

      // Bottom pads
      const botPadY = CY + HALF;
      g.rect(topPadX - PAD_W / 2, botPadY, PAD_W, PAD_H).fill({ color: SURFACE2 });
      const botGridY = this.gy(MR + EXCL + 1);
      g.rect(topPadX - 1, botPadY + PAD_H, 2, botGridY - botPadY - PAD_H).fill({ color: SURFACE0, alpha: 0.55 });

      // Left pads
      const lPadX = CX - HALF - PAD_H;
      const lPadY = CY + offset;
      g.rect(lPadX, lPadY - PAD_W / 2, PAD_H, PAD_W).fill({ color: SURFACE2 });
      const lGridX = this.gx(MC - EXCL - 1);
      g.rect(lGridX, lPadY - 1, lPadX - lGridX, 2).fill({ color: SURFACE0, alpha: 0.55 });

      // Right pads
      const rPadX = CX + HALF;
      g.rect(rPadX, lPadY - PAD_W / 2, PAD_H, PAD_W).fill({ color: SURFACE2 });
      const rGridX = this.gx(MC + EXCL + 1);
      g.rect(rPadX + PAD_H, lPadY - 1, rGridX - rPadX - PAD_H, 2).fill({ color: SURFACE0, alpha: 0.55 });
    }

    // Labels (added to lblCtr later)
    const u1 = new Text({ text: "U1", style: new TextStyle({ fontSize: 14, fill: SUBTEXT0, fontFamily: "monospace", fontWeight: "bold" }) });
    u1.alpha = 0.7; u1.x = CX - 14; u1.y = CY - HALF - 24;
    this.lblCtr.addChild(u1);

    const pn = new Text({ text: "STM32H743ZIT6", style: new TextStyle({ fontSize: 9, fill: SUBTEXT0, fontFamily: "monospace" }) });
    pn.alpha = 0.55; pn.x = CX - 52; pn.y = CY + HALF + 14;
    this.lblCtr.addChild(pn);
  }

  // ─── Components ──────────────────────────────────────────────────────────
  private drawComponents(g: Graphics): void {
    this.placeResistors(g);
    this.placeCapacitors(g);
    this.placeSOT23s(g);
    this.placeSOIC8s(g);
    this.placeQFP44s(g);
    this.placeEdgeConnectors(g);
    this.placeCrystal(g, CX + GW * 4, CY - GH * 3);
    this.placeVReg(g, CX - GW * 5, GH * 2);
    for (const [c, r] of [[3, 3], [37, 3], [3, 21], [37, 21]] as [number, number][]) {
      this.placeElectrolytic(g, this.gx(c), this.gy(r));
    }
  }

  private placeResistors(g: Graphics): void {
    let n = 0;
    for (let r = 1; r < ROWS - 1 && n < 65; r++) {
      for (let c = 2; c < COLS - 2 && n < 65; c++) {
        if (!this.isOn(c, r) || this.inExcl(c, r)) continue;
        const canH = this.isOn(c - 1, r) && this.isOn(c + 1, r);
        const canV = this.isOn(c, r - 1) && this.isOn(c, r + 1);
        if (canH && Math.random() < 0.18) {
          this.drawResistor(g, this.gx(c), this.gy(r), "H", n + 1);
          n++;
        } else if (canV && Math.random() < 0.12) {
          this.drawResistor(g, this.gx(c), this.gy(r), "V", n + 1);
          n++;
        }
      }
    }
  }

  private placeCapacitors(g: Graphics): void {
    let n = 0;
    for (let r = 1; r < ROWS - 1 && n < 45; r += 2) {
      for (let c = 2; c < COLS - 2 && n < 45; c++) {
        if (!this.isOn(c, r) || this.inExcl(c, r)) continue;
        if (this.isOn(c - 1, r) && Math.random() < 0.14) {
          this.drawCapacitor(g, this.gx(c), this.gy(r), "H", n + 1);
          n++;
        } else if (this.isOn(c, r - 1) && Math.random() < 0.10) {
          this.drawCapacitor(g, this.gx(c), this.gy(r), "V", n + 1);
          n++;
        }
      }
    }
  }

  private placeSOT23s(g: Graphics): void {
    let n = 0;
    for (let r = 3; r < ROWS - 3 && n < 22; r += 3) {
      for (let c = 3; c < COLS - 3 && n < 22; c += 3) {
        if (!this.isOn(c, r) || this.inExcl(c, r) || Math.random() > 0.35) continue;
        this.drawSOT23(g, this.gx(c), this.gy(r));
        n++;
      }
    }
  }

  private placeSOIC8s(g: Graphics): void {
    const positions: [number, number][] = [
      [5, 4], [15, 3], [28, 4], [35, 5],
      [5, 18], [14, 20], [30, 19], [36, 17],
      [8, 11], [33, 12],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [c, r] = positions[i];
      if (this.inExcl(c, r)) continue;
      this.drawSOIC8(g, this.gx(c), this.gy(r), i);
    }
  }

  private placeQFP44s(g: Graphics): void {
    const positions: [number, number, number][] = [
      [5, 5, 10], [35, 5, 11], [5, 19, 12], [35, 19, 13],
    ];
    for (const [c, r, idx] of positions) {
      this.drawQFP44(g, this.gx(c), this.gy(r), idx);
    }
  }

  private placeEdgeConnectors(g: Graphics): void {
    this.drawConnector(g, GW,           H / 2,     "V", 12, "J1");
    this.drawConnector(g, W / 2,        GH,        "H", 14, "J2");
    this.drawConnector(g, W - GW,       H * 0.35,  "V", 10, "J3");
  }

  // ─── Component drawing ───────────────────────────────────────────────────

  private drawResistor(g: Graphics, x: number, y: number, orient: "H" | "V", n: number): void {
    const bw = orient === "H" ? 14 : 5;
    const bh = orient === "H" ? 5  : 14;
    // body (Base fill, Subtext outline)
    g.rect(x - bw / 2, y - bh / 2, bw, bh).fill({ color: BASE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.45 });
    g.rect(x - bw / 2, y - bh / 2, bw, bh).stroke();
    // pads at ±GW/2 or ±GH/2
    const po = orient === "H" ? GW * 0.48 : GH * 0.48;
    const [pw, ph] = orient === "H" ? [7, 9] : [9, 7];
    if (orient === "H") {
      g.rect(x - po - pw / 2, y - ph / 2, pw, ph).fill({ color: SURFACE2 });
      g.rect(x + po - pw / 2, y - ph / 2, pw, ph).fill({ color: SURFACE2 });
    } else {
      g.rect(x - pw / 2, y - po - ph / 2, pw, ph).fill({ color: SURFACE2 });
      g.rect(x - pw / 2, y + po - ph / 2, pw, ph).fill({ color: SURFACE2 });
    }
    // silkscreen refdes
    const t = new Text({ text: `R${n}`, style: new TextStyle({ fontSize: 7, fill: SUBTEXT0, fontFamily: "monospace" }) });
    t.alpha = 0.55;
    t.x = x + (orient === "H" ? -8 : 5);
    t.y = y + (orient === "H" ? 5  : -8);
    this.lblCtr.addChild(t);
  }

  private drawCapacitor(g: Graphics, x: number, y: number, orient: "H" | "V", n: number): void {
    const bw = orient === "H" ? 16 : 6;
    const bh = orient === "H" ? 6  : 16;
    g.rect(x - bw / 2, y - bh / 2, bw, bh).fill({ color: BASE });
    // polarity mark
    g.setStrokeStyle({ width: 1, color: SUBTEXT0, alpha: 0.5 });
    if (orient === "H") {
      g.moveTo(x - bw / 2 + 3, y - bh / 2).lineTo(x - bw / 2 + 3, y + bh / 2).stroke();
    } else {
      g.moveTo(x - bw / 2, y - bh / 2 + 3).lineTo(x + bw / 2, y - bh / 2 + 3).stroke();
    }
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.4 });
    g.rect(x - bw / 2, y - bh / 2, bw, bh).stroke();
    const po = orient === "H" ? GW * 0.48 : GH * 0.48;
    const [pw, ph] = orient === "H" ? [8, 10] : [10, 8];
    if (orient === "H") {
      g.rect(x - po - pw / 2, y - ph / 2, pw, ph).fill({ color: SURFACE2 });
      g.rect(x + po - pw / 2, y - ph / 2, pw, ph).fill({ color: SURFACE2 });
    } else {
      g.rect(x - pw / 2, y - po - ph / 2, pw, ph).fill({ color: SURFACE2 });
      g.rect(x - pw / 2, y + po - ph / 2, pw, ph).fill({ color: SURFACE2 });
    }
    const t = new Text({ text: `C${n}`, style: new TextStyle({ fontSize: 7, fill: SUBTEXT0, fontFamily: "monospace" }) });
    t.alpha = 0.55; t.x = x + 4; t.y = y - 10;
    this.lblCtr.addChild(t);
  }

  private drawSOT23(g: Graphics, x: number, y: number): void {
    g.rect(x - 7, y - 9, 14, 18).fill({ color: BASE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.4 });
    g.rect(x - 7, y - 9, 14, 18).stroke();
    // 3 sharp pads: 2 left, 1 right
    g.rect(x - 17, y - 9, 10, 7).fill({ color: SURFACE2 });
    g.rect(x - 17, y + 2,  10, 7).fill({ color: SURFACE2 });
    g.rect(x + 7,  y - 4,  10, 7).fill({ color: SURFACE2 });
  }

  private drawSOIC8(g: Graphics, x: number, y: number, idx: number): void {
    const BW = 38, BH = 30;
    g.rect(x - BW / 2, y - BH / 2, BW, BH).fill({ color: MANTLE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.55 });
    g.rect(x - BW / 2, y - BH / 2, BW, BH).stroke();
    // pin 1 notch on body
    g.rect(x - BW / 2, y - 5, 4, 10).fill({ color: BASE });
    // 4 pads each side, 7 px pitch
    for (let i = 0; i < 4; i++) {
      const py = y - 10.5 + i * 7;
      g.rect(x - BW / 2 - 10, py - 3, 10, 6).fill({ color: SURFACE2 });
      g.rect(x + BW / 2,      py - 3, 10, 6).fill({ color: SURFACE2 });
    }
    const t = new Text({ text: `U${idx + 2}`, style: new TextStyle({ fontSize: 7, fill: SUBTEXT0, fontFamily: "monospace" }) });
    t.alpha = 0.6; t.x = x - 8; t.y = y - BH / 2 - 10;
    this.lblCtr.addChild(t);
  }

  private drawQFP44(g: Graphics, x: number, y: number, idx: number): void {
    const SZ = 66, HALF = SZ / 2;
    g.rect(x - HALF, y - HALF, SZ, SZ).fill({ color: MANTLE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.55 });
    g.rect(x - HALF, y - HALF, SZ, SZ).stroke();
    g.rect(x - HALF + 3, y - HALF + 3, 7, 7).fill({ color: SUBTEXT0 }); // pin 1 box
    const PADS = 11, span = SZ - 8;
    for (let i = 0; i < PADS; i++) {
      const off = -span / 2 + (i / (PADS - 1)) * span;
      g.rect(x + off - 1.5, y - HALF - 8,  3, 8).fill({ color: SURFACE2 });
      g.rect(x + off - 1.5, y + HALF,       3, 8).fill({ color: SURFACE2 });
      g.rect(x - HALF - 8,  y + off - 1.5,  8, 3).fill({ color: SURFACE2 });
      g.rect(x + HALF,      y + off - 1.5,  8, 3).fill({ color: SURFACE2 });
    }
    const t = new Text({ text: `U${idx}`, style: new TextStyle({ fontSize: 8, fill: SUBTEXT0, fontFamily: "monospace" }) });
    t.alpha = 0.6; t.x = x - 8; t.y = y - HALF - 16;
    this.lblCtr.addChild(t);
  }

  private drawConnector(g: Graphics, x: number, y: number, orient: "H" | "V", pins: number, lbl: string): void {
    const sep = 20;
    const len = (pins - 1) * sep;
    const BW = orient === "H" ? len + 14 : 26;
    const BH = orient === "H" ? 26       : len + 14;
    g.rect(x - BW / 2, y - BH / 2, BW, BH).fill({ color: BASE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.55 });
    g.rect(x - BW / 2, y - BH / 2, BW, BH).stroke();
    for (let i = 0; i < pins; i++) {
      const off = -len / 2 + i * sep;
      const px = orient === "H" ? x + off : x;
      const py = orient === "H" ? y       : y + off;
      g.circle(px, py, 4.5).fill({ color: SURFACE1 });
      g.circle(px, py, 2).fill({ color: CRUST });
    }
    const t = new Text({ text: lbl, style: new TextStyle({ fontSize: 8, fill: SUBTEXT0, fontFamily: "monospace" }) });
    t.alpha = 0.6; t.x = x - 8; t.y = y - BH / 2 - 12;
    this.lblCtr.addChild(t);
  }

  private placeCrystal(g: Graphics, x: number, y: number): void {
    g.rect(x - 15, y - 8, 30, 16).fill({ color: BASE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.5 });
    g.rect(x - 15, y - 8, 30, 16).stroke();
    for (const [ox, oy] of [[-24, -4], [24, -4], [-24, 4], [24, 4]] as [number, number][]) {
      g.rect(x + ox - 4, y + oy - 3, 8, 6).fill({ color: SURFACE2 });
    }
    // load caps
    for (const ox of [-42, 42]) {
      g.rect(x + ox - 10, y - 5, 20, 10).fill({ color: BASE });
      g.rect(x + ox - 18, y - 6, 9, 12).fill({ color: SURFACE2 });
      g.rect(x + ox + 9,  y - 6, 9, 12).fill({ color: SURFACE2 });
    }
    const t = new Text({ text: "Y1", style: new TextStyle({ fontSize: 7, fill: SUBTEXT0, fontFamily: "monospace" }) });
    t.alpha = 0.6; t.x = x - 6; t.y = y - 20;
    this.lblCtr.addChild(t);
  }

  private placeVReg(g: Graphics, x: number, y: number): void {
    g.rect(x - 22, y - 12, 44, 24).fill({ color: BASE });
    g.setStrokeStyle({ width: 0.5, color: SUBTEXT0, alpha: 0.5 });
    g.rect(x - 22, y - 12, 44, 24).stroke();
    for (let i = 0; i < 3; i++) g.rect(x - 18 + i * 18 - 6, y + 12, 12, 10).fill({ color: SURFACE2 });
    g.rect(x - 18, y - 22, 36, 10).fill({ color: SURFACE2 }); // thermal tab
  }

  private placeElectrolytic(g: Graphics, x: number, y: number): void {
    g.circle(x, y, 17).fill({ color: SURFACE1 });
    g.circle(x, y, 10).fill({ color: CRUST });
    g.setStrokeStyle({ width: 1.5, color: SUBTEXT0, alpha: 0.65 });
    g.moveTo(x - 17, y).lineTo(x + 17, y).stroke();
    g.moveTo(x - 8, y - 17).lineTo(x + 8, y - 17).stroke();
  }

  // ─── Silkscreen ──────────────────────────────────────────────────────────
  private buildSilkscreen(g: Graphics): void {
    g.setStrokeStyle({ width: 1, color: SUBTEXT0, alpha: 0.4 });
    g.rect(12, 12, W - 24, H - 24).stroke();

    const addLabel = (text: string, x: number, y: number, size: number, alpha: number) => {
      const t = new Text({ text, style: new TextStyle({ fontSize: size, fill: SUBTEXT0, fontFamily: "monospace" }) });
      t.alpha = alpha; t.x = x; t.y = y;
      this.lblCtr.addChild(t);
    };

    addLabel("PROJECT CORTEX  REV 2.1",     22,       H - 30,  10, 0.5);
    addLabel("CORTEX-H7 EVAL BOARD",        W - 245,  H - 30,  9,  0.4);
    addLabel("STM32H743ZIT6",               W - 165,  22,      8,  0.4);
  }

  // ─── Atmosphere ──────────────────────────────────────────────────────────
  private buildAtmosphere(g: Graphics): void {
    // Subtle scanlines
    for (let y = 0; y < H; y += 3) {
      g.rect(0, y, W, 1).fill({ color: MANTLE, alpha: 0.02 });
    }
    // Vignette — Crust edges
    const STEPS = 20;
    for (let i = 0; i < STEPS; i++) {
      const f = 1 - i / STEPS;
      const a = f * f * 0.38;
      const m = (1 - f) * 280;
      const mh = m * (H / W);
      g.rect(0,     0,     m,  H  ).fill({ color: CRUST, alpha: a * 0.6 });
      g.rect(W - m, 0,     m,  H  ).fill({ color: CRUST, alpha: a * 0.6 });
      g.rect(0,     0,     W,  mh ).fill({ color: CRUST, alpha: a * 0.6 });
      g.rect(0,     H - mh, W, mh ).fill({ color: CRUST, alpha: a * 0.6 });
    }
  }

  // ─── Electron system ─────────────────────────────────────────────────────
  private spawnElectrons(): void {
    for (let i = 0; i < 80; i++) this.spawnOne();
  }

  private eColors(type: TraceType): [number, number] {
    switch (type) {
      case "power":  return [YELLOW,  PEACH];
      case "gnd":    return [BLUE,    SAPPHIRE];
      case "clock":  return [PINK,    FLAMINGO];
      case "data":   return [MAUVE,   LAVENDER];
      default:       return Math.random() < 0.5 ? [GREEN, TEAL] : [TEAL, GREEN];
    }
  }

  private eSpeed(type: TraceType): number {
    switch (type) {
      case "power":  return rnd(80, 120);
      case "gnd":    return rnd(60, 100);
      case "clock":  return rnd(150, 200);
      case "data":   return rnd(100, 150);
      default:       return rnd(40, 80);
    }
  }

  private spawnOne(): void {
    if (this.segs.length === 0) return;
    const si = rndInt(0, this.segs.length - 1);
    const seg = this.segs[si];
    const [color, halo] = this.eColors(seg.type);
    this.electrons.push({
      si, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1,
      pxPerSec: this.eSpeed(seg.type), color, halo, type: seg.type, pause: 0,
    });
  }

  // ─── Frame update ────────────────────────────────────────────────────────
  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS / 1000;
    const g  = this.eGfx;
    g.clear();

    for (const e of this.electrons) {
      if (e.pause > 0) { e.pause -= dt; continue; }

      const seg = this.segs[e.si];
      e.t += (e.pxPerSec / seg.len) * dt * e.dir;

      if (e.t > 1 || e.t < 0) {
        const atEnd = e.t > 1;
        const nx    = atEnd ? seg.x2 : seg.x1;
        const ny    = atEnd ? seg.y2 : seg.y1;
        const adj   = this.nodeSegs.get(`${nx},${ny}`) ?? [];
        const opts  = adj.filter(si => si !== e.si);

        if (opts.length === 0) {
          e.dir   = (-e.dir) as 1 | -1;
          e.t     = Math.max(0, Math.min(1, e.t));
        } else {
          const nsi  = pick(opts);
          const nseg = this.segs[nsi];
          const fromStart = nseg.x1 === nx && nseg.y1 === ny;
          e.si    = nsi;
          e.t     = fromStart ? 0 : 1;
          e.dir   = fromStart ? 1 : -1;
          e.pause = rnd(0, 0.04);
          // flash nearby via
          for (const v of this.vias) {
            if (Math.abs(v.x - nx) < 10 && Math.abs(v.y - ny) < 10) {
              v.flashColor  = e.color;
              v.flashFrames = 3;
            }
          }
        }
      }

      const s  = this.segs[e.si];
      const px = s.x1 + (s.x2 - s.x1) * e.t;
      const py = s.y1 + (s.y2 - s.y1) * e.t;

      g.circle(px, py, 12).fill({ color: e.halo,  alpha: 0.06 });
      g.circle(px, py,  7).fill({ color: e.halo,  alpha: 0.18 });
      g.circle(px, py,  4).fill({ color: e.color, alpha: 0.50 });
      g.circle(px, py,  2).fill({ color: e.color, alpha: 0.90 });
      g.circle(px, py,  1).fill({ color: 0xffffff, alpha: 0.95 });
    }

    // Via flashes
    for (const v of this.vias) {
      if (v.flashFrames > 0) {
        g.circle(v.x, v.y, v.r + 4).fill({ color: v.flashColor, alpha: 0.55 });
        v.flashFrames--;
      }
    }

    // Maintain population
    while (this.electrons.length < 80) this.spawnOne();
    if (this.electrons.length > 105) this.electrons.splice(0, this.electrons.length - 90);
  }
}
