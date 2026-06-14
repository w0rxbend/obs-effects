import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const GRID_SPACING = 8;
const EDGE_THRESHOLD = GRID_SPACING * 1.9;
const TEXT_ALPHA_THRESHOLD = 90;

const COLOR_INNER = 0x99f6e4;
const COLOR_MID = 0x7dd3fc;
const COLOR_OUTER = 0xc4b5fd;
const COLOR_HIGHLIGHT = 0xffffff;

interface MeshNode {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  phase: number;
  amplitude: number;
  bias: number;
  wave: number;
  cellX: number;
  cellY: number;
}

interface MeshEdge {
  a: number;
  b: number;
  diagonal: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function mixColor(colorA: number, colorB: number, t: number): number {
  const clampedT = clamp(t, 0, 1);
  const ar = (colorA >> 16) & 0xff;
  const ag = (colorA >> 8) & 0xff;
  const ab = colorA & 0xff;
  const br = (colorB >> 16) & 0xff;
  const bg = (colorB >> 8) & 0xff;
  const bb = colorB & 0xff;

  const r = Math.round(lerp(ar, br, clampedT));
  const g = Math.round(lerp(ag, bg, clampedT));
  const b = Math.round(lerp(ab, bb, clampedT));

  return (r << 16) | (g << 8) | b;
}

function gradientColor(t: number): number {
  if (t < 0.5) {
    return mixColor(COLOR_INNER, COLOR_MID, t / 0.5);
  }

  return mixColor(COLOR_MID, COLOR_OUTER, (t - 0.5) / 0.5);
}

export class StartingSoonParticleMeshScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly nodes: MeshNode[] = [];
  private readonly edges: MeshEdge[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.buildMesh();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.buildMesh();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.projectNodes();
    this.draw();
  }

  protected getTextLines(): readonly string[] {
    return ["STARTING", "SOON"];
  }

  private buildMesh(): void {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      this.nodes.length = 0;
      this.edges.length = 0;
      return;
    }

    canvas.width = this.w;
    canvas.height = this.h;
    ctx.clearRect(0, 0, this.w, this.h);

    const lines = this.getTextLines();
    const maxTextWidth = this.w * 0.9;
    const maxTextHeight = this.h * 0.52;

    let fontSize = Math.floor(Math.min(this.w * 0.18, this.h * 0.28));
    let lineGap = 0;

    while (fontSize > 72) {
      ctx.font = `${fontSize}px "Bangers", sans-serif`;
      const widths = lines.map((line) => ctx.measureText(line).width);
      lineGap = Math.round(fontSize * 0.12);
      const totalHeight = fontSize * lines.length + lineGap;

      if (
        Math.max(0, ...widths) <= maxTextWidth &&
        totalHeight <= maxTextHeight
      ) {
        break;
      }

      fontSize -= 8;
    }

    ctx.font = `${fontSize}px "Bangers", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";

    const totalHeight = fontSize * lines.length + lineGap;
    const startY = this.h * 0.5 - totalHeight * 0.5 + fontSize * 0.5;

    for (let index = 0; index < lines.length; index++) {
      const y = startY + index * (fontSize + lineGap);
      ctx.fillText(lines[index], this.w * 0.5, y);
    }

    const imageData = ctx.getImageData(0, 0, this.w, this.h).data;
    this.nodes.length = 0;
    this.edges.length = 0;

    const cellIndex = new Map<string, number>();
    const cols = Math.ceil(this.w / GRID_SPACING);
    const rows = Math.ceil(this.h / GRID_SPACING);

    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const sampleX = clamp(col * GRID_SPACING, 0, this.w - 1);
        const sampleY = clamp(row * GRID_SPACING, 0, this.h - 1);
        const pixelIndex =
          (Math.floor(sampleY) * this.w + Math.floor(sampleX)) * 4 + 3;

        if (imageData[pixelIndex] < TEXT_ALPHA_THRESHOLD) {
          continue;
        }

        const normalizedX = sampleX / Math.max(1, this.w);
        const normalizedY = sampleY / Math.max(1, this.h);

        this.nodes.push({
          homeX: sampleX,
          homeY: sampleY,
          x: sampleX,
          y: sampleY,
          phase: (normalizedX * 3.7 + normalizedY * 5.1) * Math.PI * 2,
          amplitude: 2.2 + Math.sin(normalizedX * Math.PI * 4.2) * 0.9,
          bias: clamp(normalizedX * 0.62 + (1 - normalizedY) * 0.38, 0, 1),
          wave: 0,
          cellX: col,
          cellY: row,
        });

        cellIndex.set(`${col},${row}`, this.nodes.length - 1);
      }
    }

    const neighborOffsets = [
      { x: 1, y: 0, diagonal: false },
      { x: 0, y: 1, diagonal: false },
      { x: 1, y: 1, diagonal: true },
      { x: 1, y: -1, diagonal: true },
    ] as const;

    for (const node of this.nodes) {
      const sourceIndex = cellIndex.get(`${node.cellX},${node.cellY}`);
      if (sourceIndex === undefined) {
        continue;
      }

      for (const offset of neighborOffsets) {
        const targetIndex = cellIndex.get(
          `${node.cellX + offset.x},${node.cellY + offset.y}`,
        );

        if (targetIndex === undefined) {
          continue;
        }

        this.edges.push({
          a: sourceIndex,
          b: targetIndex,
          diagonal: offset.diagonal,
        });
      }
    }
  }

  private projectNodes(): void {
    const heartbeat =
      Math.max(0, Math.sin(this.time * 1.85)) ** 8 +
      Math.max(0, Math.sin(this.time * 1.85 - 0.42)) ** 10 * 0.32;

    for (const node of this.nodes) {
      const waveA =
        Math.sin(node.homeX * 0.0105 + this.time * 1.2 + node.phase) *
        Math.cos(node.homeY * 0.009 + this.time * 0.82 - node.phase * 0.35);
      const waveB =
        Math.sin(
          (node.homeX + node.homeY) * 0.0052 -
            this.time * 0.74 +
            node.phase * 0.6,
        ) * 0.65;
      const ripple =
        Math.cos(node.homeY * 0.016 - this.time * 1.45 + node.phase * 1.1) *
        0.35;

      const flow = waveA + waveB + ripple;
      const swayX =
        (waveA * 1.9 + ripple * 0.9) * node.amplitude + heartbeat * 0.7;
      const swayY =
        (waveB * 2.4 + waveA * 0.8) * node.amplitude + heartbeat * 1.1;

      node.x = node.homeX + swayX;
      node.y = node.homeY + swayY;
      node.wave = flow;
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    for (const edge of this.edges) {
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);

      if (distance > EDGE_THRESHOLD) {
        continue;
      }

      const gradientT = clamp(
        (a.bias + b.bias) * 0.5 +
          (a.wave + b.wave) * 0.045 +
          Math.sin(this.time * 0.28) * 0.06,
        0,
        1,
      );
      const color = gradientColor(gradientT);
      const alphaBase = edge.diagonal ? 0.075 : 0.11;
      const alpha =
        alphaBase +
        clamp(1 - distance / EDGE_THRESHOLD, 0, 1) * 0.12 +
        Math.max(0, (a.wave + b.wave) * 0.5) * 0.045;

      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({
          color,
          width: edge.diagonal ? 0.8 : 1.15,
          alpha: Math.min(0.24, alpha),
        });
    }

    for (const node of this.nodes) {
      const shimmer = clamp(0.5 + node.wave * 0.26, 0, 1);
      const color = gradientColor(
        clamp(node.bias * 0.82 + shimmer * 0.18, 0, 1),
      );
      const radius = 1.8 + shimmer * 1.25;
      const alpha = 0.42 + shimmer * 0.28;

      g.circle(node.x, node.y, radius * 2.4).fill({
        color,
        alpha: alpha * 0.11,
      });
      g.circle(node.x, node.y, radius).fill({
        color,
        alpha,
      });
      g.circle(node.x, node.y, Math.max(0.75, radius * 0.28)).fill({
        color: COLOR_HIGHLIGHT,
        alpha: 0.12 + shimmer * 0.1,
      });
    }
  }
}
