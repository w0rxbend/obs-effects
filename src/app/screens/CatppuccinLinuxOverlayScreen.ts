import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { clamp, TAU } from "../../lib/math";

const C_CRUST = 0x11111b;
const C_MANTLE = 0x181825;
const C_SURFACE0 = 0x313244;
const C_SURFACE1 = 0x45475a;
const C_LAVENDER = 0xb4befe;
const C_MAUVE = 0xcba6f7;
const C_SKY = 0x89dceb;
const C_SAPPHIRE = 0x74c7ec;
const C_TEAL = 0x94e2d5;
const C_PEACH = 0xfab387;
const C_ROSEWATER = 0xf5e0dc;

const MAX_DT = 0.05;
const ALPHA_THRESHOLD = 24;
const SEGMENT_DOT_STEP = 4;
const MAX_MESH_POINTS = 9;
const SHAPE_URL = "assets/main/linux.svg";

interface ShapeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface ShapeNode {
  row: number;
  col: number;
  nx: number;
  ny: number;
  phase: number;
  drift: number;
  interiorBias: number;
  relX: number;
  relY: number;
  x: number;
  y: number;
  elevation: number;
  primaryPhaseSin: number;
  primaryPhaseCos: number;
  secondaryPhaseSin: number;
  secondaryPhaseCos: number;
  ribbonPhaseSin: number;
  ribbonPhaseCos: number;
  swirlPhaseSin: number;
  swirlPhaseCos: number;
  swayPhaseSin: number;
  swayPhaseCos: number;
  ripplePhaseSin: number;
  ripplePhaseCos: number;
  liftPhaseSin: number;
  liftPhaseCos: number;
}

interface MeshSegment {
  a: number;
  b: number;
  strength: number;
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

interface FloatingMeshCluster {
  xNorm: number;
  yNorm: number;
  radiusNorm: number;
  pointCount: number;
  driftX: number;
  driftY: number;
  spin: number;
  phase: number;
  speed: number;
  alpha: number;
  color: number;
}

export class CatppuccinLinuxOverlayScreen extends Container {
  public static assetBundles = ["main"];

  private readonly backdropGfx = new Graphics();
  private readonly atmosphereGfx = new Graphics();
  private readonly auraGfx = new Graphics();
  private readonly gfx = new Graphics();

  private readonly nodes: ShapeNode[] = [];
  private readonly segments: MeshSegment[] = [];

  private atmosphereMotes: AtmosphereMote[] = [];
  private floatingMeshes: FloatingMeshCluster[] = [];
  private bounds: ShapeBounds = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1,
    width: 1,
    height: 1,
    centerX: 0.5,
    centerY: 0.5,
  };

  // Pixi copies a style object into its own record on every fill()/stroke(),
  // so a single mutable literal can serve every primitive in the frame.
  private readonly fillScratch = { color: 0, alpha: 1 };
  private readonly strokeScratch = { color: 0, alpha: 1, width: 1 };
  private readonly meshPointX = new Float64Array(MAX_MESH_POINTS);
  private readonly meshPointY = new Float64Array(MAX_MESH_POINTS);

  // Style currently held by `gfx`, so repeated styles can reuse it.
  private meshFillColor = -1;
  private meshFillAlpha = -1;

  private w = 1920;
  private h = 1080;
  private time = 0;
  private centerX = 960;
  private centerY = 540;
  private renderWidth = 1;
  private renderHeight = 1;
  private shapeReady = false;
  private backdropDirty = true;
  private auraDirty = true;

  constructor() {
    super();
    this.addChild(this.backdropGfx);
    this.addChild(this.atmosphereGfx);
    this.addChild(this.auraGfx);
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.backdropDirty = true;
    this.rebuildAtmosphere();

    if (!this.shapeReady) {
      await this.loadShape();
    }

    this.layoutShape();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.backdropDirty = true;
    this.rebuildAtmosphere();

    if (this.shapeReady) {
      this.layoutShape();
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, MAX_DT);
    this.time += dt;

    if (this.shapeReady) {
      this.updateNodes();
    }

    this.draw();
  }

  private async loadShape(): Promise<void> {
    const image = await this.loadImage(SHAPE_URL);
    const sampleWidth = Math.max(
      1024,
      image.naturalWidth || image.width || 512,
    );
    const sampleHeight = Math.max(
      1024,
      image.naturalHeight || image.height || 512,
    );
    const canvas = document.createElement("canvas");

    canvas.width = sampleWidth;
    canvas.height = sampleHeight;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error(
        "Unable to create canvas context for linux.svg sampling.",
      );
    }

    ctx.clearRect(0, 0, sampleWidth, sampleHeight);
    ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const step = Math.max(
      6,
      Math.round(Math.min(sampleWidth, sampleHeight) / 110),
    );
    const start = step * 0.5;
    const indexByCell = new Map<string, number>();

    this.nodes.length = 0;
    this.segments.length = 0;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let row = 0;

    for (let y = start; y <= sampleHeight - start; y += step) {
      let col = 0;

      for (let x = start; x <= sampleWidth - start; x += step) {
        if (!this.hasShapePixel(data, sampleWidth, sampleHeight, x, y)) {
          col++;
          continue;
        }

        const nx = x / sampleWidth;
        const ny = y / sampleHeight;
        const index = this.nodes.length;

        this.nodes.push({
          row,
          col,
          nx,
          ny,
          phase: ((nx * 3.8 + ny * 2.7) % 1) * TAU,
          drift: ((nx * 1.9 + ny * 4.4) % 1) * TAU,
          interiorBias: 0.5,
          relX: 0,
          relY: 0,
          x: 0,
          y: 0,
          elevation: 0,
          primaryPhaseSin: 0,
          primaryPhaseCos: 1,
          secondaryPhaseSin: 0,
          secondaryPhaseCos: 1,
          ribbonPhaseSin: 0,
          ribbonPhaseCos: 1,
          swirlPhaseSin: 0,
          swirlPhaseCos: 1,
          swayPhaseSin: 0,
          swayPhaseCos: 1,
          ripplePhaseSin: 0,
          ripplePhaseCos: 1,
          liftPhaseSin: 0,
          liftPhaseCos: 1,
        });
        indexByCell.set(`${row}:${col}`, index);

        minX = Math.min(minX, nx);
        maxX = Math.max(maxX, nx);
        minY = Math.min(minY, ny);
        maxY = Math.max(maxY, ny);

        col++;
      }

      row++;
    }

    if (this.nodes.length === 0) {
      throw new Error("linux.svg sampling produced no mesh nodes.");
    }

    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ] as const;

    for (const node of this.nodes) {
      let neighborCount = 0;

      for (const [dr, dc] of directions) {
        if (indexByCell.has(`${node.row + dr}:${node.col + dc}`)) {
          neighborCount++;
        }
      }

      node.interiorBias = clamp(0.2 + (neighborCount / 8) * 0.8, 0.2, 1);

      const right = indexByCell.get(`${node.row}:${node.col + 1}`);
      const down = indexByCell.get(`${node.row + 1}:${node.col}`);
      const diagonal = indexByCell.get(
        `${node.row + 1}:${node.col + (node.row % 2 === 0 ? 1 : -1)}`,
      );

      if (right !== undefined) {
        this.segments.push({
          a: indexByCell.get(`${node.row}:${node.col}`)!,
          b: right,
          strength: 0.82,
        });
      }

      if (down !== undefined) {
        this.segments.push({
          a: indexByCell.get(`${node.row}:${node.col}`)!,
          b: down,
          strength: 1,
        });
      }

      if (diagonal !== undefined) {
        this.segments.push({
          a: indexByCell.get(`${node.row}:${node.col}`)!,
          b: diagonal,
          strength: 0.56,
        });
      }
    }

    this.bounds = {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(maxX - minX, 0.001),
      height: Math.max(maxY - minY, 0.001),
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
    };
    this.shapeReady = true;
  }

  private hasShapePixel(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
  ): boolean {
    const px = Math.round(x);
    const py = Math.round(y);
    let alphaHits = 0;

    for (let oy = -1; oy <= 1; oy++) {
      const sy = clamp(py + oy * 2, 0, height - 1);

      for (let ox = -1; ox <= 1; ox++) {
        const sx = clamp(px + ox * 2, 0, width - 1);
        const alpha = data[(sy * width + sx) * 4 + 3];

        if (alpha > ALPHA_THRESHOLD) {
          alphaHits++;
        }
      }
    }

    return alphaHits >= 3;
  }

  private async loadImage(src: string): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load ${src}.`));
      image.src = src;
    });
  }

  private layoutShape(): void {
    const isPortrait = this.w < this.h;
    const availableWidth = this.w * (isPortrait ? 0.72 : 0.38);
    const availableHeight = this.h * (isPortrait ? 0.44 : 0.72);
    const scale = Math.min(
      availableWidth / this.bounds.width,
      availableHeight / this.bounds.height,
    );

    this.renderWidth = this.bounds.width * scale;
    this.renderHeight = this.bounds.height * scale;
    this.centerX = this.w * 0.5;
    this.centerY = this.h * (isPortrait ? 0.5 : 0.54);

    const halfWidth = Math.max(this.renderWidth * 0.5, 1);
    const halfHeight = Math.max(this.renderHeight * 0.5, 1);

    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];

      node.relX = (node.nx - this.bounds.centerX) * scale;
      node.relY = (node.ny - this.bounds.centerY) * scale;
      node.x = this.centerX + node.relX;
      node.y = this.centerY + node.relY;

      this.cacheNodePhases(node, node.relX / halfWidth, node.relY / halfHeight);
    }

    this.auraDirty = true;
  }

  /**
   * The displacement field mixes seven sine waves whose only per-frame input is
   * elapsed time; the rest of each angle (grid position plus the node's phase
   * offsets) is fixed until the next layout. Caching the sine and cosine of that
   * fixed part lets `updateNodes` expand `sin(phase +- time)` with the angle-sum
   * identity, trading seven transcendental calls per node per frame for a few
   * multiplies.
   */
  private cacheNodePhases(node: ShapeNode, normX: number, normY: number): void {
    const primaryPhase = normX * 4.8 + node.phase;
    const secondaryPhase = normY * 6.3 + node.drift;
    const ribbonPhase = (normX + normY) * 5.6 + node.phase * 0.7;
    const swirlPhase = (normX - normY) * 4.2 - node.drift;
    const swayPhase = node.phase + normY * 3.4;
    const ripplePhase = normX * 5.8;
    const liftPhase = node.drift + normX * 3.1;

    node.primaryPhaseSin = Math.sin(primaryPhase);
    node.primaryPhaseCos = Math.cos(primaryPhase);
    node.secondaryPhaseSin = Math.sin(secondaryPhase);
    node.secondaryPhaseCos = Math.cos(secondaryPhase);
    node.ribbonPhaseSin = Math.sin(ribbonPhase);
    node.ribbonPhaseCos = Math.cos(ribbonPhase);
    node.swirlPhaseSin = Math.sin(swirlPhase);
    node.swirlPhaseCos = Math.cos(swirlPhase);
    node.swayPhaseSin = Math.sin(swayPhase);
    node.swayPhaseCos = Math.cos(swayPhase);
    node.ripplePhaseSin = Math.sin(ripplePhase);
    node.ripplePhaseCos = Math.cos(ripplePhase);
    node.liftPhaseSin = Math.sin(liftPhase);
    node.liftPhaseCos = Math.cos(liftPhase);
  }

  private rebuildAtmosphere(): void {
    this.atmosphereMotes = [];
    this.floatingMeshes = [];
    const moteColors = [
      C_LAVENDER,
      C_MAUVE,
      C_SKY,
      C_SAPPHIRE,
      C_PEACH,
      C_ROSEWATER,
    ];
    const meshColors = [C_LAVENDER, C_MAUVE, C_SKY, C_SAPPHIRE, C_TEAL];

    const densityScale = (this.w * this.h) / (1920 * 1080);
    const moteCount = Math.max(120, Math.floor(220 * densityScale));

    for (let index = 0; index < moteCount; index++) {
      this.atmosphereMotes.push({
        xNorm: Math.random(),
        yNorm: Math.random(),
        radius: 0.6 + Math.random() * 1.5,
        sway: 8 + Math.random() * 22,
        rise: 5 + Math.random() * 18,
        phase: Math.random() * TAU,
        speed: 0.16 + Math.random() * 0.44,
        alpha: 0.08 + Math.random() * 0.2,
        color: moteColors[index % moteColors.length],
      });
    }

    const meshCount = Math.max(10, Math.floor(18 * densityScale));

    for (let index = 0; index < meshCount; index++) {
      this.floatingMeshes.push({
        xNorm: Math.random(),
        yNorm: Math.random(),
        radiusNorm: 0.035 + Math.random() * 0.08,
        pointCount: 5 + Math.floor(Math.random() * 5),
        driftX: 0.012 + Math.random() * 0.035,
        driftY: 0.012 + Math.random() * 0.03,
        spin: 0.2 + Math.random() * 0.7,
        phase: Math.random() * TAU,
        speed: 0.05 + Math.random() * 0.16,
        alpha: 0.08 + Math.random() * 0.12,
        color: meshColors[index % meshColors.length],
      });
    }
  }

  private updateNodes(): void {
    const time = this.time;
    const centerX = this.centerX;
    const centerY = this.centerY;
    const primaryTimeSin = Math.sin(time * 0.42);
    const primaryTimeCos = Math.cos(time * 0.42);
    const secondaryTimeSin = Math.sin(time * 0.28);
    const secondaryTimeCos = Math.cos(time * 0.28);
    const ribbonTimeSin = Math.sin(time * 0.36);
    const ribbonTimeCos = Math.cos(time * 0.36);
    const swirlTimeSin = Math.sin(time * 0.22);
    const swirlTimeCos = Math.cos(time * 0.22);
    const swayTimeSin = Math.sin(time * 0.24);
    const swayTimeCos = Math.cos(time * 0.24);
    const rippleTimeSin = Math.sin(time * 0.16);
    const rippleTimeCos = Math.cos(time * 0.16);
    const liftTimeSin = Math.sin(time * 0.21);
    const liftTimeCos = Math.cos(time * 0.21);
    const pulse = 1 + swayTimeSin * 0.012;
    const skew = Math.sin(time * 0.18) * 0.02;

    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];
      const primary =
        (node.primaryPhaseSin * primaryTimeCos -
          node.primaryPhaseCos * primaryTimeSin) *
        0.72;
      const secondary =
        (node.secondaryPhaseCos * secondaryTimeCos +
          node.secondaryPhaseSin * secondaryTimeSin) *
        0.44;
      const ribbon =
        (node.ribbonPhaseSin * ribbonTimeCos -
          node.ribbonPhaseCos * ribbonTimeSin) *
        0.32;
      const swirl =
        (node.swirlPhaseCos * swirlTimeCos -
          node.swirlPhaseSin * swirlTimeSin) *
        0.22;
      const swell = primary + secondary + ribbon + swirl;
      const crest = Math.max(
        0,
        primary * 0.78 + secondary * 0.24 + ribbon * 0.36,
      );
      const damping = 0.2 + node.interiorBias * 0.8;

      const baseX = centerX + node.relX * pulse + node.relY * skew;
      const baseY = centerY + node.relY * (1 - pulse * 0.014);
      const flowX =
        (node.swayPhaseCos * swayTimeCos - node.swayPhaseSin * swayTimeSin) *
          (2.4 + crest * 6.8) *
          damping +
        (node.ripplePhaseSin * rippleTimeCos +
          node.ripplePhaseCos * rippleTimeSin) *
          1.4 *
          damping;
      const flowY =
        (node.liftPhaseSin * liftTimeCos + node.liftPhaseCos * liftTimeSin) *
          (2.8 + crest * 7.2) *
          damping -
        crest * (1.8 + node.interiorBias * 3.4);

      node.elevation = swell * 0.3 + crest * 0.7;
      node.x = baseX + flowX;
      node.y = baseY + flowY;
    }
  }

  private draw(): void {
    if (this.backdropDirty) {
      this.drawBackdrop();
      this.backdropDirty = false;
    }

    if (this.auraDirty) {
      this.drawShapeAura();
      this.auraDirty = false;
    }

    this.drawAtmosphere();

    const g = this.gfx;

    g.clear();

    if (!this.shapeReady) {
      return;
    }

    for (let index = 0; index < this.segments.length; index++) {
      const segment = this.segments[index];

      this.drawSegment(
        this.nodes[segment.a],
        this.nodes[segment.b],
        segment.strength,
      );
    }

    for (let index = 0; index < this.nodes.length; index++) {
      this.drawNode(this.nodes[index]);
    }
  }

  private drawBackdrop(): void {
    const g = this.backdropGfx;
    const radius = Math.min(this.w, this.h);

    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: C_CRUST });
    g.circle(this.w * 0.18, this.h * 0.18, radius * 0.52).fill({
      color: C_MANTLE,
      alpha: 0.96,
    });
    g.circle(this.w * 0.84, this.h * 0.82, radius * 0.62).fill({
      color: C_MANTLE,
      alpha: 0.88,
    });
    g.circle(this.w * 0.54, this.h * 0.5, radius * 0.44).fill({
      color: C_SURFACE0,
      alpha: 0.15,
    });
    g.circle(this.w * 0.4, this.h * 0.36, radius * 0.3).fill({
      color: C_SURFACE1,
      alpha: 0.09,
    });
  }

  private drawAtmosphere(): void {
    const g = this.atmosphereGfx;
    const radius = Math.min(this.w, this.h);
    const time = this.time;
    const fill = this.fillScratch;

    g.clear();

    for (let index = 0; index < this.floatingMeshes.length; index++) {
      this.drawFloatingMesh(g, this.floatingMeshes[index], radius);
    }

    for (let index = 0; index < this.atmosphereMotes.length; index++) {
      const mote = this.atmosphereMotes[index];
      const yBase = (mote.yNorm * this.h - time * mote.rise * 6) % this.h;
      const y = yBase < 0 ? yBase + this.h : yBase;
      const x =
        mote.xNorm * this.w +
        Math.sin(time * mote.speed + mote.phase) * mote.sway;
      const twinkle =
        0.5 + Math.sin(time * (mote.speed * 2.4) + mote.phase) * 0.3;

      fill.color = mote.color;
      fill.alpha = mote.alpha * twinkle;
      g.circle(x, y, mote.radius * (0.78 + twinkle * 0.3)).fill(fill);
    }
  }

  private drawFloatingMesh(
    g: Graphics,
    mesh: FloatingMeshCluster,
    radius: number,
  ): void {
    const time = this.time;
    const centerX =
      this.w * mesh.xNorm +
      Math.sin(time * mesh.speed + mesh.phase) * this.w * mesh.driftX;
    const centerY =
      this.h * mesh.yNorm +
      Math.cos(time * (mesh.speed * 0.86) + mesh.phase * 0.7) *
        this.h *
        mesh.driftY;
    const clusterRadius =
      radius *
      mesh.radiusNorm *
      (0.92 + Math.sin(time * mesh.speed * 1.9 + mesh.phase) * 0.1);
    const rotation = time * mesh.spin + mesh.phase;
    const pointCount = mesh.pointCount;
    const pointX = this.meshPointX;
    const pointY = this.meshPointY;
    const fill = this.fillScratch;
    const stroke = this.strokeScratch;

    for (let index = 0; index < pointCount; index++) {
      const t = index / pointCount;
      const angle = rotation + t * TAU;
      const wobble =
        0.68 +
        Math.sin(time * 0.7 + mesh.phase + index * 0.9) * 0.16 +
        Math.cos(time * 0.42 + index * 0.7) * 0.08;

      pointX[index] = centerX + Math.cos(angle) * clusterRadius * wobble;
      pointY[index] =
        centerY + Math.sin(angle) * clusterRadius * (0.64 + wobble * 0.3);
    }

    fill.color = mesh.color;
    fill.alpha = mesh.alpha * 0.12;
    g.circle(centerX, centerY, clusterRadius * 1.2).fill(fill);

    stroke.color = mesh.color;

    for (let index = 0; index < pointCount; index++) {
      const next = (index + 1) % pointCount;
      const skip = (index + 2) % pointCount;

      stroke.alpha = mesh.alpha * 0.7;
      g.moveTo(pointX[index], pointY[index])
        .lineTo(pointX[next], pointY[next])
        .stroke(stroke);

      if (index % 2 === 0) {
        stroke.alpha = mesh.alpha * 0.28;
        g.moveTo(pointX[index], pointY[index])
          .lineTo(pointX[skip], pointY[skip])
          .stroke(stroke);
      }

      fill.color = mesh.color;
      fill.alpha = mesh.alpha * 1.1;
      g.circle(pointX[index], pointY[index], 1.1).fill(fill);
    }
  }

  private drawShapeAura(): void {
    const g = this.auraGfx;
    const auraRadius = Math.max(this.renderWidth, this.renderHeight, 180);

    g.clear();
    g.circle(this.centerX, this.centerY, auraRadius * 0.42).fill({
      color: C_MAUVE,
      alpha: 0.07,
    });
    g.circle(
      this.centerX,
      this.centerY - this.renderHeight * 0.08,
      auraRadius * 0.26,
    ).fill({
      color: C_LAVENDER,
      alpha: 0.08,
    });
    g.circle(
      this.centerX + this.renderWidth * 0.12,
      this.centerY + this.renderHeight * 0.06,
      auraRadius * 0.2,
    ).fill({
      color: C_SAPPHIRE,
      alpha: 0.045,
    });
  }

  private drawSegment(a: ShapeNode, b: ShapeNode, strength: number): void {
    const g = this.gfx;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const relief = Math.abs(a.elevation - b.elevation);
    const lift = Math.max(0, (a.elevation + b.elevation) * 0.5);
    const count = Math.max(2, Math.floor(distance / SEGMENT_DOT_STEP));
    const alpha = clamp(
      0.08 + strength * 0.08 + lift * 0.16 + relief * 0.08,
      0.07,
      0.34,
    );
    const radius = 0.45 + strength * 0.14 + lift * 0.24;
    const color = lift > 0.8 ? C_ROSEWATER : lift > 0.22 ? C_MAUVE : C_LAVENDER;

    for (let index = 0; index <= count; index++) {
      const t = index / count;

      g.circle(a.x + dx * t, a.y + dy * t, radius);
    }

    // Every dot on a segment shares one style, and Pixi triangulates each
    // circle of a path on its own, so a single fill draws the whole chain with
    // the same result as filling dot by dot.
    this.fillMesh(color, alpha);
  }

  private drawNode(node: ShapeNode): void {
    const g = this.gfx;
    const lift = Math.max(0, node.elevation);
    const glowRadius = 2 + node.interiorBias * 1.5 + lift * 2.2;
    const dotRadius = 0.72 + node.interiorBias * 0.38 + lift * 0.54;
    const alpha = clamp(
      0.58 + node.interiorBias * 0.18 + lift * 0.16,
      0.45,
      0.92,
    );
    const color = lift > 0.92 ? C_ROSEWATER : lift > 0.3 ? C_MAUVE : C_LAVENDER;

    g.circle(node.x, node.y, glowRadius * 1.7);
    this.fillMesh(C_LAVENDER, 0.018 + lift * 0.03);
    g.circle(node.x, node.y, dotRadius);
    this.fillMesh(color, alpha);
  }

  private fillMesh(color: number, alpha: number): void {
    if (color === this.meshFillColor && alpha === this.meshFillAlpha) {
      // The context still holds this style, so a bare fill() reuses it instead
      // of building another style record.
      this.gfx.fill();
      return;
    }

    this.meshFillColor = color;
    this.meshFillAlpha = alpha;
    this.fillScratch.color = color;
    this.fillScratch.alpha = alpha;
    this.gfx.fill(this.fillScratch);
  }
}
