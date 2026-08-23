import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { clamp, TAU } from "../../lib/math";

const BG = 0x070b13;
const AURA = 0x1e2f52;
const GRID_BACK = 0x4f6b96;
const GRID_MID = 0x74c7ec;
const GRID_FRONT = 0x89b4fa;
const DOT_COLOR = 0xb4befe;
const DOT_HIGHLIGHT = 0xf5e0dc;

const HALF_PI = Math.PI * 0.5;
const LAT_STEPS = 20;
const LON_STEPS = 38;
const FOCAL = 1800;
const ROTATION_SPEED = 0.16;
const BASE_TILT = -0.42;
const POLAR_INSET = 0.12;

interface MeshNode {
  lat: number;
  lon: number;
  phase: number;
}

interface ProjectedNode {
  x: number;
  y: number;
  z: number;
  depth: number;
  wave: number;
  elevation: number;
  crest: number;
}

interface Segment {
  a: ProjectedNode;
  b: ProjectedNode;
  depth: number;
  strength: number;
}

export class WavyPlanetMeshScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly mesh: MeshNode[][] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    this.buildMesh();
  }

  private get radius(): number {
    return Math.min(this.w, this.h) * 0.29;
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

    for (let latIndex = 0; latIndex <= LAT_STEPS; latIndex++) {
      const lat =
        -HALF_PI +
        POLAR_INSET +
        ((Math.PI - POLAR_INSET * 2) * latIndex) / LAT_STEPS;
      const ring: MeshNode[] = [];

      for (let lonIndex = 0; lonIndex < LON_STEPS; lonIndex++) {
        ring.push({
          lat,
          lon: (TAU * lonIndex) / LON_STEPS,
          phase: ((latIndex * 0.37 + lonIndex * 0.21) % 1) * TAU,
        });
      }

      this.mesh.push(ring);
    }
  }

  private projectNode(node: MeshNode): ProjectedNode {
    const rotation = this.time * ROTATION_SPEED;
    const wobble = Math.sin(this.time * 0.36) * 0.06;
    const twist = Math.sin(this.time * 0.16) * 0.11;

    const latFlow =
      Math.sin(node.lon * 1.8 - this.time * 0.45 + node.phase) * 0.028 +
      Math.cos(node.lat * 3.6 + this.time * 0.3 - node.phase) * 0.018;
    const lonFlow =
      Math.cos(node.lat * 2.8 - this.time * 0.34 + node.phase) * 0.032 +
      Math.sin(node.lon * 1.9 + this.time * 0.26) * 0.014;

    const warpedLat = clamp(
      node.lat + latFlow,
      -HALF_PI + 0.02,
      HALF_PI - 0.02,
    );
    const warpedLon = node.lon + lonFlow;

    const primarySwell =
      Math.sin(
        warpedLon * 1.65 -
          this.time * 0.48 +
          Math.sin(warpedLat * 2.1 + node.phase) * 0.45,
      ) * 0.7;
    const secondarySwell =
      Math.sin(
        (warpedLon + warpedLat * 0.82) * 2.3 -
          this.time * 0.34 +
          node.phase * 0.7,
      ) * 0.45;
    const crossCurrent =
      Math.cos(warpedLat * 3.4 + this.time * 0.22 - node.phase * 0.55) * 0.28;

    const baseWave = primarySwell + secondarySwell + crossCurrent;
    const crest = Math.max(0, primarySwell * 0.72 + secondarySwell * 0.2);
    const microRipple =
      Math.sin(warpedLon * 8.4 - this.time * 0.95 + node.phase * 1.3) *
      (0.004 + crest * 0.006);
    const troughSoftener = Math.min(0, baseWave) * 0.012;
    const elevation =
      baseWave * 0.032 + crest * crest * 0.03 + microRipple + troughSoftener;

    const equatorBias = 0.6 + Math.cos(warpedLat) * 0.4;
    const wave = baseWave * 0.03 + crest * 0.035 + microRipple * 3;
    const radius = this.radius * (1 + elevation * equatorBias);

    const sx = Math.cos(warpedLat) * Math.cos(warpedLon);
    const sy = Math.sin(warpedLat);
    const sz = Math.cos(warpedLat) * Math.sin(warpedLon);

    const x1 = sx * Math.cos(rotation) - sz * Math.sin(rotation);
    const z1 = sx * Math.sin(rotation) + sz * Math.cos(rotation);

    const y2 =
      sy * Math.cos(BASE_TILT + wobble) - z1 * Math.sin(BASE_TILT + wobble);
    const z2 =
      sy * Math.sin(BASE_TILT + wobble) + z1 * Math.cos(BASE_TILT + wobble);

    const x3 = x1 * Math.cos(twist) - y2 * Math.sin(twist);
    const y3 = x1 * Math.sin(twist) + y2 * Math.cos(twist);

    const scale = FOCAL / (FOCAL - z2 * radius);
    const depth = clamp((z2 + 1) * 0.5, 0, 1);

    return {
      x: this.w * 0.5 + x3 * radius * scale,
      y: this.h * 0.5 - y3 * radius * scale,
      z: z2,
      depth,
      wave,
      elevation,
      crest,
    };
  }

  private projectPole(
    latSign: -1 | 1,
    neighborRing: ProjectedNode[],
  ): ProjectedNode {
    const wobble = Math.sin(this.time * 0.36) * 0.06;
    const twist = Math.sin(this.time * 0.16) * 0.11;

    let wave = 0;
    let elevation = 0;
    let crest = 0;

    for (const node of neighborRing) {
      wave += node.wave;
      elevation += node.elevation;
      crest += node.crest;
    }

    const count = neighborRing.length || 1;
    wave /= count;
    elevation /= count;
    crest /= count;

    const radius = this.radius * (1 + elevation * 0.62);
    const y2 = latSign * Math.cos(BASE_TILT + wobble);
    const z2 = latSign * Math.sin(BASE_TILT + wobble);
    const x3 = -y2 * Math.sin(twist);
    const y3 = y2 * Math.cos(twist);
    const scale = FOCAL / (FOCAL - z2 * radius);
    const depth = clamp((z2 + 1) * 0.5, 0, 1);

    return {
      x: this.w * 0.5 + x3 * radius * scale,
      y: this.h * 0.5 - y3 * radius * scale,
      z: z2,
      depth,
      wave,
      elevation,
      crest,
    };
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    this.drawAura(g);

    const projected = this.mesh.map((ring) =>
      ring.map((node) => this.projectNode(node)),
    );
    const southPole = this.projectPole(-1, projected[0]);
    const northPole = this.projectPole(1, projected[projected.length - 1]);
    const segments: Segment[] = [];
    const dots: ProjectedNode[] = [southPole, northPole];

    for (let latIndex = 0; latIndex < this.mesh.length; latIndex++) {
      for (
        let lonIndex = 0;
        lonIndex < this.mesh[latIndex].length;
        lonIndex++
      ) {
        const current = projected[latIndex][lonIndex];
        const east = projected[latIndex][(lonIndex + 1) % LON_STEPS];

        dots.push(current);
        segments.push({
          a: current,
          b: east,
          depth: (current.z + east.z) * 0.5,
          strength: 0.8,
        });

        if (latIndex < LAT_STEPS) {
          const south = projected[latIndex + 1][lonIndex];
          const southEast = projected[latIndex + 1][(lonIndex + 1) % LON_STEPS];

          segments.push({
            a: current,
            b: south,
            depth: (current.z + south.z) * 0.5,
            strength: 1,
          });

          if ((latIndex + lonIndex) % 2 === 0) {
            segments.push({
              a: current,
              b: southEast,
              depth: (current.z + southEast.z) * 0.5,
              strength: 0.42,
            });
          }
        } else {
          segments.push({
            a: current,
            b: northPole,
            depth: (current.z + northPole.z) * 0.5,
            strength: 0.96,
          });
        }

        if (latIndex === 0) {
          segments.push({
            a: current,
            b: southPole,
            depth: (current.z + southPole.z) * 0.5,
            strength: 0.96,
          });
        }
      }
    }

    segments.sort((left, right) => left.depth - right.depth);
    dots.sort((left, right) => left.z - right.z);

    for (const segment of segments) {
      const depth = clamp((segment.depth + 1) * 0.5, 0, 1);
      const waveEnergy = Math.abs(segment.a.wave + segment.b.wave) * 0.5;
      const relief = Math.abs(segment.a.elevation - segment.b.elevation);
      const alpha =
        (0.06 + depth * 0.48 + waveEnergy * 1.1 + relief * 2.6) *
        segment.strength;
      const width = 0.42 + depth * 1 + waveEnergy * 0.7 + relief * 7;

      let color = GRID_BACK;
      if (depth > 0.72) color = GRID_FRONT;
      else if (depth > 0.38) color = GRID_MID;

      g.moveTo(segment.a.x, segment.a.y)
        .lineTo(segment.b.x, segment.b.y)
        .stroke({
          color,
          width,
          alpha,
        });
    }

    for (const dot of dots) {
      const glow = Math.max(0, dot.crest * 0.85 + dot.elevation * 3.5);
      const lift = Math.max(0, dot.elevation);
      const radius = 0.72 + dot.depth * 1.55 + lift * 18 + glow * 3.5;
      const alpha = 0.15 + dot.depth * 0.76 + lift * 2.2;

      g.circle(dot.x, dot.y, radius * 2.3).fill({
        color: DOT_COLOR,
        alpha: alpha * (0.08 + glow * 0.45),
      });
      g.circle(dot.x, dot.y, radius).fill({
        color: DOT_COLOR,
        alpha: Math.min(0.95, alpha),
      });

      if (dot.depth > 0.62 || lift > 0.006) {
        g.circle(dot.x, dot.y, radius * 0.35).fill({
          color: DOT_HIGHLIGHT,
          alpha: Math.min(0.95, 0.1 + dot.depth * 0.42 + glow * 3.4 + lift * 7),
        });
      }
    }
  }

  private drawAura(g: Graphics): void {
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const r = this.radius;

    g.circle(cx, cy, r * 1.22).fill({ color: AURA, alpha: 0.04 });
    g.circle(cx, cy, r * 1.07).fill({ color: GRID_MID, alpha: 0.035 });
    g.circle(cx, cy, r * 0.98).fill({ color: GRID_BACK, alpha: 0.1 });
  }
}
