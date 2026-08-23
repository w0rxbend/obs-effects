import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { clamp, TAU } from "../../lib/math";

const CATT_ROSEWATER = 0xf5e0dc;
const CATT_FLAMINGO = 0xf2cdcd;
const CATT_PINK = 0xf5c2e7;
const CATT_MAUVE = 0xcba6f7;
const CATT_RED = 0xf38ba8;
const CATT_MAROON = 0xeba0ac;
const CATT_PEACH = 0xfab387;
const CATT_YELLOW = 0xf9e2af;
const CATT_GREEN = 0xa6e3a1;
const CATT_TEAL = 0x94e2d5;
const CATT_SKY = 0x89dceb;
const CATT_SAPPHIRE = 0x74c7ec;
const CATT_BLUE = 0x89b4fa;
const CATT_LAVENDER = 0xb4befe;

const LINE_COLORS = [
  CATT_ROSEWATER,
  CATT_PINK,
  CATT_MAUVE,
  CATT_PEACH,
  CATT_YELLOW,
  CATT_GREEN,
  CATT_TEAL,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_BLUE,
  CATT_LAVENDER,
  CATT_FLAMINGO,
  CATT_RED,
  CATT_MAROON,
] as const;

const RING_WIDTH = 65;
const ANGLE_STEPS = 220;
const LINE_COUNT = 26;

interface RingNode {
  angle: number;
  bandBias: number;
  phase: number;
}

interface ProjectedNode {
  x: number;
  y: number;
  wave: number;
  elevation: number;
  crest: number;
  depth: number;
  band: number;
}

export class FluidCatppuccinRingsCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly rings: RingNode[][] = [];
  private readonly projected: ProjectedNode[][] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildRings();
  }

  private get ringRadius(): number {
    return Math.min(this.w, this.h) * 0.31;
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.draw();
  }

  private buildRings(): void {
    this.rings.length = 0;
    this.projected.length = 0;
    const lineDenominator = Math.max(1, LINE_COUNT - 1);

    for (let lineIndex = 0; lineIndex < LINE_COUNT; lineIndex++) {
      const bandBias = (lineIndex / lineDenominator) * 2 - 1;
      const ring: RingNode[] = [];
      const projectedRing: ProjectedNode[] = [];

      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        ring.push({
          angle: (angleIndex / ANGLE_STEPS) * TAU,
          bandBias,
          phase: ((lineIndex * 0.29 + angleIndex * 0.17) % 1) * TAU,
        });
        projectedRing.push({
          x: 0,
          y: 0,
          wave: 0,
          elevation: 0,
          crest: 0,
          depth: 0,
          band: 0,
        });
      }

      this.rings.push(ring);
      this.projected.push(projectedRing);
    }
  }

  private projectNode(node: RingNode, out: ProjectedNode): void {
    const theta = node.angle;
    const heartbeat =
      Math.max(0, Math.sin(this.time * 1.9)) ** 6 +
      Math.max(0, Math.sin(this.time * 1.9 - 0.42)) ** 10 * 0.45;
    const ringBreath =
      1 + Math.sin(this.time * 0.22) * 0.004 + heartbeat * 0.014;
    const bandCurve = 1 - Math.abs(node.bandBias) ** 1.35;

    const primarySwell =
      Math.sin(theta * 2.4 - this.time * 0.92 + node.phase) * 0.72;
    const secondarySwell =
      Math.sin(
        theta * 5.2 + node.bandBias * 1.7 - this.time * 0.48 + node.phase,
      ) * 0.38;
    const crossCurrent =
      Math.cos(
        node.bandBias * Math.PI * 1.45 -
          this.time * 0.34 -
          node.phase * 0.3 +
          Math.sin(theta * 1.6 - this.time * 0.18) * 0.45,
      ) * 0.24;

    const baseWave = primarySwell + secondarySwell + crossCurrent;
    const crest = Math.max(0, primarySwell * 0.8 + secondarySwell * 0.24);
    const microRipple =
      Math.sin(theta * 10.5 - this.time * 1.25 + node.phase * 1.2) *
      (0.05 + crest * 0.08);
    const contourSwell =
      Math.sin(theta * 2.2 + this.time * 0.17) * 2.6 +
      Math.sin(theta * 3.8 - this.time * 0.13 + 1.4) * 1.4;
    const thicknessBias =
      1 +
      Math.sin(theta * 1.6 - this.time * 0.12 + 0.4) * 0.045 +
      heartbeat * 0.025;

    const radialOffset =
      node.bandBias * (RING_WIDTH * 0.5 * thicknessBias) +
      contourSwell +
      baseWave * (1.8 + bandCurve * 0.85) +
      crest * (1.2 + bandCurve * 1.05) +
      microRipple * (1 + bandCurve * 1.35);
    const tangentOffset =
      (secondarySwell * 0.62 + crossCurrent * 0.45 + microRipple * 0.4) *
      (1.1 + bandCurve * 2.2);

    const radius = this.ringRadius * ringBreath + radialOffset;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    out.x = this.w * 0.5 + cosTheta * radius - sinTheta * tangentOffset;
    out.y = this.h * 0.5 + sinTheta * radius + cosTheta * tangentOffset;
    out.wave = baseWave * 0.34 + microRipple * 0.5;
    out.elevation = radialOffset / RING_WIDTH;
    out.crest = crest;
    out.depth = clamp(
      0.5 +
        Math.cos(theta - 0.6) * 0.18 +
        crest * 0.14 +
        heartbeat * 0.06 -
        Math.abs(node.bandBias) * 0.08,
      0,
      1,
    );
    out.band = clamp((node.bandBias + 1) * 0.5, 0, 1);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    for (let lineIndex = 0; lineIndex < LINE_COUNT; lineIndex++) {
      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        this.projectNode(
          this.rings[lineIndex][angleIndex],
          this.projected[lineIndex][angleIndex],
        );
      }
    }

    this.drawHalo(g);
    this.drawFluidLines(g);
  }

  private drawHalo(g: Graphics): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const baseRadius = this.ringRadius;

    g.circle(cx, cy, baseRadius + RING_WIDTH * 1.9).stroke({
      color: CATT_SKY,
      width: 16,
      alpha: 0.05,
    });
    g.circle(cx, cy, baseRadius).stroke({
      color: CATT_BLUE,
      width: RING_WIDTH + 28,
      alpha: 0.03,
    });
    g.circle(cx, cy, baseRadius + RING_WIDTH * 0.2).stroke({
      color: CATT_MAUVE,
      width: RING_WIDTH * 0.55,
      alpha: 0.018,
    });
  }

  private drawFluidLines(g: Graphics): void {
    for (let lineIndex = 0; lineIndex < LINE_COUNT; lineIndex++) {
      const ring = this.projected[lineIndex];
      const color = LINE_COLORS[lineIndex % LINE_COLORS.length];
      const band = lineIndex / Math.max(1, LINE_COUNT - 1);

      if (ring.length === 0) continue;

      let totalDepth = 0;
      let totalCrest = 0;
      let totalLift = 0;
      for (const node of ring) {
        totalDepth += node.depth;
        totalCrest += node.crest;
        totalLift += Math.max(0, node.elevation);
      }

      const count = ring.length;
      const avgDepth = totalDepth / count;
      const avgCrest = totalCrest / count;
      const avgLift = totalLift / count;
      const width =
        0.8 +
        (1 - Math.abs(band * 2 - 1)) * 1.2 +
        avgDepth * 0.5 +
        avgLift * 0.8;
      const alpha = Math.min(0.72, 0.18 + avgDepth * 0.18 + avgCrest * 0.24);
      const glowWidth = width * 2.8;
      const glowAlpha = alpha * (0.1 + avgCrest * 0.16);

      g.moveTo(ring[0].x, ring[0].y);
      for (let index = 1; index < ring.length; index++) {
        g.lineTo(ring[index].x, ring[index].y);
      }
      g.lineTo(ring[0].x, ring[0].y).stroke({
        color,
        alpha: glowAlpha,
        width: glowWidth,
        cap: "round",
        join: "round",
      });

      g.moveTo(ring[0].x, ring[0].y);
      for (let index = 1; index < ring.length; index++) {
        g.lineTo(ring[index].x, ring[index].y);
      }
      g.lineTo(ring[0].x, ring[0].y).stroke({
        color,
        alpha,
        width,
        cap: "round",
        join: "round",
      });
    }
  }
}
