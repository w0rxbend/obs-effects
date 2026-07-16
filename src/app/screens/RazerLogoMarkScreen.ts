import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import { obsAudio } from "../../lib/obsAudio";
import {
  TOXIC_ACID,
  TOXIC_GREEN,
  TOXIC_LIME,
} from "../../lib/shaders/toxicGreen";

const TAU = Math.PI * 2;
const ORBIT_COUNT = 9;

function hexPoint(
  cx: number,
  cy: number,
  r: number,
  i: number,
  rot: number,
): [number, number] {
  const a = rot + (i / 6) * TAU;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

export class RazerLogoMarkScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly glow = new Graphics();
  private readonly mark = new Graphics();
  private readonly orbit = new Graphics();

  private readonly orbitSeeds = new Float32Array(ORBIT_COUNT);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private pulse = 0;

  constructor() {
    super();

    for (let i = 0; i < ORBIT_COUNT; i++) {
      const s = Math.sin(i * 53.71) * 43758.5453;
      this.orbitSeeds[i] = s - Math.floor(s);
    }

    this.addChild(this.glow);
    this.addChild(this.mark);
    this.addChild(this.orbit);

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

    this.draw();
  }

  private draw(): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const baseR = Math.min(this.w, this.h) * 0.11;
    const r = baseR * (1 + this.pulse * 0.08);
    const rot = this.time * 0.12;

    this.glow.clear();
    for (let ring = 3; ring >= 1; ring--) {
      this.glow.circle(cx, cy, r * (1 + ring * 0.22)).stroke({
        color: TOXIC_GREEN,
        width: 1.4,
        alpha: (0.09 + this.pulse * 0.08) / ring,
      });
    }

    this.mark.clear();

    // Hexagon frame.
    const hex: [number, number][] = [];
    for (let i = 0; i < 6; i++) hex.push(hexPoint(cx, cy, r, i, rot));
    this.mark
      .poly(hex.flat())
      .stroke({ color: TOXIC_LIME, width: 3, alpha: 0.85 + this.pulse * 0.15 });

    // Inner angular fang glyph.
    const innerR = r * 0.56;
    const p1 = hexPoint(cx, cy, innerR, 0, rot + 0.5);
    const p2 = hexPoint(cx, cy, innerR * 0.15, 1.5, rot + 0.5);
    const p3 = hexPoint(cx, cy, innerR, 3, rot + 0.5);
    const p4 = hexPoint(cx, cy, innerR * 0.15, 4.5, rot + 0.5);
    this.mark
      .poly([...p1, ...p2, ...p3, ...p4])
      .fill({ color: TOXIC_ACID, alpha: 0.22 + this.pulse * 0.3 })
      .stroke({ color: TOXIC_ACID, width: 2, alpha: 0.9 });

    // Core dot.
    this.mark
      .circle(cx, cy, r * 0.06 * (1 + this.pulse * 0.6))
      .fill({ color: 0xf0fff2, alpha: 0.9 });

    this.orbit.clear();
    for (let i = 0; i < ORBIT_COUNT; i++) {
      const speed = 0.25 + this.orbitSeeds[i] * 0.4;
      const a = this.time * speed + this.orbitSeeds[i] * TAU;
      const orbitR = r * (1.55 + 0.25 * Math.sin(this.time * 0.4 + i));
      const x = cx + Math.cos(a) * orbitR;
      const y = cy + Math.sin(a) * orbitR;
      const s = 1.6 + this.pulse * 1.6;
      this.orbit.circle(x, y, s).fill({
        color: TOXIC_LIME,
        alpha: 0.5 + 0.4 * Math.sin(this.time * 2 + i),
      });
    }
  }
}
