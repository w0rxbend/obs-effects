import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { clamp, TAU } from "../../lib/math";

const HALF_PI = Math.PI * 0.5;

// White-on-blueprint palette
const C = {
  BG: 0x030912,
  GRID: 0xffffff,
  GLOBE_DEEP: 0x3a5068,
  GLOBE_MID: 0x8aacbd,
  GLOBE_FRONT: 0xffffff,
  DOT: 0xd8eaf5,
  DOT_HIGHLIGHT: 0xffffff,
  PARTICLE: 0xa8c8d8,
  ANNOT: 0x3d5566,
  ANNOT_HI: 0x6a8ea0,
} as const;

const LAT_STEPS = 22;
const LON_STEPS = 40;
const FOCAL = 2100;
const ROT_SPEED = 0.11;
const BASE_TILT = -0.4;
const POLAR_INSET = 0.1;
const PARTICLE_COUNT = 65;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface MeshNode {
  lat: number;
  lon: number;
  phase: number;
}

interface Proj {
  x: number;
  y: number;
  z: number;
  depth: number;
  wave: number;
  elevation: number;
  crest: number;
}

interface Seg {
  a: Proj;
  b: Proj;
  depth: number;
  strength: number;
}

interface OrbitDot {
  lat: number;
  lon: number;
  radial: number;
  phase: number;
  drift: number;
  size: number;
  baseAlpha: number;
}

// ── Blueprint Grid & Frame ─────────────────────────────────────────────────────

class BlueprintGrid extends Graphics {
  private W = 1920;
  private H = 1080;

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    this.redraw();
  }

  private redraw(): void {
    this.clear();
    const { W, H } = this;

    // Fine grid
    this.setStrokeStyle({ width: 0.5, color: C.GRID, alpha: 0.05 });
    for (let x = 0; x <= W; x += 50) {
      this.beginPath();
      this.moveTo(x, 0);
      this.lineTo(x, H);
      this.stroke();
    }
    for (let y = 0; y <= H; y += 50) {
      this.beginPath();
      this.moveTo(0, y);
      this.lineTo(W, y);
      this.stroke();
    }

    // Major grid
    this.setStrokeStyle({ width: 0.8, color: C.GRID, alpha: 0.11 });
    for (let x = 0; x <= W; x += 250) {
      this.beginPath();
      this.moveTo(x, 0);
      this.lineTo(x, H);
      this.stroke();
    }
    for (let y = 0; y <= H; y += 250) {
      this.beginPath();
      this.moveTo(0, y);
      this.lineTo(W, y);
      this.stroke();
    }

    // Outer border frame
    const m = 18;
    this.setStrokeStyle({ width: 1.2, color: C.GRID, alpha: 0.38 });
    this.beginPath();
    this.rect(m, m, W - m * 2, H - m * 2);
    this.stroke();

    // Inner border (inset)
    this.setStrokeStyle({ width: 0.5, color: C.GRID, alpha: 0.14 });
    this.beginPath();
    this.rect(m + 5, m + 5, W - (m + 5) * 2, H - (m + 5) * 2);
    this.stroke();

    // Tick marks
    this.setStrokeStyle({ width: 0.8, color: C.GRID, alpha: 0.28 });
    for (let x = 50; x < W; x += 50) {
      const tl = x % 250 === 0 ? 10 : 5;
      this.beginPath();
      this.moveTo(x, m);
      this.lineTo(x, m + tl);
      this.stroke();
      this.beginPath();
      this.moveTo(x, H - m);
      this.lineTo(x, H - m - tl);
      this.stroke();
    }
    for (let y = 50; y < H; y += 50) {
      const tl = y % 250 === 0 ? 10 : 5;
      this.beginPath();
      this.moveTo(m, y);
      this.lineTo(m + tl, y);
      this.stroke();
      this.beginPath();
      this.moveTo(W - m, y);
      this.lineTo(W - m - tl, y);
      this.stroke();
    }

    // Corner L-brackets
    const bLen = 44;
    const bm = m + 10;
    this.setStrokeStyle({ width: 1.8, color: C.GRID, alpha: 0.46 });
    for (const [cx, cy, sx, sy] of [
      [bm, bm, 1, 1],
      [W - bm, bm, -1, 1],
      [bm, H - bm, 1, -1],
      [W - bm, H - bm, -1, -1],
    ] as [number, number, number, number][]) {
      this.beginPath();
      this.moveTo(cx + sx * bLen, cy);
      this.lineTo(cx, cy);
      this.lineTo(cx, cy + sy * bLen);
      this.stroke();
    }

    // Center axis lines (very faint)
    this.setStrokeStyle({ width: 0.4, color: C.GRID, alpha: 0.06 });
    this.beginPath();
    this.moveTo(W / 2, m);
    this.lineTo(W / 2, H - m);
    this.stroke();
    this.beginPath();
    this.moveTo(m, H / 2);
    this.lineTo(W - m, H / 2);
    this.stroke();
  }

  update(_ticker: Ticker): void {}
}

// ── Pulsing Coordinate Labels ─────────────────────────────────────────────────

class CoordLabels extends Container {
  private items: { t: Text; phase: number; spd: number }[] = [];

  setup(W: number, H: number): void {
    for (const l of this.items) this.removeChild(l.t);
    this.items = [];

    const style = new TextStyle({
      fill: C.ANNOT,
      fontFamily: "monospace",
      fontSize: 10,
    });

    const pts = [
      { x: W * 0.11, y: H * 0.3, txt: "00.24" },
      { x: W * 0.86, y: H * 0.17, txt: "88.12" },
      { x: W * 0.07, y: H * 0.62, txt: "CNC_PATH" },
      { x: W * 0.89, y: H * 0.73, txt: "34.76" },
      { x: W * 0.74, y: H * 0.87, txt: "CNC_PATH" },
      { x: W * 0.16, y: H * 0.84, txt: "12.55" },
      { x: W * 0.93, y: H * 0.45, txt: "77.03" },
      { x: W * 0.04, y: H * 0.5, txt: "CNC_PATH" },
      { x: W * 0.5, y: H * 0.055, txt: "REF_01" },
      { x: W * 0.5, y: H * 0.935, txt: "REF_02" },
    ];

    for (const p of pts) {
      const t = new Text({ text: p.txt, style });
      t.anchor.set(0.5);
      t.position.set(p.x, p.y);
      this.addChild(t);
      this.items.push({
        t,
        phase: Math.random() * TAU,
        spd: 0.012 + Math.random() * 0.018,
      });
    }
  }

  update(ticker: Ticker): void {
    for (const l of this.items) {
      l.phase += l.spd * ticker.deltaTime;
      l.t.alpha = 0.22 + 0.18 * Math.sin(l.phase);
    }
  }
}

// ── Corner Text Blocks ────────────────────────────────────────────────────────

function makeBlock(lines: string[], anchorRight: boolean): Container {
  const c = new Container();
  const style = new TextStyle({
    fill: C.ANNOT_HI,
    fontFamily: "monospace",
    fontSize: 11,
  });
  for (let i = 0; i < lines.length; i++) {
    const t = new Text({ text: lines[i], style });
    t.y = i * 15;
    t.alpha = i === 0 ? 0.68 : 0.33;
    if (anchorRight) t.anchor.set(1, 0);
    c.addChild(t);
  }
  return c;
}

const TL = [
  "SCHEMATIC: WB-GLOBE-03",
  "REV 2.1 / 2026-05-08",
  "PROJ: ORTHOGRAPHIC",
  "SCALE: 1:1",
  "RENDERER: PIXI.JS 8",
  "OVERLAY: OBS STUDIO",
];
const TR = [
  "TELEMETRY  ACTIVE",
  `ROT: ${ROT_SPEED.toFixed(2)} rad/s`,
  `LAT RINGS: ${LAT_STEPS}`,
  `LON SEGS:  ${LON_STEPS}`,
  `FOCAL:  ${FOCAL}`,
  `TILT:  ${BASE_TILT} rad`,
];
const BL = [
  "> WAVE LAYERS: 3",
  "> ELEVATION: ON",
  "> TOPO CONTOURS: ON",
  `> PARTICLES: ${PARTICLE_COUNT}`,
  "> DEPTH SORT: ON",
  "> AURA HALO: ON",
];
const BR = [
  "SWELL:    PRIMARY",
  "CROSS:    ACTIVE",
  "RELIEF:   DYNAMIC",
  "CREST:    COMPUTED",
  "ELEV:     WARPED",
  "MESH:     FLUID",
];

// ── Fluid Globe ───────────────────────────────────────────────────────────────

class FluidGlobe extends Container {
  private gfx = new Graphics();
  private mesh: MeshNode[][] = [];

  private _w = 1920;
  private _h = 1080;
  private _time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildMesh();
  }

  get r(): number {
    return Math.min(this._w, this._h) * 0.36;
  }
  get cx(): number {
    return this._w * 0.5;
  }
  get cy(): number {
    return this._h * 0.5;
  }
  get rotation(): number {
    return this._time * ROT_SPEED;
  }
  get tilt(): number {
    return BASE_TILT + Math.sin(this._time * 0.36) * 0.06;
  }
  get twist(): number {
    return Math.sin(this._time * 0.16) * 0.11;
  }

  resize(w: number, h: number): void {
    this._w = w;
    this._h = h;
  }

  update(ticker: Ticker): void {
    this._time += Math.min(ticker.deltaMS * 0.001, 0.05);
    this.draw();
  }

  private buildMesh(): void {
    this.mesh.length = 0;
    for (let li = 0; li <= LAT_STEPS; li++) {
      const lat =
        -HALF_PI + POLAR_INSET + ((Math.PI - POLAR_INSET * 2) * li) / LAT_STEPS;
      const ring: MeshNode[] = [];
      for (let lo = 0; lo < LON_STEPS; lo++) {
        ring.push({
          lat,
          lon: (TAU * lo) / LON_STEPS,
          phase: ((li * 0.37 + lo * 0.21) % 1) * TAU,
        });
      }
      this.mesh.push(ring);
    }
  }

  private projectNode(node: MeshNode): Proj {
    const t = this._time;
    const rot = this.rotation;
    const wobble = Math.sin(t * 0.36) * 0.06;
    const tw = this.twist;

    const latFlow =
      Math.sin(node.lon * 1.8 - t * 0.45 + node.phase) * 0.028 +
      Math.cos(node.lat * 3.6 + t * 0.3 - node.phase) * 0.018;
    const lonFlow =
      Math.cos(node.lat * 2.8 - t * 0.34 + node.phase) * 0.032 +
      Math.sin(node.lon * 1.9 + t * 0.26) * 0.014;

    const wLat = clamp(node.lat + latFlow, -HALF_PI + 0.02, HALF_PI - 0.02);
    const wLon = node.lon + lonFlow;

    const pSwell =
      Math.sin(
        wLon * 1.65 - t * 0.48 + Math.sin(wLat * 2.1 + node.phase) * 0.45,
      ) * 0.7;
    const sSwell =
      Math.sin((wLon + wLat * 0.82) * 2.3 - t * 0.34 + node.phase * 0.7) * 0.45;
    const cross = Math.cos(wLat * 3.4 + t * 0.22 - node.phase * 0.55) * 0.28;

    const baseWave = pSwell + sSwell + cross;
    const crest = Math.max(0, pSwell * 0.72 + sSwell * 0.2);
    const micro =
      Math.sin(wLon * 8.4 - t * 0.95 + node.phase * 1.3) *
      (0.004 + crest * 0.006);
    const trough = Math.min(0, baseWave) * 0.012;
    const elevation = baseWave * 0.032 + crest * crest * 0.03 + micro + trough;

    const eq = 0.6 + Math.cos(wLat) * 0.4;
    const wave = baseWave * 0.03 + crest * 0.035 + micro * 3;
    const radius = this.r * (1 + elevation * eq);

    const sx = Math.cos(wLat) * Math.cos(wLon);
    const sy = Math.sin(wLat);
    const sz = Math.cos(wLat) * Math.sin(wLon);

    const x1 = sx * Math.cos(rot) - sz * Math.sin(rot);
    const z1 = sx * Math.sin(rot) + sz * Math.cos(rot);

    const y2 =
      sy * Math.cos(BASE_TILT + wobble) - z1 * Math.sin(BASE_TILT + wobble);
    const z2 =
      sy * Math.sin(BASE_TILT + wobble) + z1 * Math.cos(BASE_TILT + wobble);

    const x3 = x1 * Math.cos(tw) - y2 * Math.sin(tw);
    const y3 = x1 * Math.sin(tw) + y2 * Math.cos(tw);

    const scale = FOCAL / (FOCAL - z2 * radius);
    const depth = clamp((z2 + 1) * 0.5, 0, 1);

    return {
      x: this._w * 0.5 + x3 * radius * scale,
      y: this._h * 0.5 - y3 * radius * scale,
      z: z2,
      depth,
      wave,
      elevation,
      crest,
    };
  }

  private projectPole(latSign: -1 | 1, ring: Proj[]): Proj {
    const wobble = Math.sin(this._time * 0.36) * 0.06;
    const tw = this.twist;

    let wave = 0,
      elevation = 0,
      crest = 0;
    for (const n of ring) {
      wave += n.wave;
      elevation += n.elevation;
      crest += n.crest;
    }
    const cnt = ring.length || 1;
    wave /= cnt;
    elevation /= cnt;
    crest /= cnt;

    const radius = this.r * (1 + elevation * 0.62);
    const y2 = latSign * Math.cos(BASE_TILT + wobble);
    const z2 = latSign * Math.sin(BASE_TILT + wobble);
    const x3 = -y2 * Math.sin(tw);
    const y3 = y2 * Math.cos(tw);

    const scale = FOCAL / (FOCAL - z2 * radius);
    const depth = clamp((z2 + 1) * 0.5, 0, 1);

    return {
      x: this._w * 0.5 + x3 * radius * scale,
      y: this._h * 0.5 - y3 * radius * scale,
      z: z2,
      depth,
      wave,
      elevation,
      crest,
    };
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    // Subtle aura glow behind sphere
    const { cx, cy, r } = this;
    g.setFillStyle({ color: 0x1a2d42, alpha: 0.09 });
    g.beginPath();
    g.circle(cx, cy, r * 1.22);
    g.fill();
    g.setFillStyle({ color: 0x2a4560, alpha: 0.06 });
    g.beginPath();
    g.circle(cx, cy, r * 1.06);
    g.fill();

    const projected = this.mesh.map((ring) =>
      ring.map((n) => this.projectNode(n)),
    );
    const sPole = this.projectPole(-1, projected[0]);
    const nPole = this.projectPole(1, projected[projected.length - 1]);

    const segs: Seg[] = [];
    const dots: Proj[] = [sPole, nPole];

    for (let li = 0; li < this.mesh.length; li++) {
      for (let lo = 0; lo < this.mesh[li].length; lo++) {
        const cur = projected[li][lo];
        const east = projected[li][(lo + 1) % LON_STEPS];

        dots.push(cur);
        segs.push({
          a: cur,
          b: east,
          depth: (cur.z + east.z) * 0.5,
          strength: 0.8,
        });

        if (li < LAT_STEPS) {
          const south = projected[li + 1][lo];
          const se = projected[li + 1][(lo + 1) % LON_STEPS];
          segs.push({
            a: cur,
            b: south,
            depth: (cur.z + south.z) * 0.5,
            strength: 1,
          });
          if ((li + lo) % 2 === 0) {
            segs.push({
              a: cur,
              b: se,
              depth: (cur.z + se.z) * 0.5,
              strength: 0.42,
            });
          }
        } else {
          segs.push({
            a: cur,
            b: nPole,
            depth: (cur.z + nPole.z) * 0.5,
            strength: 0.96,
          });
        }
        if (li === 0) {
          segs.push({
            a: cur,
            b: sPole,
            depth: (cur.z + sPole.z) * 0.5,
            strength: 0.96,
          });
        }
      }
    }

    segs.sort((a, b) => a.depth - b.depth);
    dots.sort((a, b) => a.z - b.z);

    // Mesh lines — white, depth-faded
    for (const seg of segs) {
      const depth = clamp((seg.depth + 1) * 0.5, 0, 1);
      const we = Math.abs(seg.a.wave + seg.b.wave) * 0.5;
      const relief = Math.abs(seg.a.elevation - seg.b.elevation);
      const alpha = clamp(
        (0.04 + depth * 0.52 + we * 0.9 + relief * 2.4) * seg.strength,
        0,
        1,
      );
      const width = 0.3 + depth * 0.9 + we * 0.55 + relief * 5;

      let color: number;
      if (depth > 0.72) color = C.GLOBE_FRONT;
      else if (depth > 0.38) color = C.GLOBE_MID;
      else color = C.GLOBE_DEEP;

      g.moveTo(seg.a.x, seg.a.y)
        .lineTo(seg.b.x, seg.b.y)
        .stroke({ color, width, alpha });
    }

    // Dots at nodes
    for (const dot of dots) {
      const glow = Math.max(0, dot.crest * 0.85 + dot.elevation * 3.5);
      const lift = Math.max(0, dot.elevation);
      const dotR = 0.55 + dot.depth * 1.4 + lift * 16 + glow * 3;
      const dotA = clamp(0.1 + dot.depth * 0.72 + lift * 2, 0, 1);

      g.setFillStyle({ color: C.DOT, alpha: dotA * (0.06 + glow * 0.4) });
      g.beginPath();
      g.circle(dot.x, dot.y, dotR * 2.2);
      g.fill();

      g.setFillStyle({ color: C.DOT, alpha: Math.min(0.92, dotA) });
      g.beginPath();
      g.circle(dot.x, dot.y, dotR);
      g.fill();

      if (dot.depth > 0.6 || lift > 0.005) {
        g.setFillStyle({
          color: C.DOT_HIGHLIGHT,
          alpha: Math.min(0.9, 0.07 + dot.depth * 0.36 + glow * 3 + lift * 6),
        });
        g.beginPath();
        g.circle(dot.x, dot.y, dotR * 0.3);
        g.fill();
      }
    }
  }
}

// ── Orbit Particles ───────────────────────────────────────────────────────────

class OrbitParticles extends Container {
  private g = new Graphics();
  private dots: OrbitDot[] = [];

  constructor() {
    super();
    this.addChild(this.g);
  }

  spawn(): void {
    this.dots = Array.from({ length: PARTICLE_COUNT }, () => {
      const r = Math.random();
      let lat: number;
      if (r < 0.55) {
        lat = (Math.random() - 0.5) * 1.0;
      } else {
        lat = (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.65);
      }
      return {
        lat: clamp(lat, -HALF_PI * 0.88, HALF_PI * 0.88),
        lon: Math.random() * TAU,
        radial: 0.04 + Math.random() * 0.16,
        phase: Math.random() * TAU,
        drift: (Math.random() - 0.5) * 0.005,
        size: 1.0 + Math.random() * 2.2,
        baseAlpha: 0.25 + Math.random() * 0.55,
      };
    });
  }

  update(ticker: Ticker, globe: FluidGlobe): void {
    const g = this.g;
    g.clear();

    const { cx, cy, r, rotation, tilt, twist } = globe;

    for (const d of this.dots) {
      d.lon += d.drift * ticker.deltaTime;
      d.phase += 0.02 * ticker.deltaTime;

      const pulsedR = r * (1 + d.radial + 0.015 * Math.sin(d.phase));

      const sx = Math.cos(d.lat) * Math.cos(d.lon);
      const sy = Math.sin(d.lat);
      const sz = Math.cos(d.lat) * Math.sin(d.lon);

      // Y-axis rotation
      const x1 = sx * Math.cos(rotation) - sz * Math.sin(rotation);
      const z1 = sx * Math.sin(rotation) + sz * Math.cos(rotation);

      // X-axis tilt
      const y2 = sy * Math.cos(tilt) - z1 * Math.sin(tilt);
      const z2 = sy * Math.sin(tilt) + z1 * Math.cos(tilt);

      // Z-axis twist
      const x3 = x1 * Math.cos(twist) - y2 * Math.sin(twist);
      const y3 = x1 * Math.sin(twist) + y2 * Math.cos(twist);

      const scale = FOCAL / (FOCAL - z2 * pulsedR);
      const px = cx + x3 * pulsedR * scale;
      const py = cy - y3 * pulsedR * scale;
      const depth = clamp((z2 + 1) * 0.5, 0, 1);

      const alpha =
        d.baseAlpha * (0.15 + depth * 0.85) * (0.55 + 0.45 * Math.sin(d.phase));

      g.circle(px, py, d.size * 2.8).fill({
        color: C.PARTICLE,
        alpha: alpha * 0.14,
      });
      g.circle(px, py, d.size).fill({ color: C.PARTICLE, alpha });
    }
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export class BlueprintGlobeScreen extends Container {
  public static assetBundles: string[] = [];

  private bg = new Graphics();
  private grid = new BlueprintGrid();
  private labels = new CoordLabels();
  private globe = new FluidGlobe();
  private particles = new OrbitParticles();

  private tlBlock!: Container;
  private trBlock!: Container;
  private blBlock!: Container;
  private brBlock!: Container;

  constructor() {
    super();
    this.addChild(this.bg);
    this.addChild(this.grid);
    this.addChild(this.labels);
    this.addChild(this.globe);
    this.addChild(this.particles);

    this.tlBlock = makeBlock(TL, false);
    this.trBlock = makeBlock(TR, true);
    this.blBlock = makeBlock(BL, false);
    this.brBlock = makeBlock(BR, true);
    this.addChild(this.tlBlock);
    this.addChild(this.trBlock);
    this.addChild(this.blBlock);
    this.addChild(this.brBlock);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public async hide(): Promise<void> {}

  public resize(W: number, H: number): void {
    const PAD = 30;

    this.bg.clear();
    this.bg.setFillStyle({ color: C.BG });
    this.bg.beginPath();
    this.bg.rect(0, 0, W, H);
    this.bg.fill();

    this.grid.resize(W, H);
    this.globe.resize(W, H);
    this.particles.spawn();
    this.labels.setup(W, H);

    this.tlBlock.position.set(PAD, PAD);
    this.trBlock.position.set(W - PAD, PAD);
    this.blBlock.position.set(PAD, H - PAD - (BL.length - 1) * 15);
    this.brBlock.position.set(W - PAD, H - PAD - (BR.length - 1) * 15);
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaTime, 0.5, 3);
    const ft = { ...ticker, deltaTime: dt } as Ticker;

    this.globe.update(ft);
    this.particles.update(ft, this.globe);
    this.labels.update(ft);
  }
}
