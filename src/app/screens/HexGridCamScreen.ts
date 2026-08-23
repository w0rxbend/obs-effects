import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { CATT_BLUE, CATT_TEXT, PALETTE, palColor } from "./hex/palette";

// ── Geometry ──────────────────────────────────────────────────────────────────
const WEBCAM_R = 200;
const HEX_SIZE = 24; // circumradius of each hex
const INNER_R = WEBCAM_R - HEX_SIZE * 0.4; // inner edge of hex ring
const OUTER_R = WEBCAM_R + HEX_SIZE * 3.8; // outer edge of hex ring

// Flat-top hex grid spacings
const HEX_W = HEX_SIZE * 1.5; // col step
const HEX_H = HEX_SIZE * Math.sqrt(3); // row step

// ── Types ─────────────────────────────────────────────────────────────────────
interface HexNode {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotV: number;
  homeRot: number;
  dist: number; // distance from origin — drives visual layering
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
export class HexGridCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world: Container;
  private readonly hexGfx: Graphics;
  private readonly shockGfx: Graphics;
  private readonly rimGfx: Graphics;

  private hexagons: HexNode[] = [];
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
    this.rimGfx = new Graphics();
    this.world.addChild(this.shockGfx);
    this.world.addChild(this.hexGfx);
    this.world.addChild(this.rimGfx);

    this._buildGrid();
  }

  // ── Grid generation ───────────────────────────────────────────────────────

  private _buildGrid(): void {
    this.hexagons = [];

    // How many columns/rows we need to cover OUTER_R
    const span = OUTER_R + HEX_SIZE * 2;
    const cols = Math.ceil(span / HEX_W) * 2 + 1;
    const rows = Math.ceil(span / HEX_H) * 2 + 1;

    for (let ci = -cols; ci <= cols; ci++) {
      for (let ri = -rows; ri <= rows; ri++) {
        // Flat-top hex grid world position (centred at 0,0)
        const cx = ci * HEX_W;
        const cy = ri * HEX_H + (ci % 2 !== 0 ? HEX_H * 0.5 : 0);

        const dist = Math.sqrt(cx * cx + cy * cy);
        if (dist < INNER_R || dist > OUTER_R) continue;

        // Colour by angle around the circle so the palette wraps the ring
        const angle = Math.atan2(cy, cx);
        const colorIdx = Math.floor(
          ((angle + Math.PI) / (Math.PI * 2)) * PALETTE.length,
        );
        const homeRot = Math.PI / 6; // flat-top canonical rotation

        this.hexagons.push({
          homeX: cx,
          homeY: cy,
          x: cx,
          y: cy,
          vx: 0,
          vy: 0,
          rot: homeRot + (Math.random() - 0.5) * 0.2,
          rotV: 0,
          homeRot,
          dist,
          color: palColor(colorIdx),
          colorTimer: Math.random() * 200,
          colorInterval: 180 + Math.random() * 240,
        });
      }
    }
  }

  // ── Beat ──────────────────────────────────────────────────────────────────

  private _triggerBeat(): void {
    this.beatPhase = 1.0;
    this.beatColor = palColor(Math.floor(Math.random() * PALETTE.length));

    const mag = 8 + Math.random() * 10;
    for (const h of this.hexagons) {
      const len = h.dist || 1;
      // Hexes closer to the inner edge (circle boundary) get a stronger kick
      const proximity = Math.max(
        0,
        1 - (h.dist - INNER_R) / (OUTER_R - INNER_R),
      );
      const boost = 0.4 + proximity * 1.2;
      h.vx += (h.homeX / len) * mag * boost * (0.5 + Math.random() * 0.8);
      h.vy += (h.homeY / len) * mag * boost * (0.5 + Math.random() * 0.8);
      h.rotV += (Math.random() - 0.5) * 0.3;
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

    this._updateHexagons(dt);
    this._draw();
  }

  private _updateHexagons(dt: number): void {
    const homeK = 0.05;
    const rotK = 0.058;
    const posDamp = 0.83;
    const rotDamp = 0.86;
    const dts = dt * 0.5;

    for (const h of this.hexagons) {
      // Spring back to grid home
      h.vx += (h.homeX - h.x) * homeK;
      h.vy += (h.homeY - h.y) * homeK;

      // Breathing wave — inner hexes breathe more dramatically
      const proximity = Math.max(
        0,
        1 - (h.dist - INNER_R) / (OUTER_R - INNER_R),
      );
      const angle = Math.atan2(h.homeY, h.homeX);
      const breath =
        Math.sin(this.time * 2.1 + angle * 4) * 0.08 * (0.5 + proximity);
      h.vx += -Math.sin(angle) * breath;
      h.vy += Math.cos(angle) * breath;

      // Low turbulence
      h.vx += (Math.random() - 0.5) * 0.18;
      h.vy += (Math.random() - 0.5) * 0.18;

      h.vx *= posDamp;
      h.vy *= posDamp;
      h.x += h.vx * dts;
      h.y += h.vy * dts;

      // Rotation spring
      h.rotV += (h.homeRot - h.rot) * rotK;
      h.rotV += (Math.random() - 0.5) * 0.009;
      h.rotV *= rotDamp;
      h.rot += h.rotV * dts;

      // Colour slowly drifts
      h.colorTimer += dt;
      if (h.colorTimer >= h.colorInterval) {
        h.colorTimer = 0;
        const a = Math.atan2(h.homeY, h.homeX);
        h.color = palColor(
          Math.floor(((a + Math.PI) / (Math.PI * 2)) * PALETTE.length) +
            Math.floor(this.time * 0.25),
        );
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
      sg.stroke({ color: sw.color, width: 18, alpha: sw.alpha * 0.1 });
      sg.circle(0, 0, sw.r);
      sg.stroke({ color: sw.color, width: 2.5, alpha: sw.alpha * 0.65 });
    }

    // Hexagonal honeycomb frame
    const g = this.hexGfx;
    g.clear();

    for (const h of this.hexagons) {
      // Hexes closer to the inner circle edge are more opaque / brighter
      const t = 1 - (h.dist - INNER_R) / (OUTER_R - INNER_R); // 1=inner, 0=outer
      const fillAlpha = 0.12 + t * 0.22 + beat * 0.12;
      const strokeAlpha = 0.55 + t * 0.35 + beat * 0.2;
      const strokeW = 1.0 + t * 0.8 + beat * 0.6;

      this._drawHex(
        g,
        h.x,
        h.y,
        HEX_SIZE,
        h.rot,
        h.color,
        fillAlpha,
        strokeAlpha,
        strokeW,
      );
    }

    // Camera rim
    const r = this.rimGfx;
    r.clear();
    const rimCol = palColor(Math.floor(this.time * 0.45) + 2);
    r.circle(0, 0, WEBCAM_R + 3);
    r.stroke({ color: rimCol, width: 20, alpha: 0.07 + beat * 0.1 });
    r.circle(0, 0, WEBCAM_R + 1);
    r.stroke({ color: CATT_TEXT, width: 3, alpha: 0.9 });
    r.circle(0, 0, WEBCAM_R - 3);
    r.stroke({ color: rimCol, width: 1.5, alpha: 0.28 + beat * 0.2 });
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
      if (i === 0) g.moveTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
      else g.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    }
    g.fill({ color, alpha: fillAlpha });

    for (let i = 0; i <= 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      if (i === 0) g.moveTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
      else g.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    }
    g.stroke({ color, width: strokeW, alpha: strokeAlpha });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.world.x = width * 0.5;
    this.world.y = height * 0.5;
  }
}
