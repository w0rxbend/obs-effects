import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TOXIC_GREEN = 0x39ff14;

const WEBCAM_R = 200;
const INNER_R  = WEBCAM_R + 4;
const WAVE_R   = WEBCAM_R + 28;

// ── Types ──────────────────────────────────────────────────────────────────
interface WaveNode {
  x: number; y: number;
  vx: number; vy: number;
  homeAngle: number;
}

// ── Screen ─────────────────────────────────────────────────────────────────
export class WaveCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world:     Container;
  private readonly borderGfx: Graphics;
  private readonly bandGfx:   Graphics;

  private waveNodes: WaveNode[] = [];

  private time = 0;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    this.borderGfx = new Graphics();
    this.bandGfx   = new Graphics();
    this.world.addChild(this.borderGfx);
    this.world.addChild(this.bandGfx);

    this._initWaveRing(this.waveNodes, WAVE_R, 80);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _initWaveRing(nodes: WaveNode[], radius: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      nodes.push({
        x: Math.cos(a) * radius,
        y: Math.sin(a) * radius,
        vx: 0, vy: 0,
        homeAngle: a,
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this._drawBorder();
    this._stepWavePhysics(this.waveNodes, WAVE_R, dt, 2.8, 0.36);
    this._drawBand();
  }

  private _drawBorder(): void {
    const g = this.borderGfx;
    g.clear();

    g.circle(0, 0, INNER_R + 4);
    g.stroke({ color: TOXIC_GREEN, width: 12, alpha: 0.12 });

    g.circle(0, 0, INNER_R);
    g.stroke({ color: TOXIC_GREEN, width: 3, alpha: 0.90 });

    g.circle(0, 0, WEBCAM_R - 2);
    g.stroke({ color: TOXIC_GREEN, width: 1.5, alpha: 0.30 });
  }

  private _stepWavePhysics(
    nodes:    WaveNode[],
    radius:   number,
    dt:       number,
    waveFreq: number,
    waveAmp:  number,
  ): void {
    const N         = nodes.length;
    const radialK   = 0.052;
    const neighborK = 0.11;
    const damping   = 0.81;
    const dts       = dt * 0.5;
    const restL     = 2 * radius * Math.sin(Math.PI / N);

    for (let i = 0; i < N; i++) {
      const n    = nodes[i];
      const prev = nodes[(i - 1 + N) % N];
      const next = nodes[(i + 1) % N];

      const homeX = Math.cos(n.homeAngle) * radius;
      const homeY = Math.sin(n.homeAngle) * radius;
      n.vx += (homeX - n.x) * radialK;
      n.vy += (homeY - n.y) * radialK;

      for (const nb of [prev, next]) {
        const dx   = nb.x - n.x;
        const dy   = nb.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const err  = dist - restL;
        n.vx += (dx / dist) * err * neighborK;
        n.vy += (dy / dist) * err * neighborK;
      }

      n.vx += (Math.random() - 0.5) * 0.75;
      n.vy += (Math.random() - 0.5) * 0.75;

      const wave = Math.sin(this.time * waveFreq + n.homeAngle * 5) * waveAmp;
      n.vx += -Math.sin(n.homeAngle) * wave;
      n.vy +=  Math.cos(n.homeAngle) * wave;

      n.vx *= damping; n.vy *= damping;
      n.x  += n.vx * dts;
      n.y  += n.vy * dts;
    }
  }

  private _drawBand(): void {
    const g     = this.bandGfx;
    const outer = this.waveNodes;
    const NO    = outer.length;
    const color = TOXIC_GREEN;

    g.clear();

    // Outer glow
    g.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i <= NO; i++) g.lineTo(outer[i % NO].x, outer[i % NO].y);
    g.stroke({ color, width: 22, alpha: 0.18 });

    // Bold core line
    g.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i <= NO; i++) g.lineTo(outer[i % NO].x, outer[i % NO].y);
    g.stroke({ color, width: 6, alpha: 0.90 });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.world.x = width  * 0.5;
    this.world.y = height * 0.5;
  }
}
