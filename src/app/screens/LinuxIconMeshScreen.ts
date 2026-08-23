import type { Ticker } from "pixi.js";
import { clamp } from "../../lib/math";
import {
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Texture,
} from "pixi.js";

const C_CRUST = 0x11111b;
const C_MANTLE = 0x181825;
const C_SURFACE0 = 0x313244;
const C_SURFACE1 = 0x45475a;
const C_LAVENDER = 0xb4befe;
const C_MAUVE = 0xcba6f7;
const C_SKY = 0x89dceb;
const C_ROSEWATER = 0xf5e0dc;

const ICON_WIDTH = 201;
const ICON_HEIGHT = 193;
const ICON_DISPLAY_WIDTH = 34;
const BASE_ICON_SCALE = ICON_DISPLAY_WIDTH / ICON_WIDTH;
const MAX_DT = 0.05;
const DOT_SEGMENT_STEP = 11;

interface MeshNode {
  col: number;
  row: number;
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  x: number;
  y: number;
  elevation: number;
  depth: number;
  particle: Particle;
}

interface AtmosphereBlob {
  xNorm: number;
  yNorm: number;
  radiusNorm: number;
  driftX: number;
  driftY: number;
  phase: number;
  speed: number;
  alpha: number;
  color: number;
}

interface AtmosphereMote {
  xNorm: number;
  yNorm: number;
  radius: number;
  sway: number;
  rise: number;
  phase: number;
  speed: number;
  alpha: number;
  color: number;
}

export class LinuxIconMeshScreen extends Container {
  public static assetBundles = ["main"];

  private readonly meshGfx = new Graphics();
  private readonly glowGfx = new Graphics();
  private readonly iconLayer = new Container();
  private readonly iconBoostFilter = new ColorMatrixFilter();
  private particleLayer = new ParticleContainer({
    dynamicProperties: {
      position: true,
      vertex: true,
      rotation: true,
      color: true,
    },
  });

  private iconTextures: Texture[] = [];
  private atmosphereBlobs: AtmosphereBlob[] = [];
  private atmosphereMotes: AtmosphereMote[] = [];
  private rows: MeshNode[][] = [];
  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();

    this.iconBoostFilter.brightness(1.85, false);
    this.iconBoostFilter.contrast(1.18, true);
    this.iconBoostFilter.saturate(1.2, true);
    this.iconLayer.filters = [this.iconBoostFilter];

    this.addChild(this.meshGfx);
    this.addChild(this.glowGfx);
    this.iconLayer.addChild(this.particleLayer);
    this.addChild(this.iconLayer);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.iconLayer.filterArea = new Rectangle(0, 0, this.w, this.h);
    this.rebuildAtmosphere();
    this.ensureTextures();
    this.rebuildGrid();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.iconLayer.filterArea = new Rectangle(0, 0, width, height);
    this.rebuildAtmosphere();

    if (this.iconTextures.length > 0) {
      this.rebuildGrid();
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, MAX_DT);
    this.time += dt;
    this.updateNodes();
    this.drawMesh();
  }

  private ensureTextures(): void {
    if (this.iconTextures.length > 0) return;

    const sheet = Assets.get<Texture>("sprite-linux.png");
    const sourceWidth = sheet.source.width;
    const sourceHeight = sheet.source.height;
    const cols = Math.max(1, Math.round(sourceWidth / ICON_WIDTH));
    const rows = Math.max(1, Math.round(sourceHeight / ICON_HEIGHT));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * ICON_WIDTH;
        const y = row * ICON_HEIGHT;
        const width = Math.min(ICON_WIDTH, sourceWidth - x);
        const height = Math.min(ICON_HEIGHT, sourceHeight - y);

        if (width < ICON_WIDTH * 0.9 || height < ICON_HEIGHT * 0.9) continue;

        this.iconTextures.push(
          new Texture({
            source: sheet.source,
            frame: new Rectangle(x, y, width, height),
          }),
        );
      }
    }
  }

  private rebuildGrid(): void {
    const particleCount = this.particleLayer.particleChildren.length;
    if (particleCount > 0) {
      this.particleLayer.removeParticles(0, particleCount);
      this.particleLayer.update();
    }

    this.rows = [];

    const marginX = Math.max(84, this.w * 0.08);
    const marginY = Math.max(72, this.h * 0.11);
    const targetSpacing = clamp(Math.min(this.w, this.h) * 0.09, 88, 118);
    const cols = Math.max(
      8,
      Math.floor((this.w - marginX * 2) / targetSpacing) + 1,
    );
    const rows = Math.max(
      5,
      Math.floor((this.h - marginY * 2) / (targetSpacing * 0.9)) + 1,
    );
    const spacingX = cols > 1 ? (this.w - marginX * 2) / (cols - 1) : 0;
    const spacingY = rows > 1 ? (this.h - marginY * 2) / (rows - 1) : 0;

    for (let row = 0; row < rows; row++) {
      const meshRow: MeshNode[] = [];

      for (let col = 0; col < cols; col++) {
        const textureIndex =
          (row * cols + col * 3 + ((row + col) % 5) * 7) %
          this.iconTextures.length;
        const particle = new Particle({
          texture: this.iconTextures[textureIndex],
          x: marginX + col * spacingX,
          y: marginY + row * spacingY,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: BASE_ICON_SCALE,
          scaleY: BASE_ICON_SCALE,
          alpha: 1,
          tint: 0xf6f7ff,
        });

        this.particleLayer.addParticle(particle);
        meshRow.push({
          col,
          row,
          baseX: marginX + col * spacingX,
          baseY: marginY + row * spacingY,
          phase: ((row * 0.29 + col * 0.17) % 1) * Math.PI * 2,
          drift: ((row * 0.11 + col * 0.23) % 1) * Math.PI * 2,
          x: marginX + col * spacingX,
          y: marginY + row * spacingY,
          elevation: 0,
          depth: 0.5,
          particle,
        });
      }

      this.rows.push(meshRow);
    }

    this.particleLayer.update();
  }

  private rebuildAtmosphere(): void {
    this.atmosphereBlobs = [];
    this.atmosphereMotes = [];

    const blobColors = [C_MANTLE, C_SURFACE0, C_SURFACE1, C_MAUVE, C_SKY];
    const moteColors = [C_SURFACE0, C_LAVENDER, C_MAUVE, C_SKY, C_ROSEWATER];

    for (let index = 0; index < 7; index++) {
      this.atmosphereBlobs.push({
        xNorm: Math.random(),
        yNorm: Math.random(),
        radiusNorm: 0.1 + Math.random() * 0.18,
        driftX: 0.02 + Math.random() * 0.06,
        driftY: 0.015 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
        speed: 0.05 + Math.random() * 0.12,
        alpha: 0.04 + Math.random() * 0.08,
        color: blobColors[index % blobColors.length],
      });
    }

    const densityScale = (this.w * this.h) / (1920 * 1080);
    const moteCount = Math.max(48, Math.floor(densityScale * 90));

    for (let index = 0; index < moteCount; index++) {
      this.atmosphereMotes.push({
        xNorm: Math.random(),
        yNorm: Math.random(),
        radius: 0.45 + Math.random() * 1.2,
        sway: 8 + Math.random() * 18,
        rise: 4 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.45,
        alpha: 0.08 + Math.random() * 0.18,
        color: moteColors[index % moteColors.length],
      });
    }
  }

  private updateNodes(): void {
    const centerX = this.w * 0.5;
    const centerY = this.h * 0.5;

    for (const row of this.rows) {
      for (const node of row) {
        const primary =
          Math.sin(node.baseX * 0.0046 - this.time * 0.62 + node.phase) * 0.58;
        const secondary =
          Math.cos(node.baseY * 0.0061 - this.time * 0.37 + node.phase * 0.8) *
          0.28;
        const diagonal =
          Math.sin(
            (node.baseX + node.baseY) * 0.0032 - this.time * 0.9 + node.drift,
          ) * 0.22;
        const swell = primary + secondary + diagonal;
        const crest = Math.max(0, swell);

        const flowAngle =
          Math.sin(node.baseX * 0.0028 + this.time * 0.31 + node.drift) * 1.25 +
          Math.cos(node.baseY * 0.0034 - this.time * 0.27 - node.phase) * 1.05;

        const radialX = (node.baseX - centerX) / Math.max(centerX, 1);
        const radialY = (node.baseY - centerY) / Math.max(centerY, 1);
        const edgeDistance = Math.min(
          1,
          Math.sqrt(radialX * radialX + radialY * radialY),
        );
        const edgeDamping = 0.78 + (1 - edgeDistance) * 0.36;

        const fluidX =
          Math.cos(flowAngle + node.phase) * (11 + crest * 18) +
          Math.sin(this.time * 0.24 + node.baseY * 0.011) * 7;
        const fluidY =
          Math.sin(flowAngle * 1.12 - node.phase) * (14 + crest * 22) +
          Math.cos(this.time * 0.22 + node.baseX * 0.0086) * 8;
        const liftX = radialX * swell * 12;
        const liftY = radialY * swell * 18;

        node.elevation = swell * 0.42 + crest * 0.72;
        node.depth = clamp(0.48 + node.elevation * 0.36 + crest * 0.18, 0, 1);
        node.x = node.baseX + (fluidX + liftX) * edgeDamping;
        node.y = node.baseY + (fluidY + liftY) * edgeDamping;

        const scale =
          BASE_ICON_SCALE * (0.84 + node.depth * 0.42 + crest * 0.1);
        node.particle.x = node.x;
        node.particle.y = node.y;
        node.particle.scaleX = scale;
        node.particle.scaleY = scale;
        node.particle.rotation =
          Math.sin(this.time * 0.18 + node.phase) * 0.055 + flowAngle * 0.028;
        node.particle.alpha = 1;
      }
    }
  }

  private drawMesh(): void {
    const g = this.meshGfx;
    const glow = this.glowGfx;
    g.clear();
    glow.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: C_CRUST });
    this.drawBackdrop(g);
    this.drawIconGlows(glow);

    for (let row = 0; row < this.rows.length; row++) {
      for (let col = 0; col < this.rows[row].length; col++) {
        const current = this.rows[row][col];
        const right = this.rows[row][col + 1];
        const below = this.rows[row + 1]?.[col];
        const diagonal =
          row % 2 === 0
            ? this.rows[row + 1]?.[col + 1]
            : this.rows[row + 1]?.[col - 1];

        if (right) this.drawSegment(g, current, right, 1);
        if (below) this.drawSegment(g, current, below, 1.08);
        if (diagonal) this.drawSegment(g, current, diagonal, 0.64);
      }
    }
  }

  private drawIconGlows(glow: Graphics): void {
    for (const row of this.rows) {
      for (const node of row) {
        const lift = Math.max(0, node.elevation);
        const haloRadius = 14 + node.depth * 11 + lift * 18;
        const coreRadius = haloRadius * 0.48;

        let color = C_SKY;
        if (node.depth > 0.76) color = C_ROSEWATER;
        else if (node.depth > 0.5) color = C_LAVENDER;
        else if (lift > 0.22) color = C_MAUVE;

        glow.circle(node.x, node.y, haloRadius).fill({
          color,
          alpha: 0.07 + node.depth * 0.05 + lift * 0.14,
        });
        glow.circle(node.x, node.y, coreRadius).fill({
          color,
          alpha: 0.08 + node.depth * 0.06 + lift * 0.12,
        });
      }
    }
  }

  private drawBackdrop(g: Graphics): void {
    const radius = Math.min(this.w, this.h);

    g.circle(this.w * 0.22, this.h * 0.24, radius * 0.34).fill({
      color: C_MANTLE,
      alpha: 0.78,
    });
    g.circle(this.w * 0.78, this.h * 0.74, radius * 0.42).fill({
      color: C_MANTLE,
      alpha: 0.62,
    });
    g.circle(this.w * 0.52, this.h * 0.5, radius * 0.28).fill({
      color: C_SURFACE0,
      alpha: 0.16,
    });
    g.circle(this.w * 0.5, this.h * 0.5, radius * 0.22).fill({
      color: C_SURFACE1,
      alpha: 0.08,
    });

    for (const blob of this.atmosphereBlobs) {
      const x =
        this.w * blob.xNorm +
        Math.sin(this.time * blob.speed + blob.phase) * this.w * blob.driftX;
      const y =
        this.h * blob.yNorm +
        Math.cos(this.time * (blob.speed * 0.8) + blob.phase * 0.7) *
          this.h *
          blob.driftY;
      const blobRadius =
        radius *
        blob.radiusNorm *
        (0.9 + Math.sin(this.time * blob.speed * 1.7 + blob.phase) * 0.08);

      g.circle(x, y, blobRadius).fill({
        color: blob.color,
        alpha: blob.alpha,
      });
    }

    for (const mote of this.atmosphereMotes) {
      const yBase = (mote.yNorm * this.h - this.time * mote.rise * 6) % this.h;
      const y = yBase < 0 ? yBase + this.h : yBase;
      const x =
        mote.xNorm * this.w +
        Math.sin(this.time * mote.speed + mote.phase) * mote.sway;
      const twinkle =
        0.45 + Math.sin(this.time * (mote.speed * 2.2) + mote.phase) * 0.35;

      g.circle(x, y, mote.radius * (0.75 + twinkle * 0.35)).fill({
        color: mote.color,
        alpha: mote.alpha * twinkle,
      });
    }
  }

  private drawSegment(
    g: Graphics,
    a: MeshNode,
    b: MeshNode,
    strength: number,
  ): void {
    const avgDepth = (a.depth + b.depth) * 0.5;
    const relief = Math.abs(a.elevation - b.elevation);
    const lift = Math.max(0, (a.elevation + b.elevation) * 0.5);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let color = C_SKY;
    if (avgDepth > 0.76) color = C_ROSEWATER;
    else if (avgDepth > 0.48) color = C_LAVENDER;
    else if (lift > 0.2) color = C_MAUVE;

    const alpha = clamp(
      (0.12 + avgDepth * 0.34 + lift * 0.32 + relief) * strength,
      0.08,
      0.82,
    );
    const dotRadius = 0.24 + avgDepth * 0.12 + relief * 0.42;
    const step = DOT_SEGMENT_STEP + (1 - avgDepth) * 2;
    const count = Math.max(2, Math.floor(distance / step));

    for (let index = 0; index <= count; index++) {
      const t = index / count;
      const x = a.x + dx * t;
      const y = a.y + dy * t;

      g.circle(x, y, dotRadius).fill({
        color,
        alpha,
      });
    }
  }
}
