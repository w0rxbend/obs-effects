import type { Ticker } from "pixi.js";
import { Container, Graphics, BlurFilter } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const SURFACE2 = 0x585b70; // Background lines
const SAPPHIRE = 0x74c7ec; // Vertex nodes
const LAVENDER = 0xb4befe; // Foreground lines

type Vec3 = { x: number; y: number; z: number };
type ProjectedVec3 = { px: number; py: number; pz: number };

export class FigureEightTorusScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly glowContainer = new Container();
  private readonly glowGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  // Rotation state
  private rotY = 0;
  private readonly rotSpeed = 0.005;

  // Geometry settings
  private readonly segmentsTheta = 40; // Resolution around the major ring
  private readonly segmentsPhi = 16; // Resolution around the minor tube
  private readonly R = 1.0; // Major radius

  constructor() {
    super();

    this.alpha = 0.8;
    this.addChild(this.gfx);

    this.glowContainer.addChild(this.glowGfx);
    const blur = new BlurFilter();
    blur.blur = 6;
    this.glowContainer.filters = [blur];
    this.addChild(this.glowContainer);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS / 16.66;
    this.time += ticker.deltaMS / 1000;
    this.rotY += this.rotSpeed * dt;

    const g = this.gfx;
    const gg = this.glowGfx;
    g.clear();
    gg.clear();

    const centerX = this.w / 2;
    const centerY = this.h / 2;
    const baseSize = Math.min(this.w, this.h) * 0.28;

    // 1. Generate Geometry with "Breathing" for a standard Torus (Donut)
    const breathingR = 0.35 * (1 + Math.sin(this.time * 0.8) * 0.1); // Minor radius breathing
    const vertices: Vec3[][] = [];

    for (let i = 0; i < this.segmentsTheta; i++) {
      const theta = (i / this.segmentsTheta) * Math.PI * 2;
      const ring: Vec3[] = [];

      for (let j = 0; j < this.segmentsPhi; j++) {
        const phi = (j / this.segmentsPhi) * Math.PI * 2;

        // Standard Torus Parametric Equations
        const x = (this.R + breathingR * Math.cos(phi)) * Math.cos(theta);
        const y = (this.R + breathingR * Math.cos(phi)) * Math.sin(theta);
        const z = breathingR * Math.sin(phi);

        // Apply Y-axis rotation
        const rx = x * Math.cos(this.rotY) + z * Math.sin(this.rotY);
        const rz = -x * Math.sin(this.rotY) + z * Math.cos(this.rotY);

        ring.push({ x: rx, y, z: rz });
      }
      vertices.push(ring);
    }

    // 2. Project and Collect Edge/Vertex data for Z-sorting
    const projected: ProjectedVec3[][] = vertices.map((ring) =>
      ring.map((v) => {
        const focalLength = 3.5;
        const perspective = focalLength / (focalLength + v.z);
        return {
          px: centerX + v.x * baseSize * perspective,
          py: centerY - v.y * baseSize * perspective,
          pz: v.z,
        };
      }),
    );

    // 3. Draw Wireframe with Depth Cues
    // We'll iterate through rings and draw connections
    for (let i = 0; i < this.segmentsTheta; i++) {
      for (let j = 0; j < this.segmentsPhi; j++) {
        const nextI = (i + 1) % this.segmentsTheta;
        const nextJ = (j + 1) % this.segmentsPhi;

        const v = projected[i][j];
        const vRight = projected[nextI][j];
        const vDown = projected[i][nextJ];

        // Draw connections to neighbors (Right and Down)
        this.drawEdge(g, gg, v, vRight);
        this.drawEdge(g, gg, v, vDown);

        // Draw vertex nodes
        this.drawNode(g, gg, v);
      }
    }
  }

  private drawEdge(
    g: Graphics,
    gg: Graphics,
    v1: ProjectedVec3,
    v2: ProjectedVec3,
  ) {
    const avgZ = (v1.pz + v2.pz) / 2;
    const normZ = (avgZ + 1) / 2; // 0 (front, +Z) to 1 (back, -Z)

    // Foreground: Lavender, thick; Background: Surface2, thin
    const color = this.lerpColor(LAVENDER, SURFACE2, normZ);
    const thickness = 2.2 * (1 - normZ) + 0.5 * normZ;
    const alpha = 0.9 * (1 - normZ) + 0.3 * normZ;

    g.moveTo(v1.px, v1.py).lineTo(v2.px, v2.py);
    g.stroke({ color, width: thickness, alpha });

    // Glow for foreground
    if (normZ < 0.4) {
      gg.moveTo(v1.px, v1.py).lineTo(v2.px, v2.py);
      gg.stroke({ color: LAVENDER, width: thickness * 3, alpha: alpha * 0.2 });
    }
  }

  private drawNode(g: Graphics, gg: Graphics, v: ProjectedVec3) {
    const normZ = (v.pz + 1) / 2;
    if (normZ > 0.8) return; // Clarity: skip far nodes

    const alpha = 0.8 * (1 - normZ) + 0.1 * normZ;
    const size = 3 * (1 - normZ) + 1 * normZ;

    g.circle(v.px, v.py, size).fill({ color: SAPPHIRE, alpha });

    if (normZ < 0.5) {
      gg.circle(v.px, v.py, size * 1.5).fill({
        color: SAPPHIRE,
        alpha: alpha * 0.4,
      });
    }
  }

  private lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }
}
