import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { CATT_BLUE, CATT_TEXT, PALETTE, palColor } from "./hex/palette";

// ── Geometry ──────────────────────────────────────────────────────────────────
const WEBCAM_R = 200;

// Layer definitions: orbit radius, hex count, hex size, ring rotation offset, palette start
const LAYERS = [
  { r: WEBCAM_R + 14, n: 20, size: 14, offset: 0, ci: 0 },
  { r: WEBCAM_R + 30, n: 20, size: 16, offset: Math.PI / 20, ci: 4 },
  { r: WEBCAM_R + 50, n: 22, size: 17, offset: Math.PI / 11, ci: 8 },
  { r: WEBCAM_R + 72, n: 22, size: 16, offset: (Math.PI / 22) * 1.5, ci: 2 },
  { r: WEBCAM_R + 94, n: 18, size: 15, offset: Math.PI / 9, ci: 6 },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface HexNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  homeAngle: number;
  rot: number;
  rotV: number;
  homeRot: number;
  size: number;
  color: number;
  colorTimer: number;
  colorInterval: number;
  layer: number;
}

interface Shockwave {
  r: number;
  alpha: number;
  color: number;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class HexCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world: Container;
  private readonly shockGfx: Graphics;
  private readonly hexGfx: Graphics;
  private readonly rimGfx: Graphics;

  private hexagons: HexNode[] = [];
  private shockwaves: Shockwave[] = [];

  private time = 0;
  private beatTimer = 0;
  private beatInterval = 135;
  private beatPhase = 0;
  private beatColor = CATT_BLUE;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    this.shockGfx = new Graphics();
    this.hexGfx = new Graphics();
    this.rimGfx = new Graphics();
    this.world.addChild(this.shockGfx);
    this.world.addChild(this.hexGfx);
    this.world.addChild(this.rimGfx);

    this._initHexagons();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _initHexagons(): void {
    for (let li = 0; li < LAYERS.length; li++) {
      const lay = LAYERS[li];
      for (let i = 0; i < lay.n; i++) {
        const angle = (i / lay.n) * Math.PI * 2 + lay.offset;
        const hx = Math.cos(angle) * lay.r;
        const hy = Math.sin(angle) * lay.r;
        // Home rotation: point one flat edge toward center + tiny random offset
        const homeRot = angle + Math.PI / 6 + (Math.random() - 0.5) * 0.25;

        this.hexagons.push({
          x: hx,
          y: hy,
          vx: 0,
          vy: 0,
          homeX: hx,
          homeY: hy,
          homeAngle: angle,
          rot: homeRot + (Math.random() - 0.5) * 0.5,
          rotV: 0,
          homeRot,
          size: lay.size + (Math.random() - 0.5) * 3,
          color: palColor(lay.ci + i),
          colorTimer: Math.random() * 180,
          colorInterval: 160 + Math.random() * 220,
          layer: li,
        });
      }
    }
  }

  // ── Beat ──────────────────────────────────────────────────────────────────

  private _triggerBeat(): void {
    this.beatPhase = 1.0;
    this.beatColor = palColor(Math.floor(Math.random() * PALETTE.length));

    const mag = 9 + Math.random() * 9;
    for (const h of this.hexagons) {
      const len = Math.sqrt(h.homeX * h.homeX + h.homeY * h.homeY) || 1;
      // Outer layers get kicked harder so the frame "blooms" outward
      const layerBoost = 0.6 + h.layer * 0.2;
      h.vx += (h.homeX / len) * mag * layerBoost * (0.5 + Math.random() * 0.8);
      h.vy += (h.homeY / len) * mag * layerBoost * (0.5 + Math.random() * 0.8);
      h.rotV += (Math.random() - 0.5) * 0.35;
    }

    this.shockwaves.push({
      r: WEBCAM_R + 5,
      alpha: 0.75,
      color: this.beatColor,
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      this.beatTimer = this.beatInterval * (0.75 + Math.random() * 0.5);
      this._triggerBeat();
    }
    this.beatPhase = Math.max(0, this.beatPhase - dt * 0.038);

    this._updateHexagons(dt);
    this._draw();
  }

  private _updateHexagons(dt: number): void {
    const homeK = 0.048;
    const rotK = 0.055;
    const posDamp = 0.84;
    const rotDamp = 0.87;
    const dts = dt * 0.5;

    for (const h of this.hexagons) {
      // Radial spring back to home position
      h.vx += (h.homeX - h.x) * homeK;
      h.vy += (h.homeY - h.y) * homeK;

      // Breathing sine wave — each layer breathes at a different phase
      const breath =
        Math.sin(this.time * 2.0 + h.homeAngle * 3 + h.layer * 0.8) * 0.07;
      h.vx += -Math.sin(h.homeAngle) * breath;
      h.vy += Math.cos(h.homeAngle) * breath;

      // Constant low turbulence for vibration feel
      h.vx += (Math.random() - 0.5) * 0.2;
      h.vy += (Math.random() - 0.5) * 0.2;

      h.vx *= posDamp;
      h.vy *= posDamp;
      h.x += h.vx * dts;
      h.y += h.vy * dts;

      // Rotation spring
      h.rotV += (h.homeRot - h.rot) * rotK;
      h.rotV += (Math.random() - 0.5) * 0.01;
      h.rotV *= rotDamp;
      h.rot += h.rotV * dts;

      // Slowly cycle color
      h.colorTimer += dt;
      if (h.colorTimer >= h.colorInterval) {
        h.colorTimer = 0;
        h.color = palColor(Math.floor(Math.random() * PALETTE.length));
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private _draw(): void {
    const beat = this.beatPhase;

    // ── Shockwaves ───────────────────────────────────────────────────────────
    const sg = this.shockGfx;
    sg.clear();
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += 3.0;
      sw.alpha = Math.max(0, sw.alpha - 0.024);
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      sg.circle(0, 0, sw.r + 7);
      sg.stroke({ color: sw.color, width: 16, alpha: sw.alpha * 0.1 });
      sg.circle(0, 0, sw.r);
      sg.stroke({ color: sw.color, width: 2.5, alpha: sw.alpha * 0.65 });
    }

    // ── Hexagons (layer 0 first = behind, layer 4 last = in front) ───────────
    const g = this.hexGfx;
    g.clear();

    for (const h of this.hexagons) {
      // Deeper layers are more transparent so stacking reads clearly
      const depthFade = 0.5 + h.layer * 0.12;
      const fillAlpha = (0.18 + beat * 0.1) * depthFade;
      const strokeAlpha = (0.7 + beat * 0.3) * depthFade;
      const strokeW = 1.2 + h.layer * 0.2 + beat * 0.8;

      this._drawHex(
        g,
        h.x,
        h.y,
        h.size,
        h.rot,
        h.color,
        fillAlpha,
        strokeAlpha,
        strokeW,
      );
    }

    // ── Camera rim ───────────────────────────────────────────────────────────
    const r = this.rimGfx;
    r.clear();

    const rimCol = palColor(Math.floor(this.time * 0.4) + 1);
    r.circle(0, 0, WEBCAM_R + 3);
    r.stroke({ color: rimCol, width: 18, alpha: 0.06 + beat * 0.08 });
    r.circle(0, 0, WEBCAM_R + 1);
    r.stroke({ color: CATT_TEXT, width: 2.5, alpha: 0.85 });
    r.circle(0, 0, WEBCAM_R - 3);
    r.stroke({ color: rimCol, width: 1, alpha: 0.22 + beat * 0.18 });
  }

  private _drawHex(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    rot: number,
    color: number,
    fillAlpha: number,
    strokeAlpha: number,
    strokeW: number,
  ): void {
    for (let i = 0; i <= 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * size;
      const y = cy + Math.sin(a) * size;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill({ color, alpha: fillAlpha });

    for (let i = 0; i <= 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * size;
      const y = cy + Math.sin(a) * size;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke({ color, width: strokeW, alpha: strokeAlpha });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.world.x = width * 0.5;
    this.world.y = height * 0.5;
  }
}
