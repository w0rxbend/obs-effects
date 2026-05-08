import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

const TAU = Math.PI * 2;

const C = {
  BG: 0x050d1a,
  CYAN: 0x00d4ff,
  CYAN_DIM: 0x004466,
  WHITE: 0xe0f4ff,
  BLUE: 0x0088cc,
  LIME: 0x7fff00,
  TEAL: 0x00ffcc,
  DIM_BLUE: 0x336688,
} as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Grid ────────────────────────────────────────────────────────────────────

class BlueprintGrid extends Graphics {
  private W = 1920;
  private H = 1080;

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    this.redraw();
  }

  private redraw(): void {
    const cs = 60;
    this.clear();

    this.setStrokeStyle({ width: 0.5, color: C.CYAN, alpha: 0.07 });
    for (let x = 0; x < this.W; x += cs) {
      this.beginPath();
      this.moveTo(x, 0);
      this.lineTo(x, this.H);
      this.stroke();
    }
    for (let y = 0; y < this.H; y += cs) {
      this.beginPath();
      this.moveTo(0, y);
      this.lineTo(this.W, y);
      this.stroke();
    }

    const mcs = cs * 5;
    this.setStrokeStyle({ width: 1, color: C.CYAN, alpha: 0.16 });
    for (let x = 0; x < this.W; x += mcs) {
      this.beginPath();
      this.moveTo(x, 0);
      this.lineTo(x, this.H);
      this.stroke();
    }
    for (let y = 0; y < this.H; y += mcs) {
      this.beginPath();
      this.moveTo(0, y);
      this.lineTo(this.W, y);
      this.stroke();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_ticker: Ticker): void {}
}

// ── Gear ────────────────────────────────────────────────────────────────────

function drawGearTo(
  g: Graphics,
  r: number,
  teeth: number,
  lw: number,
  color: number,
  alpha: number,
): void {
  const toothH = r * 0.22;
  const innerR = r * 0.58;
  const hubR = r * 0.12;

  g.setStrokeStyle({ width: lw, color, alpha });

  g.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU;
    const a1 = ((i + 0.22) / teeth) * TAU;
    const a2 = ((i + 0.78) / teeth) * TAU;
    const a3 = ((i + 1) / teeth) * TAU;
    const pts = [
      [r * Math.cos(a0), r * Math.sin(a0)],
      [(r + toothH) * Math.cos(a1), (r + toothH) * Math.sin(a1)],
      [(r + toothH) * Math.cos(a2), (r + toothH) * Math.sin(a2)],
      [r * Math.cos(a3), r * Math.sin(a3)],
    ] as [number, number][];
    if (i === 0) g.moveTo(...pts[0]);
    for (const p of pts.slice(1)) g.lineTo(...p);
  }
  g.closePath();
  g.stroke();

  g.beginPath();
  g.circle(0, 0, innerR);
  g.stroke();

  g.beginPath();
  g.circle(0, 0, hubR);
  g.stroke();

  const spokes = 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    g.beginPath();
    g.moveTo(hubR * Math.cos(a), hubR * Math.sin(a));
    g.lineTo(innerR * Math.cos(a), innerR * Math.sin(a));
    g.stroke();
  }
}

class GearShape extends Container {
  private speed: number;

  constructor(radius: number, teeth: number, speed: number) {
    super();
    this.speed = speed;

    const glowG = new Graphics();
    drawGearTo(glowG, radius, teeth, 4, C.CYAN, 0.18);
    glowG.scale.set(1.06);
    this.addChild(glowG);

    const g = new Graphics();
    drawGearTo(g, radius, teeth, 1.2, C.BLUE, 0.85);
    this.addChild(g);
  }

  update(ticker: Ticker): void {
    this.rotation += this.speed * ticker.deltaTime;
  }
}

// ── FPV Drone Wireframe ──────────────────────────────────────────────────────

class DroneWireframe extends Container {
  private mainG: Graphics;
  private glowG: Graphics;
  private pulseT = 0;

  constructor() {
    super();
    this.glowG = new Graphics();
    this.mainG = new Graphics();
    this.addChild(this.glowG);
    this.addChild(this.mainG);
  }

  draw(size: number): void {
    this.paintTo(this.glowG, size, 3.5, 0.22);
    this.paintTo(this.mainG, size, 1.5, 1.0);
  }

  private paintTo(
    g: Graphics,
    size: number,
    lw: number,
    alphaMul: number,
  ): void {
    g.clear();
    const armLen = size * 0.44;
    const motorR = size * 0.1;
    const bodyR = size * 0.17;

    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI / 4;
      const tx = Math.cos(a) * armLen;
      const ty = Math.sin(a) * armLen;

      g.setStrokeStyle({
        width: lw * 1.2,
        color: C.WHITE,
        alpha: 0.85 * alphaMul,
      });
      g.beginPath();
      g.moveTo(Math.cos(a) * bodyR * 0.7, Math.sin(a) * bodyR * 0.7);
      g.lineTo(tx, ty);
      g.stroke();

      g.setStrokeStyle({ width: lw, color: C.CYAN, alpha: 0.9 * alphaMul });
      g.beginPath();
      g.circle(tx, ty, motorR);
      g.stroke();

      const pa = a + Math.PI / 2;
      g.setStrokeStyle({
        width: lw * 0.8,
        color: C.WHITE,
        alpha: 0.45 * alphaMul,
      });
      for (const propA of [pa, a]) {
        g.beginPath();
        g.moveTo(
          tx + Math.cos(propA) * motorR * 1.3,
          ty + Math.sin(propA) * motorR * 1.3,
        );
        g.lineTo(
          tx - Math.cos(propA) * motorR * 1.3,
          ty - Math.sin(propA) * motorR * 1.3,
        );
        g.stroke();
      }
    }

    // Body octagon
    g.setStrokeStyle({
      width: lw * 1.3,
      color: C.WHITE,
      alpha: 0.9 * alphaMul,
    });
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const bx = Math.cos(a) * bodyR;
      const by = Math.sin(a) * bodyR;
      if (i === 0) g.moveTo(bx, by);
      else g.lineTo(bx, by);
    }
    g.closePath();
    g.stroke();

    // Cross-brace inside body
    g.setStrokeStyle({
      width: lw * 0.7,
      color: C.BLUE,
      alpha: 0.55 * alphaMul,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * bodyR * 0.85, Math.sin(a) * bodyR * 0.85);
      g.lineTo(
        Math.cos(a + Math.PI) * bodyR * 0.85,
        Math.sin(a + Math.PI) * bodyR * 0.85,
      );
      g.stroke();
    }

    // FC stack outline
    g.setStrokeStyle({
      width: lw * 0.7,
      color: C.BLUE,
      alpha: 0.45 * alphaMul,
    });
    g.beginPath();
    g.rect(-bodyR * 0.32, -bodyR * 0.32, bodyR * 0.64, bodyR * 0.64);
    g.stroke();

    // Camera pod
    const camW = size * 0.08;
    const camH = size * 0.055;
    g.setStrokeStyle({ width: lw, color: C.CYAN, alpha: 0.7 * alphaMul });
    g.beginPath();
    g.rect(-camW, -bodyR - camH * 1.4, camW * 2, camH);
    g.stroke();
    g.beginPath();
    g.circle(0, -bodyR - camH * 0.9, camH * 0.32);
    g.stroke();

    // VTX antenna line
    g.setStrokeStyle({ width: lw * 0.8, color: C.CYAN, alpha: 0.5 * alphaMul });
    g.beginPath();
    g.moveTo(size * 0.06, -bodyR * 0.4);
    g.lineTo(size * 0.06, -bodyR * 1.35);
    g.stroke();

    // Center crosshair
    g.setStrokeStyle({ width: lw * 0.6, color: C.TEAL, alpha: 0.5 * alphaMul });
    g.beginPath();
    g.moveTo(-size * 0.06, 0);
    g.lineTo(size * 0.06, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -size * 0.06);
    g.lineTo(0, size * 0.06);
    g.stroke();
    g.beginPath();
    g.circle(0, 0, size * 0.025);
    g.stroke();
  }

  update(ticker: Ticker): void {
    this.pulseT += ticker.deltaTime * 0.025;
    const pulse = 0.82 + 0.18 * Math.sin(this.pulseT);
    this.mainG.alpha = pulse;
    this.glowG.alpha = 0.18 + 0.14 * Math.sin(this.pulseT * 1.4);
  }
}

// ── CNC Tracer ───────────────────────────────────────────────────────────────

class CncTracer extends Container {
  private trailG = new Graphics();
  private headG = new Graphics();
  private pts: { x: number; y: number }[] = [];
  private t = 0;
  private totalLen = 0;
  private waypoints: { x: number; y: number }[] = [];
  private readonly SPEED = 1.4;
  private readonly TRAIL = 55;

  constructor() {
    super();
    this.addChild(this.trailG);
    this.addChild(this.headG);
  }

  buildPath(cx: number, cy: number, w: number, h: number): void {
    const rows = 12;
    const wps: { x: number; y: number }[] = [];
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    for (let r = 0; r <= rows; r++) {
      const y = cy - h / 2 + (r / rows) * h;
      if (r % 2 === 0) {
        wps.push({ x: x0, y });
        wps.push({ x: x1, y });
      } else {
        wps.push({ x: x1, y });
        wps.push({ x: x0, y });
      }
    }
    this.waypoints = wps;
    this.totalLen = this.computeLen();
  }

  private computeLen(): number {
    let len = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      const dx = this.waypoints[i].x - this.waypoints[i - 1].x;
      const dy = this.waypoints[i].y - this.waypoints[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  private posAt(dist: number): { x: number; y: number } {
    const wps = this.waypoints;
    if (wps.length < 2) return { x: 0, y: 0 };
    let rem = dist % this.totalLen;
    for (let i = 1; i < wps.length; i++) {
      const dx = wps[i].x - wps[i - 1].x;
      const dy = wps[i].y - wps[i - 1].y;
      const seg = Math.sqrt(dx * dx + dy * dy);
      if (rem <= seg) {
        const s = rem / seg;
        return { x: wps[i - 1].x + dx * s, y: wps[i - 1].y + dy * s };
      }
      rem -= seg;
    }
    return wps[wps.length - 1];
  }

  update(ticker: Ticker): void {
    if (this.waypoints.length < 2) return;
    this.t += this.SPEED * ticker.deltaTime;
    const head = this.posAt(this.t);
    this.pts.push(head);
    if (this.pts.length > this.TRAIL) this.pts.shift();

    this.trailG.clear();
    for (let i = 1; i < this.pts.length; i++) {
      const s = i / this.pts.length;
      this.trailG.setStrokeStyle({
        width: clamp(s * 2.2, 0.4, 2),
        color: C.LIME,
        alpha: s * 0.85,
      });
      this.trailG.beginPath();
      this.trailG.moveTo(this.pts[i - 1].x, this.pts[i - 1].y);
      this.trailG.lineTo(this.pts[i].x, this.pts[i].y);
      this.trailG.stroke();
    }

    this.headG.clear();
    this.headG.setFillStyle({ color: C.LIME, alpha: 1 });
    this.headG.beginPath();
    this.headG.circle(head.x, head.y, 3.5);
    this.headG.fill();
    this.headG.setStrokeStyle({ width: 1.5, color: C.LIME, alpha: 0.45 });
    this.headG.beginPath();
    this.headG.circle(head.x, head.y, 8);
    this.headG.stroke();
  }
}

// ── Coordinate Points ────────────────────────────────────────────────────────

class CoordPoints extends Container {
  private g = new Graphics();
  private points: { x: number; y: number; phase: number; speed: number }[] = [];

  constructor() {
    super();
    this.addChild(this.g);
  }

  setup(W: number, H: number): void {
    const cs = 300;
    this.points = [];
    for (let x = cs; x < W; x += cs) {
      for (let y = cs; y < H; y += cs) {
        this.points.push({
          x: x + (Math.random() - 0.5) * 60,
          y: y + (Math.random() - 0.5) * 60,
          phase: Math.random() * TAU,
          speed: 0.02 + Math.random() * 0.02,
        });
      }
    }
  }

  update(ticker: Ticker): void {
    this.g.clear();
    for (const p of this.points) {
      p.phase += p.speed * ticker.deltaTime;
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.phase));
      const sz = 4;
      this.g.setStrokeStyle({ width: 0.8, color: C.TEAL, alpha: pulse * 0.55 });
      this.g.beginPath();
      this.g.moveTo(p.x - sz * 2, p.y);
      this.g.lineTo(p.x + sz * 2, p.y);
      this.g.stroke();
      this.g.beginPath();
      this.g.moveTo(p.x, p.y - sz * 2);
      this.g.lineTo(p.x, p.y + sz * 2);
      this.g.stroke();
      this.g.setFillStyle({ color: C.TEAL, alpha: pulse * 0.7 });
      this.g.beginPath();
      this.g.circle(p.x, p.y, 2);
      this.g.fill();
    }
  }
}

// ── Measurement Lines ─────────────────────────────────────────────────────────

interface DimDef {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  horiz: boolean;
  floatPhase: number;
}

class MeasureLayer extends Container {
  private g = new Graphics();
  private labels: Text[] = [];
  private defs: DimDef[] = [];
  private floatT = 0;

  constructor() {
    super();
    this.addChild(this.g);
  }

  setup(cx: number, cy: number, droneSize: number): void {
    const arm = droneSize * 0.44;
    const style = new TextStyle({
      fill: C.DIM_BLUE,
      fontFamily: "monospace",
      fontSize: 11,
    });

    this.defs = [
      {
        x1: cx - arm * 1.55,
        y1: cy + droneSize * 0.72,
        x2: cx + arm * 1.55,
        y2: cy + droneSize * 0.72,
        label: `${Math.round(arm * 3.1)} mm`,
        horiz: true,
        floatPhase: 0,
      },
      {
        x1: cx - droneSize * 0.9,
        y1: cy - arm * 1.35,
        x2: cx - droneSize * 0.9,
        y2: cy + arm * 1.35,
        label: `${Math.round(arm * 2.7)} mm`,
        horiz: false,
        floatPhase: 2.1,
      },
      {
        x1: cx - arm * 0.72,
        y1: cy - droneSize * 0.85,
        x2: cx + arm * 0.72,
        y2: cy - droneSize * 0.85,
        label: `132 mm`,
        horiz: true,
        floatPhase: 4.4,
      },
    ];

    // Remove old labels
    for (const t of this.labels) this.removeChild(t);
    this.labels = [];
    for (const d of this.defs) {
      const t = new Text({ text: d.label, style });
      t.anchor.set(0.5);
      this.addChild(t);
      this.labels.push(t);
    }
  }

  update(ticker: Ticker): void {
    this.floatT += ticker.deltaTime;
    this.g.clear();

    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i];
      const f = Math.sin(this.floatT * 0.018 + d.floatPhase) * 7;
      let x1 = d.x1,
        y1 = d.y1,
        x2 = d.x2,
        y2 = d.y2;
      if (d.horiz) {
        y1 += f;
        y2 += f;
      } else {
        x1 += f;
        x2 += f;
      }

      const cap = 7;
      const alpha = 0.5;
      this.g.setStrokeStyle({ width: 1, color: C.DIM_BLUE, alpha });
      this.g.beginPath();
      this.g.moveTo(x1, y1);
      this.g.lineTo(x2, y2);
      this.g.stroke();

      if (d.horiz) {
        for (const px of [x1, x2]) {
          this.g.beginPath();
          this.g.moveTo(px, y1 - cap);
          this.g.lineTo(px, y1 + cap);
          this.g.stroke();
        }
        this.g.setStrokeStyle({
          width: 1,
          color: C.DIM_BLUE,
          alpha: alpha * 0.75,
        });
        this.g.beginPath();
        this.g.moveTo(x1 + 9, y1 - 4);
        this.g.lineTo(x1, y1);
        this.g.lineTo(x1 + 9, y1 + 4);
        this.g.stroke();
        this.g.beginPath();
        this.g.moveTo(x2 - 9, y2 - 4);
        this.g.lineTo(x2, y2);
        this.g.lineTo(x2 - 9, y2 + 4);
        this.g.stroke();
      } else {
        for (const py of [y1, y2]) {
          this.g.beginPath();
          this.g.moveTo(x1 - cap, py);
          this.g.lineTo(x1 + cap, py);
          this.g.stroke();
        }
        this.g.setStrokeStyle({
          width: 1,
          color: C.DIM_BLUE,
          alpha: alpha * 0.75,
        });
        this.g.beginPath();
        this.g.moveTo(x1 - 4, y1 + 9);
        this.g.lineTo(x1, y1);
        this.g.lineTo(x1 + 4, y1 + 9);
        this.g.stroke();
        this.g.beginPath();
        this.g.moveTo(x2 - 4, y2 - 9);
        this.g.lineTo(x2, y2);
        this.g.lineTo(x2 + 4, y2 - 9);
        this.g.stroke();
      }

      const t = this.labels[i];
      t.x = d.horiz ? (x1 + x2) / 2 : x1;
      t.y = d.horiz ? y1 - 14 : (y1 + y2) / 2;
    }
  }
}

// ── Corner Data Blocks ────────────────────────────────────────────────────────

const CORNER_LINES = {
  tl: [
    "CRAFT: WB-FPV-01",
    "FC: STM32F745",
    "MOTORS: 2306 2450KV",
    "ESC: 45A BLHELI32",
    "VTX: 5.8GHz 600mW",
    "CAM: 1200TVL 2.1mm",
    "BATT: 4S 1300mAh",
    "WEIGHT: 287g",
  ],
  tr: [
    "TELEMETRY  ACTIVE",
    "RSSI:  89%",
    "LINK:  2.4GHz",
    "LATENCY: 18 ms",
    "BARO:  101.3 kPa",
    "TEMP:  31.2 C",
    "GYRO:  MPU6000",
    "ACC:   ICM20689",
  ],
  bl: [
    "> BETAFLIGHT 4.4.2",
    "> PID AUTOTUNE OK",
    "> RATES: RACE-P1",
    "> RPM FILTER ON",
    "> DSHOT600 ESC",
    "> AIRMODE ACTIVE",
    "> ARMING: AUX1",
    "> FAILSAFE: DROP",
  ],
  br: [
    "ACCEL X:  +0.023",
    "ACCEL Y:  -0.118",
    "ACCEL Z:  +9.807",
    "ROLL:      0.00 deg",
    "PITCH:     0.00 deg",
    "YAW:       0.00 deg",
    "VBAT:    15.89 V",
    "CURR:     0.00 A",
  ],
};

function makeCornerBlock(lines: string[], anchorRight: boolean): Container {
  const c = new Container();
  const style = new TextStyle({
    fill: C.CYAN,
    fontFamily: "monospace",
    fontSize: 11,
  });
  for (let i = 0; i < lines.length; i++) {
    const t = new Text({ text: lines[i], style });
    t.y = i * 16;
    t.alpha = i < 2 ? 0.75 : 0.35;
    if (anchorRight) t.anchor.set(1, 0);
    c.addChild(t);
  }
  return c;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export class FpvBlueprintBgScreen extends Container {
  private bg = new Graphics();
  private grid = new BlueprintGrid();
  private coordPts = new CoordPoints();
  private measure = new MeasureLayer();
  private tracer = new CncTracer();
  private drone = new DroneWireframe();
  private gearL = new GearShape(72, 16, 0.004);
  private gearR = new GearShape(56, 13, -0.006);
  private gearBr = new GearShape(40, 10, 0.009);

  constructor() {
    super();

    this.addChild(this.bg);
    this.addChild(this.grid);
    this.addChild(this.coordPts);
    this.addChild(this.measure);

    this.addChild(this.gearL);
    this.addChild(this.gearR);
    this.addChild(this.gearBr);

    this.addChild(this.tracer);
    this.addChild(this.drone);

    // Corner text blocks
    const PAD = 24;
    const tlBlock = makeCornerBlock(CORNER_LINES.tl, false);
    tlBlock.position.set(PAD, PAD);
    this.addChild(tlBlock);

    const trBlock = makeCornerBlock(CORNER_LINES.tr, true);
    this.addChild(trBlock);
    // positioned in resize

    const blBlock = makeCornerBlock(CORNER_LINES.bl, false);
    this.addChild(blBlock);

    const brBlock = makeCornerBlock(CORNER_LINES.br, true);
    this.addChild(brBlock);

    // Store refs for resize
    (this as unknown as Record<string, unknown>)._trBlock = trBlock;
    (this as unknown as Record<string, unknown>)._blBlock = blBlock;
    (this as unknown as Record<string, unknown>)._brBlock = brBlock;
  }

  resize(W: number, H: number): void {
    const PAD = 24;
    const cx = W / 2;
    const cy = H / 2;
    const droneSize = Math.min(W, H) * 0.28;

    // Background
    this.bg.clear();
    this.bg.setFillStyle({ color: C.BG });
    this.bg.beginPath();
    this.bg.rect(0, 0, W, H);
    this.bg.fill();

    this.grid.resize(W, H);
    this.coordPts.setup(W, H);

    // Drone
    this.drone.position.set(cx, cy);
    this.drone.draw(droneSize);

    // Gears
    this.gearL.position.set(cx - droneSize * 1.1, cy + droneSize * 0.2);
    this.gearR.position.set(cx + droneSize * 1.05, cy - droneSize * 0.15);
    this.gearBr.position.set(cx + droneSize * 1.42, cy + droneSize * 0.55);

    // Tracer path — raster over drone area + margins
    this.tracer.buildPath(cx, cy, droneSize * 1.7, droneSize * 1.3);

    // Measurement lines
    this.measure.setup(cx, cy, droneSize);

    // Corner blocks
    const s = this as unknown as Record<string, Container>;
    (s["_trBlock"] as Container).position.set(W - PAD, PAD);
    (s["_blBlock"] as Container).position.set(PAD, H - PAD - 7 * 16);
    (s["_brBlock"] as Container).position.set(W - PAD, H - PAD - 7 * 16);
  }

  update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaTime, 0.5, 3);
    const fakeTicker = { ...ticker, deltaTime: dt } as Ticker;

    this.grid.update(fakeTicker);
    this.coordPts.update(fakeTicker);
    this.measure.update(fakeTicker);
    this.tracer.update(fakeTicker);
    this.drone.update(fakeTicker);
    this.gearL.update(fakeTicker);
    this.gearR.update(fakeTicker);
    this.gearBr.update(fakeTicker);
  }
}
