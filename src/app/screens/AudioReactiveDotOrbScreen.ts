import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib";
import { mixHex as mixColor } from "../../lib/color";
import { clamp, clamp01, TAU } from "../../lib/math";

const RINGS = 42;
const SPOKES = 132;
const DOTS = RINGS * SPOKES;
const RIPPLE_COUNT = 4;

const BLUE = 0x174dff;
const CYAN = 0x43f4ff;
const LAVENDER = 0xb9a4ff;
const MAGENTA = 0xff18e8;
const WHITE = 0xffffff;

interface DotSample {
  radiusT: number;
  angle: number;
  cos: number;
  sin: number;
  phase: number;
  ring: number;
  spoke: number;
}

interface Ripple {
  age: number;
  strength: number;
}

function palette(vertical: number, lift: number, audio: number): number {
  const y = clamp01(vertical);
  const color =
    y < 0.34
      ? mixColor(BLUE, CYAN, y / 0.34)
      : y < 0.62
        ? mixColor(CYAN, LAVENDER, (y - 0.34) / 0.28)
        : mixColor(LAVENDER, MAGENTA, (y - 0.62) / 0.38);

  return lift + audio > 0.84
    ? mixColor(color, WHITE, (lift + audio - 0.84) * 2)
    : color;
}

export class AudioReactiveDotOrbScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly dots: DotSample[] = [];
  private readonly ripples: Ripple[] = Array.from(
    { length: RIPPLE_COUNT },
    () => ({
      age: 99,
      strength: 0,
    }),
  );

  private w = 1920;
  private h = 1080;
  private time = 0;
  private level = 0;
  private bass = 0;
  private mid = 0;
  private high = 0;
  private rippleIndex = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildSamples();
    void obsAudio.connect();
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    obsAudio.update(dt);

    this.level += (obsAudio.level - this.level) * Math.min(1, dt * 8);
    this.bass += (obsAudio.bass - this.bass) * Math.min(1, dt * 7);
    this.mid += (obsAudio.mid - this.mid) * Math.min(1, dt * 10);
    this.high += (obsAudio.high - this.high) * Math.min(1, dt * 16);

    if (obsAudio.beat || this.high > 0.42) {
      this.spawnRipple(clamp01(this.bass * 0.85 + this.high * 0.4));
    }

    for (const ripple of this.ripples) {
      ripple.age += dt;
    }

    this.draw();
  }

  private get radius(): number {
    return Math.min(this.w, this.h) * 0.35;
  }

  private buildSamples(): void {
    this.dots.length = 0;

    for (let ring = 1; ring <= RINGS; ring++) {
      const radiusT = ring / RINGS;
      const ringPhase = ring * 0.317;

      for (let spoke = 0; spoke < SPOKES; spoke++) {
        const angle = (spoke / SPOKES) * TAU;
        this.dots.push({
          radiusT,
          angle,
          cos: Math.cos(angle),
          sin: Math.sin(angle),
          phase: ringPhase + spoke * 0.149,
          ring,
          spoke,
        });
      }
    }
  }

  private spawnRipple(strength: number): void {
    const ripple = this.ripples[this.rippleIndex];
    ripple.age = 0;
    ripple.strength = strength;
    this.rippleIndex = (this.rippleIndex + 1) % this.ripples.length;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const baseRadius = this.radius * (1 + this.bass * 0.1);
    const t = this.time;
    const level = clamp01(this.level);
    const bass = clamp01(this.bass);
    const mid = clamp01(this.mid);
    const high = clamp01(this.high);

    for (const ripple of this.ripples) {
      if (ripple.age > 1.35) continue;
      const p = ripple.age / 1.35;
      const alpha = (1 - p) * ripple.strength * 0.18;
      g.circle(cx, cy, baseRadius * (0.3 + p * 0.98)).stroke({
        color: mixColor(CYAN, MAGENTA, p),
        alpha,
        width: 1.5 + ripple.strength * 4,
      });
    }

    g.circle(cx, cy, baseRadius * (1.02 + bass * 0.1)).stroke({
      color: mixColor(BLUE, MAGENTA, 0.58 + Math.sin(t * 0.7) * 0.12),
      alpha: 0.08 + level * 0.08,
      width: 12 + bass * 22,
    });

    for (let i = 0; i < DOTS; i++) {
      const dot = this.dots[i];
      const radial = dot.radiusT;
      const rim = radial * radial;
      const edge = rim * rim;
      const swirl =
        Math.sin(dot.angle * 5 + t * 0.72 + dot.phase) * 0.04 +
        Math.sin(dot.angle * 9 - t * 0.58 + radial * 10.5) * 0.026;
      const cellular =
        Math.sin(dot.spoke * 0.31 + t * 0.88 + dot.ring * 0.19) *
          Math.cos(dot.angle * 3 - t * 0.52) +
        Math.sin(dot.ring * 0.43 - t * 0.46 + dot.phase) * 0.65;
      const crest = Math.max(0, cellular);
      const audioLift =
        bass * edge * 0.23 +
        mid * crest * 0.105 +
        high *
          Math.max(0, Math.sin(dot.angle * 14 + t * 2.4 + dot.phase)) *
          0.075;
      let rippleLift = 0;

      for (const ripple of this.ripples) {
        if (ripple.age > 1.35) continue;
        const wave = ripple.age / 1.35;
        const distance = Math.abs(radial - wave);
        rippleLift +=
          Math.max(0, 1 - distance * 15) * ripple.strength * (1 - wave) * 0.14;
      }

      const membrane =
        Math.sin(radial * 15 - t * 0.9 + dot.phase) * (0.012 + mid * 0.022) +
        Math.cos(dot.angle * 7 + radial * 8 + t * 0.5) * (0.01 + level * 0.018);
      const activeRadius =
        baseRadius * radial * (1 + swirl + membrane + audioLift + rippleLift);
      const lateral =
        Math.sin(t * 0.45 + radial * 7 + dot.phase) * (5 + mid * 16) * edge;
      const x = cx + dot.cos * activeRadius - dot.sin * lateral;
      const y =
        cy +
        dot.sin * activeRadius * (0.91 + Math.sin(t * 0.28) * 0.018) +
        dot.cos * lateral * 0.32;

      const vertical = clamp01((y - (cy - baseRadius)) / (baseRadius * 2));
      const fade = clamp01(0.2 + radial * 0.95);
      const lift = clamp01(crest * 0.24 + audioLift * 2.2 + rippleLift * 2.4);
      const size =
        (0.85 + radial * 0.82 + crest * 0.18) *
        (1 + level * 0.22 + high * 0.32 + rippleLift * 1.8);
      const alpha =
        (0.34 + fade * 0.55 + lift * 0.28) *
        (0.88 + Math.sin(dot.phase + t * 1.1) * 0.08);

      g.circle(x, y, size).fill({
        color: palette(vertical, lift, high),
        alpha: clamp(alpha, 0.1, 0.98),
      });

      if (radial > 0.82 && (dot.spoke + dot.ring) % 5 === 0) {
        g.circle(x, y, size * (2.1 + bass * 1.3)).fill({
          color: mixColor(BLUE, MAGENTA, vertical),
          alpha: (edge - 0.45) * (0.035 + level * 0.055),
        });
      }
    }
  }
}
