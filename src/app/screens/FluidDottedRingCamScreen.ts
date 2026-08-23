import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { mixHex as mixColor } from "../../lib/color";
import { clamp, TAU } from "../../lib/math";

const GRADIENT_INNER = 0x2dd4bf;
const GRADIENT_MID = 0x60a5fa;
const GRADIENT_OUTER = 0xc084fc;
const DOT_HIGHLIGHT = 0xf5e0dc;

const RING_WIDTH = 65;
const ANGLE_STEPS = 220;
const RADIAL_STEPS = 13;

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

function gradientColor(t: number): number {
  if (t < 0.5) {
    return mixColor(GRADIENT_INNER, GRADIENT_MID, t / 0.5);
  }

  return mixColor(GRADIENT_MID, GRADIENT_OUTER, (t - 0.5) / 0.5);
}

export class FluidDottedRingCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly nodes: RingNode[][] = [];
  private readonly projected: ProjectedNode[][] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildGrid();
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

  private buildGrid(): void {
    this.nodes.length = 0;
    this.projected.length = 0;
    const radialDenominator = Math.max(1, RADIAL_STEPS - 1);

    for (let radialIndex = 0; radialIndex < RADIAL_STEPS; radialIndex++) {
      const bandBias = (radialIndex / radialDenominator) * 2 - 1;
      const ring: RingNode[] = [];
      const projectedRing: ProjectedNode[] = [];
      const angleOffset =
        (radialIndex % 2 === 0 ? 0 : 0.5) * (TAU / ANGLE_STEPS);

      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        ring.push({
          angle: (angleIndex / ANGLE_STEPS) * TAU + angleOffset,
          bandBias,
          phase: ((radialIndex * 0.37 + angleIndex * 0.19) % 1) * TAU,
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

      this.nodes.push(ring);
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

    for (let radialIndex = 0; radialIndex < RADIAL_STEPS; radialIndex++) {
      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        this.projectNode(
          this.nodes[radialIndex][angleIndex],
          this.projected[radialIndex][angleIndex],
        );
      }
    }

    this.drawHalo(g);
    this.drawDots(g);
  }

  private drawHalo(g: Graphics): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const baseRadius = this.ringRadius;

    g.circle(cx, cy, baseRadius + RING_WIDTH * 1.9).stroke({
      color: GRADIENT_INNER,
      width: 16,
      alpha: 0.05,
    });
    g.circle(cx, cy, baseRadius).stroke({
      color: GRADIENT_MID,
      width: RING_WIDTH + 28,
      alpha: 0.03,
    });
    g.circle(cx, cy, baseRadius + RING_WIDTH * 0.2).stroke({
      color: GRADIENT_OUTER,
      width: RING_WIDTH * 0.55,
      alpha: 0.018,
    });
  }

  private drawDots(g: Graphics): void {
    for (let radialIndex = 0; radialIndex < RADIAL_STEPS; radialIndex++) {
      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        const node = this.projected[radialIndex][angleIndex];
        const lift = Math.max(0, node.elevation);
        const color = gradientColor(
          clamp(node.band * 0.62 + node.depth * 0.2 + node.crest * 0.18, 0, 1),
        );
        const radius = 1.18 + node.depth * 1.1 + lift * 2.35 + node.crest * 1.2;
        const alpha = Math.min(0.9, 0.2 + node.depth * 0.3 + lift * 0.2);
        const glowAlpha = alpha * (0.07 + node.crest * 0.18 + lift * 0.12);

        g.circle(node.x, node.y, radius * 2.35).fill({
          color,
          alpha: glowAlpha,
        });
        g.circle(node.x, node.y, radius).fill({
          color,
          alpha,
        });

        if (node.depth > 0.58 || lift > 0.08) {
          g.circle(node.x, node.y, radius * 0.34).fill({
            color: DOT_HIGHLIGHT,
            alpha: Math.min(0.82, 0.08 + node.depth * 0.14 + node.crest * 0.32),
          });
        }
      }
    }
  }
}
