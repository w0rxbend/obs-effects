import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Catppuccin Mocha violet palette
const C_DOT = 0xcba6f7;

const IMG_SIZE = 800;
const SAMPLE_STEP = 5;
const MAX_DT = 0.05;
const WAVE_SPEED = 0.55;
const WAVE_FREQ = 0.024;
const LIFT_Y = 8;
const DRIFT_X = 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface MeshNode {
  gridCol: number;
  gridRow: number;
  baseX: number;
  baseY: number;
  phase: number;
  x: number;
  y: number;
  elev: number;
  neighbors: number[];
}

export class CatMeshScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private nodes: MeshNode[] = [];
  private grid: number[][] = [];
  private gridCols = 0;
  private gridRows = 0;
  private scaleF = 1;
  private originX = 0;
  private originY = 0;
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
    await this.build();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rescale();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, MAX_DT);
    this.time += dt * WAVE_SPEED;
    this.animate();
    this.draw();
  }

  private async build(): Promise<void> {
    const img = await this.loadImage("/assets/main/cat-shape.png");
    const pixelData = this.rasterize(img);

    this.gridCols = Math.ceil(img.naturalWidth / SAMPLE_STEP);
    this.gridRows = Math.ceil(img.naturalHeight / SAMPLE_STEP);
    this.grid = Array.from({ length: this.gridRows }, () =>
      new Array<number>(this.gridCols).fill(-1),
    );

    this.computeScale();
    this.nodes = [];

    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const px = col * SAMPLE_STEP;
        const py = row * SAMPLE_STEP;
        if (px >= img.naturalWidth || py >= img.naturalHeight) continue;

        const i = (py * img.naturalWidth + px) * 4;
        const r = pixelData[i];
        const g = pixelData[i + 1];
        const b = pixelData[i + 2];
        const a = pixelData[i + 3];

        // Dark (cat body) = black on white PNG with RGBA
        if (a > 128 && r + g + b < 192) {
          const idx = this.nodes.length;
          this.grid[row][col] = idx;
          this.nodes.push({
            gridCol: col,
            gridRow: row,
            baseX: this.originX + px * this.scaleF,
            baseY: this.originY + py * this.scaleF,
            phase: ((row * 0.37 + col * 0.19) % 1) * Math.PI * 2,
            x: 0,
            y: 0,
            elev: 0,
            neighbors: [],
          });
        }
      }
    }

    this.buildEdges();
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private rasterize(img: HTMLImageElement): Uint8ClampedArray {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  private computeScale(): void {
    this.scaleF = Math.min(this.w * 0.88, this.h * 0.88) / IMG_SIZE;
    this.originX = (this.w - IMG_SIZE * this.scaleF) * 0.5;
    this.originY = (this.h - IMG_SIZE * this.scaleF) * 0.5;
  }

  private buildEdges(): void {
    for (const node of this.nodes) {
      const { gridCol: col, gridRow: row } = node;

      // Horizontal neighbor
      const right = this.grid[row]?.[col + 1] ?? -1;
      if (right >= 0) node.neighbors.push(right);

      // Vertical neighbor
      const down = this.grid[row + 1]?.[col] ?? -1;
      if (down >= 0) node.neighbors.push(down);

      // Both diagonals for a fully triangulated mesh
      const diagR = this.grid[row + 1]?.[col + 1] ?? -1;
      if (diagR >= 0) node.neighbors.push(diagR);
      const diagL = this.grid[row + 1]?.[col - 1] ?? -1;
      if (diagL >= 0) node.neighbors.push(diagL);
    }
  }

  private rescale(): void {
    this.computeScale();
    for (const node of this.nodes) {
      node.baseX = this.originX + node.gridCol * SAMPLE_STEP * this.scaleF;
      node.baseY = this.originY + node.gridRow * SAMPLE_STEP * this.scaleF;
    }
  }

  private animate(): void {
    const t = this.time;
    for (const node of this.nodes) {
      const bx = node.baseX * WAVE_FREQ;
      const by = node.baseY * WAVE_FREQ;
      const ph = node.phase;

      const primary =
        Math.sin(bx * 1.85 - t * 1.15 + ph) * Math.cos(by * 1.4 + t * 0.82);
      const secondary = Math.sin((bx + by) * 0.88 - t * 0.7 + ph * 0.65) * 0.55;
      const micro = Math.sin(bx * 3.7 + t * 2.1 + ph * 1.4) * 0.18;

      node.elev = clamp(primary * 0.6 + secondary * 0.3 + micro, -1, 1);
      const lift = Math.max(0, node.elev);
      node.x = node.baseX + Math.cos(ph + t * 0.27) * lift * DRIFT_X;
      node.y = node.baseY - lift * LIFT_Y;
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    for (const node of this.nodes) {
      for (const ni of node.neighbors) {
        const nb = this.nodes[ni];
        const avg = (node.elev + nb.elev) * 0.5;
        const relief = Math.abs(node.elev - nb.elev);

        const color = C_DOT;

        const alpha = clamp(0.08 + (avg + 1) * 0.1 + relief * 0.25, 0, 0.45);
        const width = 0.25 + relief * 0.5;

        g.moveTo(node.x, node.y)
          .lineTo(nb.x, nb.y)
          .stroke({ color, width, alpha });
      }
    }

    for (const node of this.nodes) {
      const e = node.elev;
      const ne = (e + 1) * 0.5;
      const lift = Math.max(0, e);
      const radius = 0.38 + ne * 1.1 + lift * 1.2;
      const alpha = clamp(0.3 + ne * 0.7, 0, 1);
      const color = C_DOT;

      if (lift > 0.4) {
        g.circle(node.x, node.y, radius * 2.6).fill({
          color,
          alpha: alpha * 0.12,
        });
      }

      g.circle(node.x, node.y, radius).fill({ color, alpha });
    }
  }
}
