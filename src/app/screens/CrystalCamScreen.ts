import type { Ticker } from "pixi.js";
import { Container, Graphics, BlurFilter } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const MAUVE = 0xcba6f7;
const LAVENDER = 0xb4befe;
const SAPPHIRE = 0x74c7ec;
const SKY = 0x89dceb;
const TEAL = 0x94e2d5;
const FLAMINGO = 0xf2cdcd;

type Vec3 = { x: number; y: number; z: number };

export class CrystalCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly glowContainer = new Container();
  private readonly glowGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  // Rotation state
  private rotX = 0;
  private rotY = 0;
  private rotZ = 0;

  // Layer 2: Outer Shell (Level 1 Geodesic - 42 vertices)
  private readonly l2V: Vec3[];
  private readonly l2E: [number, number][];

  // Layer 1: Inner Core (Level 0 - 12 vertices)
  private readonly l1V: Vec3[];
  private readonly l1E: [number, number][];

  constructor() {
    super();

    // Simplified to two layers for elegance and clarity
    const layer2 = this.generateGeodesic(1);
    this.l2V = layer2.verts;
    this.l2E = layer2.edges;

    const layer1 = this.generateGeodesic(0);
    this.l1V = layer1.verts;
    this.l1E = layer1.edges;

    this.alpha = 0.85;
    this.addChild(this.gfx);
    this.glowContainer.addChild(this.glowGfx);
    const blur = new BlurFilter();
    blur.blur = 10;
    this.glowContainer.filters = [blur];
    this.addChild(this.glowContainer);
  }

  private generateGeodesic(subdivisions: number): {
    verts: Vec3[];
    edges: [number, number][];
  } {
    const phi = (1 + Math.sqrt(5)) / 2;
    const verts: Vec3[] = [
      { x: -1, y: phi, z: 0 },
      { x: 1, y: phi, z: 0 },
      { x: -1, y: -phi, z: 0 },
      { x: 1, y: -phi, z: 0 },
      { x: 0, y: -1, z: phi },
      { x: 0, y: 1, z: phi },
      { x: 0, y: -1, z: -phi },
      { x: 0, y: 1, z: -phi },
      { x: phi, y: 0, z: -1 },
      { x: phi, y: 0, z: 1 },
      { x: -phi, y: 0, z: -1 },
      { x: -phi, y: 0, z: 1 },
    ].map((v) => this.normalize(v));

    let faces: [number, number, number][] = [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ];

    for (let i = 0; i < subdivisions; i++) {
      const midpointCache = new Map<string, number>();
      const getMidpoint = (a: number, b: number): number => {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (midpointCache.has(key)) return midpointCache.get(key)!;
        const index = verts.length;
        verts.push(
          this.normalize({
            x: (verts[a].x + verts[b].x) / 2,
            y: (verts[a].y + verts[b].y) / 2,
            z: (verts[a].z + verts[b].z) / 2,
          }),
        );
        midpointCache.set(key, index);
        return index;
      };

      const nextFaces: [number, number, number][] = [];
      for (const [v1, v2, v3] of faces) {
        const a = getMidpoint(v1, v2);
        const b = getMidpoint(v2, v3);
        const c = getMidpoint(v3, v1);
        nextFaces.push([v1, a, c], [v2, b, a], [v3, c, b], [a, b, c]);
      }
      faces = nextFaces;
    }

    const edgeSet = new Set<string>();
    const uniqueEdges: [number, number][] = [];
    for (const [v1, v2, v3] of faces) {
      [
        [v1, v2],
        [v2, v3],
        [v3, v1],
      ].forEach(([a, b]) => {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          uniqueEdges.push([a, b]);
        }
      });
    }

    return { verts, edges: uniqueEdges };
  }

  private normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS / 16.66;
    this.time += ticker.deltaMS / 1000;

    this.rotX += 0.0035 * dt;
    this.rotY += 0.0025 * dt;
    this.rotZ += 0.0015 * dt;

    const g = this.gfx;
    const gg = this.glowGfx;
    g.clear();
    gg.clear();

    const centerX = this.w / 2;
    const centerY = this.h / 2;
    const baseSize = Math.min(this.w, this.h) * 0.4;

    // ── Nucleus ─────────────────────────────────────────────────────────────
    const pulse = Math.sin(this.time * 2.2) * 0.2 + 1;
    g.circle(centerX, centerY, 8 * pulse).fill({ color: TEAL, alpha: 0.9 });
    gg.circle(centerX, centerY, 20 * pulse).fill({ color: TEAL, alpha: 0.4 });

    // ── Outer Shell (Level 1) ──────────────────────────────────────────────
    const l2P = this.project(
      this.l2V,
      baseSize,
      this.rotX,
      this.rotY,
      this.rotZ,
      centerX,
      centerY,
    );
    this.drawWireframe(g, gg, l2P, this.l2E, LAVENDER, MAUVE, 1.4, 0.3, 0.7);

    // ── Inner Core (Level 0) ───────────────────────────────────────────────
    const l1P = this.project(
      this.l1V,
      baseSize * 0.45,
      -this.rotX * 1.5,
      this.rotY * 1.2,
      -this.rotZ * 0.8,
      centerX,
      centerY,
    );
    this.drawWireframe(g, gg, l1P, this.l1E, SAPPHIRE, SKY, 1.8, 0.5, 0.85);

    // ── Energy Scaffolding ──────────────────────────────────────────────────
    this.drawScaffolding(g, l2P, l1P, TEAL, 0.25);

    // ── Nodes ───────────────────────────────────────────────────────────────
    this.drawNodes(g, gg, l2P, LAVENDER, 3.5, 0.4);
    this.drawNodes(g, gg, l1P, SAPPHIRE, 4.5, 0.6);
  }

  private project(
    verts: Vec3[],
    size: number,
    rx: number,
    ry: number,
    rz: number,
    cx: number,
    cy: number,
  ) {
    return verts.map((v) => {
      let { x, y, z } = v;
      const y1 = y * Math.cos(rx) - z * Math.sin(rx);
      const z1 = y * Math.sin(rx) + z * Math.cos(rx);
      y = y1;
      z = z1;
      const x2 = x * Math.cos(ry) + z * Math.sin(ry);
      const z2 = -x * Math.sin(ry) + z * Math.cos(ry);
      x = x2;
      z = z2;
      const x3 = x * Math.cos(rz) - y * Math.sin(rz);
      const y3 = x * Math.sin(rz) + y * Math.cos(rz);
      x = x3;
      y = y3;

      const focalLength = 3.5;
      const perspective = focalLength / (focalLength + z);
      return {
        px: cx + x * size * perspective,
        py: cy - y * size * perspective,
        pz: z,
      };
    });
  }

  private drawWireframe(
    g: Graphics,
    gg: Graphics,
    proj: any[],
    edges: [number, number][],
    c1: number,
    c2: number,
    weight: number,
    glowT: number,
    baseAlpha: number,
  ) {
    edges.forEach(([i1, i2]) => {
      const v1 = proj[i1];
      const v2 = proj[i2];
      const avgZ = (v1.pz + v2.pz) / 2;
      const normZ = (avgZ + 1) / 2;

      const color = this.lerpColor(c1, SURFACE0, normZ);
      const thickness = weight * (1 - normZ) + 0.3 * normZ;
      const alpha = baseAlpha * (1 - normZ) + 0.1 * normZ;

      g.moveTo(v1.px, v1.py).lineTo(v2.px, v2.py);
      g.stroke({ color, width: thickness, alpha });

      if (normZ < glowT) {
        gg.moveTo(v1.px, v1.py).lineTo(v2.px, v2.py);
        gg.stroke({
          color: this.lerpColor(color, c2, 0.4),
          width: thickness * 2.5,
          alpha: alpha * 0.3,
        });
      }
    });
  }

  private drawScaffolding(
    g: Graphics,
    layerA: any[],
    layerB: any[],
    color: number,
    alpha: number,
  ) {
    for (let i = 0; i < layerA.length; i++) {
      const v1 = layerA[i];
      const v2 = layerB[i % layerB.length];
      const avgZ = (v1.pz + v2.pz) / 2;
      const normZ = (avgZ + 1) / 2;
      if (normZ > 0.7) continue;

      g.moveTo(v1.px, v1.py).lineTo(v2.px, v2.py);
      g.stroke({ color, width: 0.8, alpha: alpha * (1 - normZ) });
    }
  }

  private drawNodes(
    g: Graphics,
    gg: Graphics,
    proj: any[],
    c: number,
    baseSize: number,
    glowT: number,
  ) {
    proj.forEach((v) => {
      const normZ = (v.pz + 1) / 2;
      if (normZ > 0.8) return;

      const color = this.lerpColor(c, SURFACE1, normZ);
      const alpha = 0.9 * (1 - normZ) + 0.1 * normZ;
      const size = baseSize * (1 - normZ) + 1.0 * normZ;

      g.circle(v.px, v.py, size).fill({ color, alpha });

      if (normZ < glowT) {
        gg.circle(v.px, v.py, size * 2).fill({ color, alpha: alpha * 0.4 });
      }
    });
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
