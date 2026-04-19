import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const W    = 800;
const H    = 800;
const CX   = W / 2;
const CY   = H / 2;
const CAM_R = 220;

const MAUVE    = 0xcba6f7;
const LAVENDER = 0xb4befe;
const SAPPHIRE = 0x74c7ec;

interface PlasmaParticle {
  angle:   number;
  rOffset: number;
  size:    number;
  phase:   number;
  freq:    number; // rad/ms
  color:   number;
}

export class CamFrameOverlayScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly coronaLayer = new Container();
  private readonly ringsLayer  = new Container();
  private readonly plasmaLayer = new Container();

  private ring1!: Container;
  private ring2!: Container;
  private plasmaGraphics!: Graphics;

  private plasma: PlasmaParticle[] = [];
  private elapsed = 0;
  private ready   = false;

  constructor() {
    super();
    this.addChild(this.coronaLayer);
    this.addChild(this.ringsLayer);
    this.addChild(this.plasmaLayer);
  }

  public async show(): Promise<void> {
    this.buildCorona();
    this.buildRings();
    this.buildPlasmaData();
    this.plasmaGraphics = new Graphics();
    this.plasmaLayer.addChild(this.plasmaGraphics);
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;
    this.elapsed += time.deltaMS;
    this.tickCorona();
    this.tickRings(time.deltaMS);
    this.tickPlasma();
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width  - W) / 2);
    this.y = Math.round((height - H) / 2);
  }

  // ── Layer 1: Corona ──────────────────────────────────────────────────────

  private buildCorona(): void {
    const g     = new Graphics();
    const OUTER = 480;
    const STEP  = 2;
    const RINGS = (OUTER - CAM_R) / STEP;

    for (let i = 0; i <= RINGS; i++) {
      const r     = CAM_R + i * STEP;
      const t     = i / RINGS;
      const alpha = Math.exp(-5 * t) * 0.9;
      if (alpha < 0.005) continue;
      g.circle(CX, CY, r).stroke({ color: MAUVE, alpha, width: 2.5 });
    }

    this.coronaLayer.addChild(g);
  }

  private tickCorona(): void {
    const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * this.elapsed) / 4000);
    this.coronaLayer.alpha = 0.25 + 0.75 * breath;
  }

  // ── Layer 2: Geometric rings ─────────────────────────────────────────────

  private buildRings(): void {
    this.ring1 = this.makeRingContainer();
    const g1   = new Graphics();
    this.drawGeometricCircle(g1, 300, 1.5);
    this.drawTicks(g1, 300);
    this.ring1.addChild(g1);

    this.ring2 = this.makeRingContainer();
    const g2   = new Graphics();
    this.drawGeometricCircle(g2, 320, 0.8);
    this.drawTicksSimple(g2, 320, 5, 10);
    this.ring2.addChild(g2);

    this.ringsLayer.addChild(this.ring1, this.ring2);
  }

  private makeRingContainer(): Container {
    const c = new Container();
    c.pivot.set(CX, CY);
    c.position.set(CX, CY);
    return c;
  }

  private drawGeometricCircle(g: Graphics, r: number, width: number): void {
    const pts: number[] = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(CX + Math.cos(a) * r, CY + Math.sin(a) * r);
    }
    g.poly(pts, true).stroke({ color: LAVENDER, width, alpha: 0.7 });
  }

  private drawTicks(g: Graphics, r: number): void {
    for (let deg = 0; deg < 360; deg += 5) {
      let len   = 6;
      let width = 1.0;
      if      (deg % 90 === 0) { len = 20; width = 2.0; }
      else if (deg % 45 === 0) { len = 12; width = 1.5; }

      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      g.moveTo(CX + cos * r, CY + sin * r)
       .lineTo(CX + cos * (r + len), CY + sin * (r + len))
       .stroke({ color: LAVENDER, width, alpha: 0.7 });
    }
  }

  private drawTicksSimple(g: Graphics, r: number, len: number, everyDeg: number): void {
    for (let deg = 0; deg < 360; deg += everyDeg) {
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      g.moveTo(CX + cos * r, CY + sin * r)
       .lineTo(CX + cos * (r + len), CY + sin * (r + len))
       .stroke({ color: LAVENDER, width: 1, alpha: 0.7 });
    }
  }

  private tickRings(deltaMS: number): void {
    const dt = deltaMS / 1000;
    this.ring1.rotation += (3   * Math.PI / 180) * dt;
    this.ring2.rotation -= (1.5 * Math.PI / 180) * dt;
  }

  // ── Layer 3: Plasma ──────────────────────────────────────────────────────

  private buildPlasmaData(): void {
    const COUNT = 180;
    for (let i = 0; i < COUNT; i++) {
      let color: number;
      if      (i % 20 === 0)       color = SAPPHIRE;
      else if (Math.random() < 0.5) color = MAUVE;
      else                          color = LAVENDER;

      this.plasma.push({
        angle:   (i / COUNT) * Math.PI * 2,
        rOffset: (Math.random() * 2 - 1) * 6,
        size:    5 + Math.random() * 4,
        phase:   Math.random() * Math.PI * 2,
        freq:    (0.5 + Math.random() * 1.5) * (Math.PI * 2) / 1000,
        color,
      });
    }
  }

  private tickPlasma(): void {
    const g           = this.plasmaGraphics;
    const brightPulse = 0.5 + 0.5 * Math.sin((2 * Math.PI * this.elapsed) / 3000);

    g.clear();

    for (const p of this.plasma) {
      const wave  = Math.sin(p.phase + p.freq * this.elapsed);
      const t     = 0.5 + 0.5 * wave;
      const scale = 0.3 + 0.7 * t;
      const alpha = (0.3 + 0.7 * t) * (0.6 + 0.4 * brightPulse);
      const r     = CAM_R + p.rOffset;
      const x     = CX + Math.cos(p.angle) * r;
      const y     = CY + Math.sin(p.angle) * r;

      g.circle(x, y, p.size * scale).fill({ color: p.color, alpha });
    }
  }
}
