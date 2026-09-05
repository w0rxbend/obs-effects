import type { Ticker } from "pixi.js";
import {
  Assets,
  Container,
  Graphics,
  GraphicsPath,
  Sprite,
  Texture,
} from "pixi.js";
import { clamp, TAU } from "../../lib/math";

const BG = 0x080304;
const BG_DEEP = 0x120405;
const BG_MID = 0x1a0708;
const BG_WARM = 0x240b0a;
const CBLACK = 0x040404;
const CRED_CORE = 0xff3048;
const CRED = 0xff5a5f;
const CEMBER = 0xff7a45;
const CAMBER = 0xffa14d;
const CHOT = 0xffddb3;
const BACKGROUND_PENTAGRAM_COUNT = 4;
const BACKGROUND_ASSET_PENTAGRAM_COUNT = 3;
const BACKGROUND_SIGIL_SIZE = 460;

const MAX_DT = 0.05;
const SEGMENT_DOT_STEP = 6;

/** Number of `Float64Array` slots {@link EmberPentagramOverlayScreen} keeps per node. */
const WAVE_STRIDE = 20;

/**
 * Scratch objects reused by the frame loop.
 *
 * Pixi copies a fill/stroke input into its own style object the moment it is
 * handed over, so passing the same mutable object on every call behaves exactly
 * like passing a fresh literal — it just does not allocate one per draw.
 * `segmentDotPath` is reused the same way: `Graphics.path()` clones whatever it
 * is given, so the buffer is free to be cleared and refilled for the next
 * segment.
 */
const fillScratch = { color: 0, alpha: 1 };
const strokeScratch = { color: 0, alpha: 1, width: 1 };
const segmentDotPath = new GraphicsPath();

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
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  interiorBias: number;
  relX: number;
  relY: number;
  x: number;
  y: number;
  elevation: number;
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

interface Point2D {
  x: number;
  y: number;
}

interface FloatingPentagram {
  container: Container;
  baseScale: number;
  phase: number;
  alphaSpeed: number;
  spin: number;
  baseAlpha: number;
  style: "seal" | "brush";
  orbitAngle: number;
  orbitRadius: number;
  angularSpeed: number;
  radialWobble: number;
}

interface FloatingAssetPentagram {
  sprite: Sprite;
  baseScale: number;
  phase: number;
  alphaSpeed: number;
  spin: number;
  baseAlpha: number;
  orbitAngle: number;
  orbitRadius: number;
  angularSpeed: number;
  radialWobble: number;
}

/**
 * One orbiting backdrop sigil, drawn sigil or sprite alike, plus the position
 * the separation passes push around. Built once and mutated in place.
 */
interface OrbitBody {
  display: Container;
  orbitAngle: number;
  orbitRadius: number;
  angularSpeed: number;
  radialWobble: number;
  phase: number;
  alphaSpeed: number;
  baseAlpha: number;
  spin: number;
  x: number;
  y: number;
  sizeRadius: number;
}

export class EmberPentagramOverlayScreen extends Container {
  public static assetBundles = ["main"];

  private readonly backdropGfx = new Graphics();
  private readonly backgroundPentagramLayer = new Container();
  private readonly sigilGfx = new Graphics();

  private readonly nodes: ShapeNode[] = [];
  private readonly segments: MeshSegment[] = [];

  private atmosphereMotes: AtmosphereMote[] = [];
  private floatingMeshes: FloatingMeshCluster[] = [];
  private readonly backgroundPentagrams: FloatingPentagram[] = [];
  private readonly backgroundAssetPentagrams: FloatingAssetPentagram[] = [];
  private readonly orbitBodies: OrbitBody[] = [];

  /**
   * Layout-fixed inputs of {@link updateNodes}, packed `WAVE_STRIDE` numbers per
   * node. Rebuilt by {@link layoutShape}; see {@link rebuildWaveTable}.
   */
  private waveTable = new Float64Array(0);

  /** Ring of cluster points reused by {@link drawFloatingMesh}, as x/y pairs. */
  private meshPointBuffer = new Float64Array(0);

  private bounds: ShapeBounds = {
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
    width: 2,
    height: 2,
    centerX: 0,
    centerY: 0,
  };

  private w = 1920;
  private h = 1080;
  private time = 0;
  private centerX = 960;
  private centerY = 540;
  private renderWidth = 1;
  private renderHeight = 1;
  private shapeReady = false;

  constructor() {
    super();
    this.addChild(this.backdropGfx);
    this.addChild(this.backgroundPentagramLayer);
    this.addChild(this.sigilGfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.ensureBackgroundAssetPentagrams();
    this.ensureBackgroundPentagrams();
    this.rebuildAtmosphere();

    if (!this.shapeReady) {
      this.buildPentagramShape();
    }

    this.layoutShape();
    this.layoutBackgroundAssetPentagrams();
    this.layoutBackgroundPentagrams();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuildAtmosphere();
    this.layoutBackgroundAssetPentagrams();
    this.layoutBackgroundPentagrams();

    if (this.shapeReady) {
      this.layoutShape();
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, MAX_DT);
    this.time += dt;

    this.updateBackgroundSigils();

    if (this.shapeReady) {
      this.updateNodes();
    }

    this.draw();
  }

  private buildPentagramShape(): void {
    this.nodes.length = 0;
    this.segments.length = 0;

    const indexByKey = new Map<string, number>();
    const starOuter: Point2D[] = [];
    const starOrder = [0, 2, 4, 1, 3];
    const ringBands = [-0.014, 0.014];
    const strokeBands = [-0.034, 0, 0.034];

    const addNode = (
      baseX: number,
      baseY: number,
      interiorBias: number,
    ): number => {
      const key = `${Math.round(baseX * 2200)}:${Math.round(baseY * 2200)}`;
      const existing = indexByKey.get(key);

      if (existing !== undefined) {
        const node = this.nodes[existing];
        node.interiorBias = Math.max(node.interiorBias, interiorBias);
        return existing;
      }

      const index = this.nodes.length;
      this.nodes.push({
        baseX,
        baseY,
        phase: ((baseX * 0.73 + baseY * 0.49) % 1) * TAU,
        drift: ((baseX * 0.36 - baseY * 0.58) % 1) * TAU,
        interiorBias,
        relX: 0,
        relY: 0,
        x: 0,
        y: 0,
        elevation: 0,
      });
      indexByKey.set(key, index);
      return index;
    };

    const connectSequential = (
      indices: number[],
      strength: number,
      closed = false,
    ): void => {
      const limit = closed ? indices.length : indices.length - 1;

      for (let index = 0; index < limit; index++) {
        const a = indices[index];
        const b = indices[(index + 1) % indices.length];

        if (a !== b) {
          this.segments.push({ a, b, strength });
        }
      }
    };

    const connectBands = (
      bands: number[][],
      strength: number,
      closed = false,
    ): void => {
      if (bands.length < 2) return;

      const span = bands[0].length;
      const limit = closed ? span : span - 1;

      for (let bandIndex = 0; bandIndex < bands.length - 1; bandIndex++) {
        const current = bands[bandIndex];
        const next = bands[bandIndex + 1];

        for (let index = 0; index < limit; index++) {
          const a = current[index];
          const b = next[index];
          const c = next[(index + 1) % span];

          if (a !== b) {
            this.segments.push({ a, b, strength });
          }

          if (index % 2 === 0 && a !== c) {
            this.segments.push({ a, b: c, strength: strength * 0.72 });
          }
        }
      }
    };

    for (let index = 0; index < 5; index++) {
      const angle = Math.PI * 0.5 + (index / 5) * TAU;
      starOuter.push({
        x: Math.cos(angle),
        y: Math.sin(angle),
      });
    }

    for (
      let segmentIndex = 0;
      segmentIndex < starOrder.length;
      segmentIndex++
    ) {
      const start = starOuter[starOrder[segmentIndex]];
      const end = starOuter[starOrder[(segmentIndex + 1) % starOrder.length]];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const samples = 120;
      const bands = strokeBands.map(() => [] as number[]);

      for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        const taper = 0.74 + Math.sin(t * Math.PI) * 0.32;
        const baseX = start.x + dx * t;
        const baseY = start.y + dy * t;

        for (let bandIndex = 0; bandIndex < strokeBands.length; bandIndex++) {
          const band = strokeBands[bandIndex];
          const jitter =
            Math.sin(t * TAU * 4 + segmentIndex * 0.9 + bandIndex * 0.75) *
              0.004 +
            Math.cos(t * TAU * 2.4 + bandIndex * 0.6) * 0.002;
          const offset = band * taper + jitter;
          const interiorBias = clamp(
            0.56 + (1 - Math.abs(band) / 0.05) * 0.42,
            0.42,
            1,
          );

          bands[bandIndex].push(
            addNode(
              baseX + normalX * offset,
              baseY + normalY * offset,
              interiorBias,
            ),
          );
        }
      }

      for (const band of bands) {
        connectSequential(band, 0.88);
      }

      connectBands(bands, 0.56);
    }

    const ringRadius = 1.1;
    const ringSamples = 260;
    const ringTraces = ringBands.map(() => [] as number[]);

    for (let sample = 0; sample < ringSamples; sample++) {
      const angle = (sample / ringSamples) * TAU - Math.PI * 0.5;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);

      for (let bandIndex = 0; bandIndex < ringBands.length; bandIndex++) {
        const band = ringBands[bandIndex];
        const ripple =
          Math.sin(angle * 5 + bandIndex * 1.4) * 0.004 +
          Math.cos(angle * 10 - bandIndex * 0.7) * 0.002;
        const radius = ringRadius + band + ripple;
        const interiorBias = bandIndex === 1 ? 0.96 : 0.76;

        ringTraces[bandIndex].push(
          addNode(cosAngle * radius, sinAngle * radius, interiorBias),
        );
      }
    }

    for (const trace of ringTraces) {
      connectSequential(trace, 0.92, true);
    }

    connectBands(ringTraces, 0.6, true);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of this.nodes) {
      minX = Math.min(minX, node.baseX);
      maxX = Math.max(maxX, node.baseX);
      minY = Math.min(minY, node.baseY);
      maxY = Math.max(maxY, node.baseY);
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

  private ensureBackgroundPentagrams(): void {
    if (this.backgroundPentagrams.length > 0) return;

    for (let index = 0; index < BACKGROUND_PENTAGRAM_COUNT; index++) {
      const style = index % 2 === 0 ? "seal" : "brush";
      const container =
        style === "seal"
          ? this.createSealBackdropSigil()
          : this.createBrushBackdropSigil();

      this.backgroundPentagramLayer.addChild(container);

      this.backgroundPentagrams.push({
        container,
        baseScale: 0.16 + Math.random() * 0.14,
        phase: Math.random() * TAU,
        alphaSpeed: 0.05 + Math.random() * 0.09,
        spin: (Math.random() - 0.5) * 0.05,
        baseAlpha: 0.035 + Math.random() * 0.03,
        style,
        orbitAngle: (index / BACKGROUND_PENTAGRAM_COUNT) * TAU,
        orbitRadius: 0.78 + (index % 2) * 0.16,
        angularSpeed: 0.03 + Math.random() * 0.035,
        radialWobble: 12 + Math.random() * 24,
      });
    }
  }

  private ensureBackgroundAssetPentagrams(): void {
    if (this.backgroundAssetPentagrams.length > 0) return;

    const texture = Assets.get<Texture>("pentagram.svg");

    for (let index = 0; index < BACKGROUND_ASSET_PENTAGRAM_COUNT; index++) {
      const sprite = new Sprite(texture);

      sprite.anchor.set(0.5);
      sprite.tint = CRED;
      sprite.alpha = 0.18;
      this.backgroundPentagramLayer.addChild(sprite);

      this.backgroundAssetPentagrams.push({
        sprite,
        baseScale: 0.14 + Math.random() * 0.1,
        phase: Math.random() * TAU,
        alphaSpeed: 0.04 + Math.random() * 0.08,
        spin: (Math.random() - 0.5) * 0.04,
        baseAlpha: 0.025 + Math.random() * 0.025,
        orbitAngle: ((index + 0.5) / BACKGROUND_ASSET_PENTAGRAM_COUNT) * TAU,
        orbitRadius: 0.62 + (index % 2) * 0.14,
        angularSpeed: 0.024 + Math.random() * 0.03,
        radialWobble: 10 + Math.random() * 18,
      });
    }
  }

  private layoutShape(): void {
    const isPortrait = this.w < this.h;
    const availableWidth = this.w * (isPortrait ? 0.84 : 0.58);
    const availableHeight = this.h * (isPortrait ? 0.58 : 0.88);
    const scale = Math.min(
      availableWidth / this.bounds.width,
      availableHeight / this.bounds.height,
    );

    this.renderWidth = this.bounds.width * scale;
    this.renderHeight = this.bounds.height * scale;
    this.centerX = this.w * 0.5;
    this.centerY = this.h * (isPortrait ? 0.5 : 0.54);

    for (const node of this.nodes) {
      node.relX = (node.baseX - this.bounds.centerX) * scale;
      node.relY = (node.baseY - this.bounds.centerY) * scale;
      node.x = this.centerX + node.relX;
      node.y = this.centerY + node.relY;
    }

    this.rebuildWaveTable();
  }

  /**
   * Precomputes everything {@link updateNodes} needs that only depends on the
   * layout, so the frame loop never has to touch `sqrt`, `atan2` or a division.
   *
   * The five displacement waves and the two drift terms all have the shape
   * `sin(fixedPhase + speed * time)`. Splitting that with the angle-addition
   * identity — `sin(a + b) = sin(a)cos(b) + cos(a)sin(b)` — lets the sine and
   * cosine of the node-fixed half be cached here, leaving the frame loop with
   * seven trig calls in total instead of seven per node.
   */
  private rebuildWaveTable(): void {
    const count = this.nodes.length;

    if (this.waveTable.length !== count * WAVE_STRIDE) {
      this.waveTable = new Float64Array(count * WAVE_STRIDE);
    }

    const table = this.waveTable;
    const halfWidth = Math.max(this.renderWidth * 0.5, 1);
    const halfHeight = Math.max(this.renderHeight * 0.5, 1);

    for (let index = 0; index < count; index++) {
      const node = this.nodes[index];
      const normX = node.relX / halfWidth;
      const normY = node.relY / halfHeight;
      const radial = Math.sqrt(normX * normX + normY * normY);
      const angle = Math.atan2(normY, normX);
      const primaryPhase = normX * 3.4 + node.phase;
      const diagonalPhase = (normX * 0.9 + normY * 1.2) * 4.8 + node.drift;
      const ringPhase = radial * 7.2 + Math.sin(angle * 3);
      const spiralPhase = angle * 4 + radial * 3.8 + node.phase;
      const ripplePhase = radial * 18 + node.phase * 1.4 + node.drift * 0.3;
      const swayPhase = normY * 3.2 + node.phase;
      const bobPhase = normX * 2.8 + node.drift;
      const base = index * WAVE_STRIDE;

      table[base] = Math.sin(primaryPhase);
      table[base + 1] = Math.cos(primaryPhase);
      table[base + 2] = Math.sin(diagonalPhase);
      table[base + 3] = Math.cos(diagonalPhase);
      table[base + 4] = Math.sin(ringPhase);
      table[base + 5] = Math.cos(ringPhase);
      table[base + 6] = Math.sin(spiralPhase);
      table[base + 7] = Math.cos(spiralPhase);
      table[base + 8] = Math.sin(ripplePhase);
      table[base + 9] = Math.cos(ripplePhase);
      table[base + 10] = Math.sin(swayPhase);
      table[base + 11] = Math.cos(swayPhase);
      table[base + 12] = Math.sin(bobPhase);
      table[base + 13] = Math.cos(bobPhase);
      table[base + 14] = radial > 0.0001 ? -normY / radial : 0;
      table[base + 15] = radial > 0.0001 ? normX / radial : 0;
      table[base + 16] = radial > 0.0001 ? normX / radial : 0;
      table[base + 17] = radial > 0.0001 ? normY / radial : 0;
      table[base + 18] = 0.2 + node.interiorBias * 0.8;
      table[base + 19] = 3.4 + node.interiorBias * 4.2;
    }
  }

  private layoutBackgroundPentagrams(): void {
    const size = Math.min(this.w, this.h);

    for (const pentagram of this.backgroundPentagrams) {
      const scale = (size / BACKGROUND_SIGIL_SIZE) * pentagram.baseScale;

      pentagram.container.scale.set(scale);
    }
  }

  private layoutBackgroundAssetPentagrams(): void {
    for (const pentagram of this.backgroundAssetPentagrams) {
      pentagram.sprite.scale.set(pentagram.baseScale);
    }
  }

  private rebuildAtmosphere(): void {
    this.atmosphereMotes = [];
    this.floatingMeshes = [];

    const moteColors = [CEMBER, CAMBER, CRED, CHOT];
    const meshColors = [CBLACK, CBLACK, CBLACK];
    const densityScale = (this.w * this.h) / (1920 * 1080);
    const moteCount = Math.max(64, Math.floor(110 * densityScale));

    for (let index = 0; index < moteCount; index++) {
      this.atmosphereMotes.push({
        xNorm: Math.random(),
        yNorm: Math.random(),
        radius: 0.65 + Math.random() * 1.7,
        sway: 10 + Math.random() * 24,
        rise: 6 + Math.random() * 20,
        phase: Math.random() * TAU,
        speed: 0.18 + Math.random() * 0.48,
        alpha: 0.09 + Math.random() * 0.22,
        color: moteColors[index % moteColors.length],
      });
    }

    const meshCount = Math.max(6, Math.floor(8 * densityScale));
    let maxMeshPoints = 0;

    for (let index = 0; index < meshCount; index++) {
      const cluster: FloatingMeshCluster = {
        xNorm: Math.random(),
        yNorm: Math.random(),
        radiusNorm: 0.03 + Math.random() * 0.09,
        pointCount: 5 + Math.floor(Math.random() * 6),
        driftX: 0.014 + Math.random() * 0.04,
        driftY: 0.012 + Math.random() * 0.034,
        spin: 0.25 + Math.random() * 0.85,
        phase: Math.random() * TAU,
        speed: 0.05 + Math.random() * 0.18,
        alpha: 0.08 + Math.random() * 0.13,
        color: meshColors[index % meshColors.length],
      };

      this.floatingMeshes.push(cluster);
      maxMeshPoints = Math.max(maxMeshPoints, cluster.pointCount);
    }

    if (this.meshPointBuffer.length < maxMeshPoints * 2) {
      this.meshPointBuffer = new Float64Array(maxMeshPoints * 2);
    }
  }

  /**
   * Collects the drawn sigils and the sprite sigils into one persistent list,
   * drawn sigils first. None of the copied orbit values ever change after their
   * `ensure*` pass, so this only has to run when the population changes — the
   * frame loop then resolves overlaps inside these same objects rather than
   * rebuilding the list and a parallel position list every tick.
   */
  private ensureOrbitBodies(): void {
    const total =
      this.backgroundPentagrams.length + this.backgroundAssetPentagrams.length;

    if (this.orbitBodies.length === total) return;

    this.orbitBodies.length = 0;

    for (const pentagram of this.backgroundPentagrams) {
      this.orbitBodies.push({
        display: pentagram.container,
        orbitAngle: pentagram.orbitAngle,
        orbitRadius: pentagram.orbitRadius,
        angularSpeed: pentagram.angularSpeed,
        radialWobble: pentagram.radialWobble,
        phase: pentagram.phase,
        alphaSpeed: pentagram.alphaSpeed,
        baseAlpha: pentagram.baseAlpha,
        spin: pentagram.spin,
        x: 0,
        y: 0,
        sizeRadius: 0,
      });
    }

    for (const pentagram of this.backgroundAssetPentagrams) {
      this.orbitBodies.push({
        display: pentagram.sprite,
        orbitAngle: pentagram.orbitAngle,
        orbitRadius: pentagram.orbitRadius,
        angularSpeed: pentagram.angularSpeed,
        radialWobble: pentagram.radialWobble,
        phase: pentagram.phase,
        alphaSpeed: pentagram.alphaSpeed,
        baseAlpha: pentagram.baseAlpha,
        spin: pentagram.spin,
        x: 0,
        y: 0,
        sizeRadius: 0,
      });
    }
  }

  private updateBackgroundSigils(): void {
    this.ensureOrbitBodies();

    const bodies = this.orbitBodies;
    const orbitBase = Math.max(this.renderWidth, this.renderHeight) * 0.52;

    for (let index = 0; index < bodies.length; index++) {
      const body = bodies[index];
      const angle = body.orbitAngle + this.time * body.angularSpeed;
      const radius =
        orbitBase * body.orbitRadius +
        Math.sin(this.time * body.alphaSpeed * 1.2 + body.phase) *
          body.radialWobble;

      body.x = this.centerX + Math.cos(angle) * radius;
      body.y = this.centerY + Math.sin(angle) * radius * 0.82;
      body.sizeRadius =
        Math.max(body.display.width, body.display.height) * 0.32;
    }

    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const minDistance = a.sizeRadius + b.sizeRadius + 26;

          if (distance >= minDistance) continue;

          const overlap = (minDistance - distance) * 0.5;
          const pushX = (dx / distance) * overlap;
          const pushY = (dy / distance) * overlap;

          a.x -= pushX;
          a.y -= pushY;
          b.x += pushX;
          b.y += pushY;
        }
      }
    }

    for (let index = 0; index < bodies.length; index++) {
      const body = bodies[index];

      body.display.x = body.x;
      body.display.y = body.y;
      body.display.rotation =
        Math.sin(this.time * body.alphaSpeed + body.phase) * 0.08 +
        this.time * body.spin;
      body.display.alpha =
        body.baseAlpha *
        (0.7 + Math.sin(this.time * body.alphaSpeed * 2.2 + body.phase) * 0.22);
    }
  }

  private updateNodes(): void {
    const nodes = this.nodes;
    const table = this.waveTable;
    const centerX = this.centerX;
    const centerY = this.centerY;
    const pulse = 1 + Math.sin(this.time * 0.18) * 0.01;
    const shear = Math.sin(this.time * 0.16) * 0.014;

    // Time-varying half of each wave, paired with the node-fixed half that
    // rebuildWaveTable() cached. Seven trig calls cover every node.
    const primaryTime = -this.time * 0.42;
    const primaryTimeSin = Math.sin(primaryTime);
    const primaryTimeCos = Math.cos(primaryTime);
    const diagonalTime = -this.time * 0.34;
    const diagonalTimeSin = Math.sin(diagonalTime);
    const diagonalTimeCos = Math.cos(diagonalTime);
    const ringTime = -this.time * 0.56;
    const ringTimeSin = Math.sin(ringTime);
    const ringTimeCos = Math.cos(ringTime);
    const spiralTime = -this.time * 0.28;
    const spiralTimeSin = Math.sin(spiralTime);
    const spiralTimeCos = Math.cos(spiralTime);
    const rippleTime = -this.time * 0.92;
    const rippleTimeSin = Math.sin(rippleTime);
    const rippleTimeCos = Math.cos(rippleTime);
    const swayTime = this.time * 0.18;
    const swayTimeSin = Math.sin(swayTime);
    const swayTimeCos = Math.cos(swayTime);
    const bobTime = this.time * 0.2;
    const bobTimeSin = Math.sin(bobTime);
    const bobTimeCos = Math.cos(bobTime);

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const base = index * WAVE_STRIDE;
      const primarySwell =
        (table[base] * primaryTimeCos + table[base + 1] * primaryTimeSin) *
        0.72;
      const diagonalSwell =
        (table[base + 2] * diagonalTimeCos +
          table[base + 3] * diagonalTimeSin) *
        0.44;
      const ringCurrent =
        (table[base + 5] * ringTimeCos - table[base + 4] * ringTimeSin) * 0.34;
      const spiralCurrent =
        (table[base + 6] * spiralTimeCos + table[base + 7] * spiralTimeSin) *
        0.26;
      const microRipple =
        (table[base + 8] * rippleTimeCos + table[base + 9] * rippleTimeSin) *
        0.08;
      const sway =
        table[base + 11] * swayTimeCos - table[base + 10] * swayTimeSin;
      const bob = table[base + 12] * bobTimeCos + table[base + 13] * bobTimeSin;
      const swell =
        primarySwell +
        diagonalSwell +
        ringCurrent +
        spiralCurrent +
        microRipple;
      const crest = Math.max(
        0,
        primarySwell * 0.64 + diagonalSwell * 0.28 + ringCurrent * 0.38,
      );
      const rise = Math.max(0, ringCurrent);
      const damping = table[base + 18];
      const elevation = swell * 0.18 + crest * crest * 0.9 + rise * 0.12;

      const stretchedX = node.relX * pulse + node.relY * shear;
      const stretchedY = node.relY * (1 - pulse * 0.01);
      const flowX =
        table[base + 14] * (4 + crest * 10 + rise * 6) * damping +
        table[base + 16] * elevation * 7 * damping +
        sway * 1.6 * damping;
      const flowY =
        table[base + 15] * (4 + crest * 10 + rise * 6) * damping +
        table[base + 17] * elevation * 9 * damping -
        crest * table[base + 19] +
        bob * 1.8 * damping;

      node.elevation = elevation;
      node.x = centerX + stretchedX + flowX;
      node.y = centerY + stretchedY + flowY;
    }
  }

  private draw(): void {
    const bg = this.backdropGfx;
    const sigil = this.sigilGfx;

    bg.clear();
    sigil.clear();
    this.drawBackdrop(bg);
    this.drawShapeAura(sigil);

    if (!this.shapeReady) {
      return;
    }

    const nodes = this.nodes;
    const segments = this.segments;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];

      this.drawSegment(
        sigil,
        nodes[segment.a],
        nodes[segment.b],
        segment.strength,
      );
    }

    for (let index = 0; index < nodes.length; index++) {
      this.drawNode(sigil, nodes[index]);
    }
  }

  private drawBackdrop(g: Graphics): void {
    const radius = Math.min(this.w, this.h);

    g.rect(0, 0, this.w, this.h).fill({ color: BG });
    g.circle(this.w * 0.16, this.h * 0.16, radius * 0.56).fill({
      color: BG_DEEP,
      alpha: 0.96,
    });
    g.circle(this.w * 0.84, this.h * 0.82, radius * 0.64).fill({
      color: BG_DEEP,
      alpha: 0.88,
    });
    g.circle(this.w * 0.56, this.h * 0.48, radius * 0.44).fill({
      color: BG_MID,
      alpha: 0.16,
    });
    g.circle(this.w * 0.42, this.h * 0.34, radius * 0.28).fill({
      color: BG_WARM,
      alpha: 0.1,
    });

    for (const mesh of this.floatingMeshes) {
      this.drawFloatingMesh(g, mesh, radius);
    }

    for (const mote of this.atmosphereMotes) {
      const yBase = (mote.yNorm * this.h - this.time * mote.rise * 6) % this.h;
      const y = yBase < 0 ? yBase + this.h : yBase;
      const x =
        mote.xNorm * this.w +
        Math.sin(this.time * mote.speed + mote.phase) * mote.sway;
      const twinkle =
        0.54 + Math.sin(this.time * (mote.speed * 2.6) + mote.phase) * 0.3;

      fillScratch.color = mote.color;
      fillScratch.alpha = mote.alpha * twinkle;
      g.circle(x, y, mote.radius * (0.8 + twinkle * 0.34)).fill(fillScratch);
    }
  }

  private drawFloatingMesh(
    g: Graphics,
    mesh: FloatingMeshCluster,
    radius: number,
  ): void {
    const centerX =
      this.w * mesh.xNorm +
      Math.sin(this.time * mesh.speed + mesh.phase) * this.w * mesh.driftX;
    const centerY =
      this.h * mesh.yNorm +
      Math.cos(this.time * (mesh.speed * 0.86) + mesh.phase * 0.7) *
        this.h *
        mesh.driftY;
    const clusterRadius =
      radius *
      mesh.radiusNorm *
      (0.92 + Math.sin(this.time * mesh.speed * 1.9 + mesh.phase) * 0.1);
    const rotation = this.time * mesh.spin + mesh.phase;
    const count = mesh.pointCount;
    const points = this.meshPointBuffer;

    for (let index = 0; index < count; index++) {
      const angle = rotation + (index / count) * TAU;
      const wobble =
        0.66 +
        Math.sin(this.time * 0.74 + mesh.phase + index * 0.92) * 0.18 +
        Math.cos(this.time * 0.39 + index * 0.62) * 0.08;

      points[index * 2] = centerX + Math.cos(angle) * clusterRadius * wobble;
      points[index * 2 + 1] =
        centerY + Math.sin(angle) * clusterRadius * (0.62 + wobble * 0.32);
    }

    fillScratch.color = mesh.color;
    fillScratch.alpha = mesh.alpha * 0.11;
    g.circle(centerX, centerY, clusterRadius * 1.16).fill(fillScratch);

    for (let index = 0; index < count; index++) {
      const pointX = points[index * 2];
      const pointY = points[index * 2 + 1];
      const next = ((index + 1) % count) * 2;
      const skip = ((index + 2) % count) * 2;

      strokeScratch.color = mesh.color;
      strokeScratch.alpha = mesh.alpha * 0.74;
      strokeScratch.width = 1;
      g.moveTo(pointX, pointY)
        .lineTo(points[next], points[next + 1])
        .stroke(strokeScratch);

      if (index % 2 === 0) {
        strokeScratch.alpha = mesh.alpha * 0.3;
        g.moveTo(pointX, pointY)
          .lineTo(points[skip], points[skip + 1])
          .stroke(strokeScratch);
      }

      fillScratch.color = mesh.color;
      fillScratch.alpha = mesh.alpha * 1.08;
      g.circle(pointX, pointY, 1.15).fill(fillScratch);
    }
  }

  private createSealBackdropSigil(): Container {
    const container = new Container();
    const g = new Graphics();
    const outerRadius = 210;
    const innerRadius = 188;
    const starRadius = 126;
    const starPoints = this.getPentagramPoints(starRadius, -Math.PI * 0.5);

    g.circle(0, 0, outerRadius).stroke({
      color: CHOT,
      alpha: 0.34,
      width: 3,
    });
    g.circle(0, 0, innerRadius).stroke({
      color: CRED,
      alpha: 0.82,
      width: 12,
    });
    g.circle(0, 0, innerRadius + 22).stroke({
      color: CHOT,
      alpha: 0.46,
      width: 2,
    });

    this.strokePolyline(g, starPoints, {
      color: CRED,
      alpha: 0.88,
      width: 10,
      closed: true,
    });
    this.strokePolyline(g, starPoints, {
      color: CHOT,
      alpha: 0.36,
      width: 2,
      closed: true,
    });

    for (let index = 0; index < 18; index++) {
      const angle = -Math.PI * 0.5 + (index / 18) * TAU;
      const x = Math.cos(angle) * (innerRadius + 11);
      const y = Math.sin(angle) * (innerRadius + 11);

      g.circle(x, y, 3.3).fill({
        color: CHOT,
        alpha: 0.84,
      });
    }

    this.strokeArc(g, innerRadius + 40, -2.45, -1.1, {
      color: CRED,
      alpha: 0.5,
      width: 4,
    });
    this.strokeArc(g, innerRadius + 48, -2.72, -1.28, {
      color: CHOT,
      alpha: 0.34,
      width: 2,
    });
    this.strokeArc(g, innerRadius + 40, 0.3, 1.85, {
      color: CRED,
      alpha: 0.44,
      width: 4,
    });

    container.addChild(g);
    return container;
  }

  private createBrushBackdropSigil(): Container {
    const container = new Container();
    const g = new Graphics();
    const ringRadius = 176;
    const points = this.getPentagramPoints(138, Math.PI * 0.5);

    for (let layer = 0; layer < 3; layer++) {
      this.strokeArc(
        g,
        ringRadius + (layer - 1) * 4,
        -Math.PI,
        Math.PI,
        {
          color: CRED,
          alpha: 0.22 + layer * 0.08,
          width: 6 - layer,
        },
        layer * 0.18,
      );
    }

    for (let layer = 0; layer < 3; layer++) {
      const offset = (layer - 1) * 3.2;
      const roughPoints = points.map((point, index) => ({
        x: point.x + Math.cos(index * 1.7) * offset,
        y: point.y + Math.sin(index * 1.3) * offset,
      }));

      this.strokePolyline(g, roughPoints, {
        color: layer === 2 ? CRED_CORE : CRED,
        alpha: 0.24 + layer * 0.12,
        width: 7 - layer * 1.4,
        closed: true,
      });
    }

    container.addChild(g);
    return container;
  }

  private getPentagramPoints(radius: number, startAngle: number): Point2D[] {
    const outer: Point2D[] = [];
    const order = [0, 2, 4, 1, 3];

    for (let index = 0; index < 5; index++) {
      const angle = startAngle + (index / 5) * TAU;
      outer.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    return order.map((index) => outer[index]);
  }

  private strokePolyline(
    g: Graphics,
    points: Point2D[],
    style: {
      color: number;
      alpha: number;
      width: number;
      closed?: boolean;
    },
  ): void {
    if (points.length < 2) return;

    g.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index++) {
      g.lineTo(points[index].x, points[index].y);
    }

    if (style.closed) {
      g.lineTo(points[0].x, points[0].y);
    }

    g.stroke({
      color: style.color,
      alpha: style.alpha,
      width: style.width,
    });
  }

  private strokeArc(
    g: Graphics,
    radius: number,
    startAngle: number,
    endAngle: number,
    style: {
      color: number;
      alpha: number;
      width: number;
    },
    wobble = 0,
  ): void {
    const steps = 24;

    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const angle = startAngle + (endAngle - startAngle) * t;
      const localRadius =
        radius +
        Math.sin(angle * 5.2 + wobble * 7 + step * 0.18) * (2 + wobble * 3);
      const x = Math.cos(angle) * localRadius;
      const y = Math.sin(angle) * localRadius;

      if (step === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    }

    g.stroke({
      color: style.color,
      alpha: style.alpha,
      width: style.width,
    });
  }

  private drawShapeAura(g: Graphics): void {
    const auraRadius = Math.max(this.renderWidth, this.renderHeight, 180);

    g.circle(this.centerX, this.centerY, auraRadius * 0.46).fill({
      color: CRED,
      alpha: 0.08,
    });
    g.circle(
      this.centerX,
      this.centerY - this.renderHeight * 0.06,
      auraRadius * 0.28,
    ).fill({
      color: CEMBER,
      alpha: 0.09,
    });
    g.circle(
      this.centerX + this.renderWidth * 0.08,
      this.centerY + this.renderHeight * 0.08,
      auraRadius * 0.22,
    ).fill({
      color: CAMBER,
      alpha: 0.06,
    });
  }

  private drawSegment(
    g: Graphics,
    a: ShapeNode,
    b: ShapeNode,
    strength: number,
  ): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const relief = Math.abs(a.elevation - b.elevation);
    const lift = Math.max(0, (a.elevation + b.elevation) * 0.5);
    const count = Math.max(2, Math.floor(distance / SEGMENT_DOT_STEP));
    const alpha = clamp(
      0.18 + strength * 0.14 + lift * 0.32 + relief * 0.12,
      0.18,
      0.82,
    );
    const radius = 0.34 + strength * 0.12 + lift * 0.22 + relief * 0.06;
    const color = lift > 0.82 ? CHOT : lift > 0.26 ? CEMBER : CRED_CORE;

    // Every dot on a segment shares one colour, so they go into a single path
    // and a single fill. Collecting them here also skips the identity matrix
    // that `Graphics.circle()` clones — and re-applies to every vertex — once
    // per dot, which at a few thousand segments a frame is the bulk of the work.
    segmentDotPath.clear();

    for (let index = 0; index <= count; index++) {
      const t = index / count;

      segmentDotPath.circle(a.x + dx * t, a.y + dy * t, radius);
    }

    fillScratch.color = color;
    fillScratch.alpha = alpha;
    g.path(segmentDotPath).fill(fillScratch);
  }

  private drawNode(g: Graphics, node: ShapeNode): void {
    const lift = Math.max(0, node.elevation);
    const glowRadius = 1.9 + node.interiorBias * 1.2 + lift * 3;
    const dotRadius = 0.68 + node.interiorBias * 0.24 + lift * 0.58;
    const alpha = clamp(0.72 + node.interiorBias * 0.14 + lift * 0.22, 0.66, 1);
    const color = lift > 0.9 ? CHOT : lift > 0.34 ? CEMBER : CRED;

    if (node.interiorBias > 0.78 && lift > 0.1) {
      fillScratch.color = CRED;
      fillScratch.alpha = 0.02 + lift * 0.048;
      g.circle(node.x, node.y, glowRadius * 1.6).fill(fillScratch);
    }

    fillScratch.color = color;
    fillScratch.alpha = alpha;
    g.circle(node.x, node.y, dotRadius).fill(fillScratch);
  }
}
