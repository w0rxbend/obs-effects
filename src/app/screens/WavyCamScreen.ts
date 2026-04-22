import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const CATT_MAUVE = 0xcba6f7;
const CATT_BLUE = 0x89b4fa;
const CATT_TEAL = 0x94e2d5;
const CATT_SKY = 0x89dceb;
const CATT_SAPPHIRE = 0x74c7ec;
const CATT_LAVENDER = 0xb4befe;

const PALETTE = [
  CATT_MAUVE,
  CATT_BLUE,
  CATT_TEAL,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
] as const;

// ── Configuration ─────────────────────────────────────────────────────────────
const WEBCAM_R = 250;
const N_RINGS = 8;
const RING_SPACING = 20;

export class WavyCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world: Container;
  private readonly wavyGfx = new Graphics();
  private readonly maskGfx = new Graphics();

  private time = 0;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    // Wavy rings container
    this.world.addChild(this.wavyGfx);

    // We don't actually need a mask if we want it transparent for OBS
    // OBS "transparent background" usually means the canvas is transparent.
    // The "circled camera frame" is just a decoration around where the user
    // will place their camera in OBS.
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.02;

    const g = this.wavyGfx;
    g.clear();

    for (let i = 0; i < N_RINGS; i++) {
      const baseR = WEBCAM_R + i * RING_SPACING;
      const color = PALETTE[i % PALETTE.length];
      const alpha = 1 - (i / N_RINGS) * 0.8;
      // Inner rings (i=0) are very bold, outer rings (i=7) are thinner
      const weight = 14.0 - (i / N_RINGS) * 12.0;

      // Each ring has slightly different wave properties
      const freq = 4 + (i % 3);
      const amp = 8 + i * 2;
      const phase = this.time * (1 + i * 0.1);
      const direction = i % 2 === 0 ? 1 : -1;

      this.drawWavyCircle(
        g,
        0,
        0,
        baseR,
        amp,
        freq,
        phase * direction,
        color,
        alpha,
        weight,
      );
    }

    // Inner sharp rim
    g.circle(0, 0, WEBCAM_R - 2).stroke({
      color: 0xffffff,
      width: 1.5,
      alpha: 0.8,
    });
    g.circle(0, 0, WEBCAM_R + 2).stroke({
      color: PALETTE[0],
      width: 1,
      alpha: 0.4,
    });
  }

  private drawWavyCircle(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    amp: number,
    freq: number,
    phase: number,
    color: number,
    alpha: number,
    weight: number,
  ): void {
    const points: number[] = [];
    const steps = 180;

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      // Modulate radius with a sine wave
      const radialOffset = Math.sin(angle * freq + phase) * amp;
      const currentR = r + radialOffset;

      points.push(
        cx + Math.cos(angle) * currentR,
        cy + Math.sin(angle) * currentR,
      );
    }

    g.poly(points).stroke({
      color,
      width: weight,
      alpha,
      cap: "round",
      join: "round",
    });
  }

  public resize(width: number, height: number): void {
    this.world.x = width * 0.5;
    this.world.y = height * 0.5;
  }
}
