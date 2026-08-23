import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { mixHex as mixColor } from "../../lib/color";
import { clamp, TAU } from "../../lib/math";

const GRADIENT_INNER = 0x2dd4bf;
const GRADIENT_MID = 0x60a5fa;
const GRADIENT_OUTER = 0xc084fc;
const DOT_HIGHLIGHT = 0xf5e0dc;

const RING_WIDTH = 65;
const ANGLE_STEPS = 180;
const RADIAL_STEPS = 10;

interface MeshNode {
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

export class FluidMeshRingCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly mesh: MeshNode[][] = [];
  private readonly projected: ProjectedNode[][] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildMesh();
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

  private buildMesh(): void {
    this.mesh.length = 0;
    this.projected.length = 0;
    const radialDenominator = Math.max(1, RADIAL_STEPS - 1);

    for (let radialIndex = 0; radialIndex < RADIAL_STEPS; radialIndex++) {
      const bandBias = (radialIndex / radialDenominator) * 2 - 1;
      const ring: MeshNode[] = [];
      const projectedRing: ProjectedNode[] = [];

      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        ring.push({
          angle: (angleIndex / ANGLE_STEPS) * TAU,
          bandBias,
          phase: ((radialIndex * 0.37 + angleIndex * 0.21) % 1) * TAU,
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

      this.mesh.push(ring);
      this.projected.push(projectedRing);
    }
  }

  private projectNode(node: MeshNode, out: ProjectedNode): void {
    const theta = node.angle;
    const heartbeat =
      Math.max(0, Math.sin(this.time * 1.9)) ** 6 +
      Math.max(0, Math.sin(this.time * 1.9 - 0.42)) ** 10 * 0.45;
    const ringBreath =
      1 + Math.sin(this.time * 0.22) * 0.004 + heartbeat * 0.014;
    const bandCurve = 1 - Math.abs(node.bandBias) ** 1.35;

    const primarySwell =
      Math.sin(node.angle * 2.4 - this.time * 0.92 + node.phase) * 0.72;
    const secondarySwell =
      Math.sin(
        node.angle * 5.2 +
          node.bandBias * 1.7 -
          this.time * 0.48 +
          node.phase * 0.65,
      ) * 0.38;
    const crossCurrent =
      Math.cos(
        node.bandBias * Math.PI * 1.45 -
          this.time * 0.34 -
          node.phase * 0.3 +
          Math.sin(node.angle * 1.6 - this.time * 0.18) * 0.45,
      ) * 0.24;

    const baseWave = primarySwell + secondarySwell + crossCurrent;
    const crest = Math.max(0, primarySwell * 0.8 + secondarySwell * 0.24);
    const microRipple =
      Math.sin(node.angle * 10.5 - this.time * 1.25 + node.phase * 1.2) *
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
        Math.cos(node.angle - 0.6) * 0.18 +
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
          this.mesh[radialIndex][angleIndex],
          this.projected[radialIndex][angleIndex],
        );
      }
    }

    this.drawHalo(g);
    this.drawGuideRims(g);
    this.drawMesh(g);
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

  private drawGuideRims(g: Graphics): void {
    this.drawRimPath(g, 0, GRADIENT_INNER, 0.16, 1.2);
    this.drawRimPath(g, RADIAL_STEPS - 1, GRADIENT_OUTER, 0.18, 1.25);
  }

  private drawRimPath(
    g: Graphics,
    radialIndex: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    const ring = this.projected[radialIndex];
    if (ring.length === 0) return;

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

  private drawMesh(g: Graphics): void {
    for (let radialIndex = 0; radialIndex < RADIAL_STEPS; radialIndex++) {
      for (let angleIndex = 0; angleIndex < ANGLE_STEPS; angleIndex++) {
        const current = this.projected[radialIndex][angleIndex];
        const next =
          this.projected[radialIndex][(angleIndex + 1) % ANGLE_STEPS];

        this.drawSegment(g, current, next, 0.96);

        if (radialIndex < RADIAL_STEPS - 1) {
          const outward = this.projected[radialIndex + 1][angleIndex];
          this.drawSegment(g, current, outward, 0.9);

          if ((radialIndex + angleIndex) % 2 === 0) {
            const diagonal =
              this.projected[radialIndex + 1][(angleIndex + 1) % ANGLE_STEPS];
            this.drawSegment(g, current, diagonal, 0.52);
          }
        }
      }
    }
  }

  private drawSegment(
    g: Graphics,
    a: ProjectedNode,
    b: ProjectedNode,
    strength: number,
  ): void {
    const depth = (a.depth + b.depth) * 0.5;
    const waveEnergy = Math.abs(a.wave + b.wave) * 0.5;
    const relief = Math.abs(a.elevation - b.elevation);
    const crest = (a.crest + b.crest) * 0.5;
    const band = (a.band + b.band) * 0.5;
    const colorBias = clamp(band * 0.58 + depth * 0.24 + crest * 0.18, 0, 1);
    const color = gradientColor(colorBias);

    const alpha =
      (0.07 + depth * 0.16 + waveEnergy * 0.14 + relief * 0.24 + crest * 0.18) *
      strength;
    const width =
      (0.38 + depth * 0.26 + waveEnergy * 0.22 + relief * 0.82 + crest * 0.18) *
      strength;

    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
      color,
      alpha,
      width,
      cap: "round",
      join: "round",
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
        const radius = 0.82 + node.depth * 0.9 + lift * 2.2 + node.crest * 1.05;
        const alpha = Math.min(0.92, 0.2 + node.depth * 0.28 + lift * 0.22);

        g.circle(node.x, node.y, radius * 2.1).fill({
          color,
          alpha: alpha * (0.09 + node.crest * 0.22),
        });
        g.circle(node.x, node.y, radius).fill({
          color,
          alpha,
        });

        if (node.depth > 0.58 || lift > 0.08) {
          g.circle(node.x, node.y, radius * 0.34).fill({
            color: DOT_HIGHLIGHT,
            alpha: Math.min(0.92, 0.12 + node.depth * 0.18 + node.crest * 0.42),
          });
        }
      }
    }
  }
}
