import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { CATT_BLUE, CATT_TEXT, PALETTE, palColor } from "./hex/palette";

// ── Geometry ──────────────────────────────────────────────────────────────────
const WEBCAM_R = 200;
// Each hexagon's circumradius — hex inradius = HEX_R * sqrt(3)/2 ≈ HEX_R * 0.866
// Keep inradius > WEBCAM_R so the fill covers the camera area
const HEX_R = 262;
// N layers covering full 60° hex symmetry → appears circular
const N = 18;
const ROT_STEP = Math.PI / 3 / N; // 10° for N=18

// ── Types ─────────────────────────────────────────────────────────────────────
interface HexLayer {
  homeRot: number;
  rot: number;
  rotV: number;
  homeR: number;
  r: number;
  rV: number;
  color: number;
  colorTimer: number;
  colorInterval: number;
}

interface Shockwave {
  r: number;
  alpha: number;
  color: number;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class HexLayerCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world: Container;
  private readonly shockGfx: Graphics;
  private readonly hexGfx: Graphics;
  private readonly holeGfx: Graphics; // erases the camera area
  private readonly rimGfx: Graphics;

  private layers: HexLayer[] = [];
  private shockwaves: Shockwave[] = [];

  private time = 0;
  private beatTimer = 0;
  private beatInterval = 130;
  private beatPhase = 0;
  private beatColor = CATT_BLUE;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    this.shockGfx = new Graphics();
    this.hexGfx = new Graphics();
    this.holeGfx = new Graphics();
    this.rimGfx = new Graphics();

    // Punch the transparent camera circle through all hex fills
    this.holeGfx.blendMode = "erase";

    this.world.addChild(this.shockGfx);
    this.world.addChild(this.hexGfx);
    this.world.addChild(this.holeGfx);
    this.world.addChild(this.rimGfx);

    this._initLayers();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _initLayers(): void {
    this.layers = [];
    for (let i = 0; i < N; i++) {
      const homeRot = i * ROT_STEP;
      // Slight radial stagger — inner/middle/outer layers overlap in depth
      const homeR = HEX_R + ((i % 3) - 1) * 7;
      this.layers.push({
        homeRot,
        rot: homeRot + (Math.random() - 0.5) * 0.08,
        rotV: 0,
        homeR,
        r: homeR,
        rV: 0,
        color: palColor(i + 1),
        colorTimer: Math.random() * 200,
        colorInterval: 180 + Math.random() * 240,
      });
    }
  }

  // ── Beat ──────────────────────────────────────────────────────────────────

  private _triggerBeat(): void {
    this.beatPhase = 1.0;
    this.beatColor = palColor(Math.floor(Math.random() * PALETTE.length));

    for (const lay of this.layers) {
      lay.rV += 5 + Math.random() * 7;
      lay.rotV += (Math.random() - 0.5) * 0.22;
    }

    this.shockwaves.push({ r: WEBCAM_R, alpha: 0.8, color: this.beatColor });
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
    this.beatPhase = Math.max(0, this.beatPhase - dt * 0.04);

    this._updateLayers(dt);
    this._draw();
  }

  private _updateLayers(dt: number): void {
    const rotK = 0.055;
    const rK = 0.06;
    const rotDamp = 0.86;
    const rDamp = 0.84;
    const dts = dt * 0.5;

    for (const lay of this.layers) {
      // Rotation spring + jitter (vibration)
      lay.rotV += (lay.homeRot - lay.rot) * rotK;
      lay.rotV += (Math.random() - 0.5) * 0.012;
      lay.rotV *= rotDamp;
      lay.rot += lay.rotV * dts;

      // Radial spring + jitter
      lay.rV += (lay.homeR - lay.r) * rK;
      lay.rV += (Math.random() - 0.5) * 0.14;
      lay.rV *= rDamp;
      lay.r += lay.rV * dts;

      // Slow colour drift
      lay.colorTimer += dt;
      if (lay.colorTimer >= lay.colorInterval) {
        lay.colorTimer = 0;
        lay.color = palColor(Math.floor(Math.random() * PALETTE.length));
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private _draw(): void {
    const beat = this.beatPhase;

    // Shockwaves
    const sg = this.shockGfx;
    sg.clear();
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += 3.2;
      sw.alpha = Math.max(0, sw.alpha - 0.022);
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      sg.circle(0, 0, sw.r + 8);
      sg.stroke({ color: sw.color, width: 20, alpha: sw.alpha * 0.1 });
      sg.circle(0, 0, sw.r);
      sg.stroke({ color: sw.color, width: 2.5, alpha: sw.alpha * 0.65 });
    }

    // N hexagons — low fill alpha accumulates to solid ring, edges form circle
    const g = this.hexGfx;
    g.clear();
    for (const lay of this.layers) {
      this._drawHex(
        g,
        lay.r,
        lay.rot,
        lay.color,
        0.1 + beat * 0.04, // fill alpha per layer
        0.6 + beat * 0.25, // stroke alpha
        1.4 + beat * 0.8, // stroke width
      );
    }

    // Erase camera hole — punches through all accumulated hex fills
    const h = this.holeGfx;
    h.clear();
    h.circle(0, 0, WEBCAM_R);
    h.fill({ color: 0xffffff, alpha: 1 });

    // Rim drawn on top of eraser to restore the clean border line
    const r = this.rimGfx;
    r.clear();
    const rimCol = palColor(Math.floor(this.time * 0.45) + 3);
    r.circle(0, 0, WEBCAM_R + 2);
    r.stroke({ color: rimCol, width: 20, alpha: 0.07 + beat * 0.1 });
    r.circle(0, 0, WEBCAM_R + 1);
    r.stroke({ color: CATT_TEXT, width: 3, alpha: 0.9 });
    r.circle(0, 0, WEBCAM_R - 3);
    r.stroke({ color: rimCol, width: 1.5, alpha: 0.25 + beat * 0.18 });
  }

  private _drawHex(
    g: Graphics,
    circumR: number,
    rot: number,
    color: number,
    fillAlpha: number,
    strokeAlpha: number,
    strokeW: number,
  ): void {
    // Fill
    for (let i = 0; i <= 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      if (i === 0) g.moveTo(Math.cos(a) * circumR, Math.sin(a) * circumR);
      else g.lineTo(Math.cos(a) * circumR, Math.sin(a) * circumR);
    }
    g.fill({ color, alpha: fillAlpha });

    // Stroke
    for (let i = 0; i <= 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      if (i === 0) g.moveTo(Math.cos(a) * circumR, Math.sin(a) * circumR);
      else g.lineTo(Math.cos(a) * circumR, Math.sin(a) * circumR);
    }
    g.stroke({ color, width: strokeW, alpha: strokeAlpha });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.world.x = width * 0.5;
    this.world.y = height * 0.5;
  }
}
