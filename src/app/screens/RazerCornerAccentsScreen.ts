import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import { obsAudio } from "../../lib/obsAudio";
import {
  TOXIC_ACID,
  TOXIC_GREEN,
  TOXIC_LIME,
} from "../../lib/shaders/toxicGreen";

const CORNERS: [number, number, number, number][] = [
  [0, 0, 1, 1],
  [1, 0, -1, 1],
  [0, 1, 1, -1],
  [1, 1, -1, -1],
];

const MOTE_COUNT = 22;

export class RazerCornerAccentsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly brackets = new Graphics();
  private readonly sweep = new Graphics();
  private readonly motes = new Graphics();

  private readonly moteSeeds = new Float32Array(MOTE_COUNT);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private pulse = 0;

  constructor() {
    super();

    for (let i = 0; i < MOTE_COUNT; i++) {
      const s = Math.sin(i * 61.51) * 43758.5453;
      this.moteSeeds[i] = s - Math.floor(s);
    }

    this.addChild(this.sweep);
    this.addChild(this.motes);
    this.addChild(this.brackets);

    void obsAudio.connect();
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    obsAudio.update(dt);

    const target = obsAudio.beat ? 1 : obsAudio.level;
    this.pulse += (target - this.pulse) * Math.min(1, dt * 6);

    this.drawBrackets();
    this.drawSweep();
    this.drawMotes();
  }

  private drawBrackets(): void {
    const margin = Math.min(this.w, this.h) * 0.018 + 8;
    const armLen = Math.min(this.w, this.h) * 0.05 * (1 + this.pulse * 0.18);
    const width = 3 + this.pulse * 1.6;
    const alpha = 0.75 + this.pulse * 0.25;

    this.brackets.clear();

    for (const [sx, sy, dx, dy] of CORNERS) {
      const x = sx * this.w + dx * margin;
      const y = sy * this.h + dy * margin;

      this.brackets
        .moveTo(x, y + dy * armLen)
        .lineTo(x, y)
        .lineTo(x + dx * armLen, y)
        .stroke({ color: TOXIC_LIME, width, alpha });

      this.brackets
        .moveTo(x, y + dy * armLen * 0.42)
        .lineTo(x, y)
        .lineTo(x + dx * armLen * 0.42, y)
        .stroke({ color: TOXIC_ACID, width: width * 1.8, alpha: alpha * 0.5 });
    }
  }

  private drawSweep(): void {
    this.sweep.clear();

    const period = 6.5;
    const local = this.time % period;
    if (local > 1.6) return;

    const y = (local / 1.6) * this.h;
    const fade = 1 - local / 1.6;

    this.sweep
      .rect(0, y - 1.5, this.w, 3)
      .fill({ color: TOXIC_GREEN, alpha: 0.22 * fade });
    this.sweep
      .rect(0, y - 0.5, this.w, 1)
      .fill({ color: TOXIC_LIME, alpha: 0.55 * fade });
  }

  private drawMotes(): void {
    this.motes.clear();

    const bandW = this.w * 0.14;
    const bandH = this.h * 0.14;

    for (let i = 0; i < MOTE_COUNT; i++) {
      const seed = this.moteSeeds[i];
      const corner = i % 4;
      const [sx, sy] = CORNERS[corner];
      const localX =
        ((seed * 7.3 + this.time * (0.05 + seed * 0.1)) % 1) * bandW;
      const localY =
        ((seed * 4.1 + this.time * (0.04 + seed * 0.08)) % 1) * bandH;
      const x = sx * this.w + (sx === 0 ? 1 : -1) * localX;
      const y = sy * this.h + (sy === 0 ? 1 : -1) * localY;
      const twinkle =
        0.4 + 0.6 * Math.sin(this.time * (2 + seed * 3) + seed * 20);
      const r = 1.2 + seed * 1.8;

      this.motes.circle(x, y, r).fill({
        color: TOXIC_LIME,
        alpha: Math.max(0, twinkle) * (0.4 + this.pulse * 0.4),
      });
    }
  }
}
