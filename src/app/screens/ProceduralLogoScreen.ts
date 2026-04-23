import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Palette (Catppuccin Mocha) ────────────────────────────────────────────────
const MAUVE = 0xcba6f7;
const BLUE = 0x89b4fa;
const TEAL = 0x94e2d5;
const SKY = 0x89dceb;
const SAPPHIRE = 0x74c7ec;
const LAVENDER = 0xb4befe;
const RED = 0xf38ba8;
const MAROON = 0xeba0ac;
const PEACH = 0xfab387;

const PALETTE = [MAUVE, BLUE, TEAL, SKY, SAPPHIRE, LAVENDER] as const;
const STAIN_PALETTE = [RED, MAROON, PEACH, MAUVE] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const LOGO_SIZE = 240;
const BEAT_INTERVAL = 0.857;
const DUB_PHASE_RATIO = 0.28;

const BLOB_COUNT = 12;

// ── Types ─────────────────────────────────────────────────────────────────────
interface FluidBlob {
  angle: number;
  orbitRadius: number;
  size: number;
  speed: number;
  offset: number;
  color: number;
  alpha: number;
}

interface WavyLine {
  r: number;
  amp: number;
  freq: number;
  speed: number;
  color: number;
  alpha: number;
  weight: number;
}

interface GyroRing {
  radius: number;
  color: number;
  speed: number;
  tilt: number;
  phase: number;
}

interface CloudBlob {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  driftSpeed: number;
  offset: number;
}

interface Stain {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
}

interface ToxicDrop {
  parentIndex: number;
  relX: number; // Offset relative to parent stain
  relY: number; // Offset relative to parent stain
  radius: number;
  type: "jagged" | "splat";
  angle: number;
  driftSpeed: number;
  offset: number;
  isGreen: boolean;
}

interface PatternPath {
  x: number;
  y: number;
  points: { x: number; y: number; ox: number; oy: number }[]; // Store original offsets for morphing
  width: number;
  color: number;
  speed: number;
  rotationSpeed: number;
  rotationOffset: number;
  offset: number;
}

interface DotMesh {
  x: number;
  y: number;
  dots: { x: number; y: number; vx: number; vy: number }[];
  color: number;
  rotationSpeed: number;
  driftSpeed: number;
  offset: number;
  scale: number;
}

interface AtmosphereMesh {
  dots: { x: number; y: number; vx: number; vy: number }[];
  color: number;
  alpha: number;
}

interface DotGrid {
  x: number;
  y: number;
  cols: number;
  rows: number;
  spacing: number;
  color: number;
  rotationSpeed: number;
  driftSpeed: number;
  offset: number;
  alpha: number;
}

interface RotatingObject {
  x: number;
  y: number;
  type: "rect" | "circle";
  size: number;
  color: number;
  rotation: number;
  rotationSpeed: number;
  driftSpeed: number;
  offset: number;
}

interface TextParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  color: number;
  radius: number;
  alpha: number;
}

interface FloatingElement {
  x: number;
  y: number;
  z: number;
  size: number;
  type: "cube" | "crystal" | "point";
  angle: number;
  rotationSpeed: number;
  vx: number;
  vy: number;
  vz: number;
  color: number;
  alpha: number;
}

const TOXIC_BLACK = 0x11111b; // Deep black for grime/outlines

/**
 * A completely procedural logo screen with fluid wavy lines and blobs.
 */
export class ProceduralLogoScreen extends Container {
  public static assetBundles: string[] = [];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly gyroGfx = new Graphics();
  private readonly cloudGfx = new Graphics();
  private readonly blobGfx = new Graphics();
  private readonly wavyGfx = new Graphics();
  private readonly stainGfx = new Graphics();
  private readonly toxicGfx = new Graphics(); // Gritty toxic layer
  private readonly patternGfx = new Graphics(); // Bold rounded pattern layer
  private readonly meshGfx = new Graphics(); // Connective mesh layer
  private readonly gridGfx = new Graphics(); // Dotted grid layer
  private readonly boldGridGfx = new Graphics(); // Bold white/black grid layer
  private readonly rotatingGfx = new Graphics(); // Opaque rotating shapes

  // Atmosphere layers behind text
  private readonly textMatrixGfx = new Graphics();
  private readonly textFloatingGfx = new Graphics();
  private readonly textHoloMeshGfx = new Graphics();

  private readonly textAtmosphereGfx = new Graphics(); // Extra atmosphere behind text
  private readonly textBgGfx = new Graphics(); // Glow/Shadow background for text
  private readonly textGfx = new Graphics(); // Top-layer text particles
  private readonly logoGfx = new Graphics();
  private readonly logoContainer = new Container();

  // ── State ──────────────────────────────────────────────────────────────────
  private time = 0;
  private beatDecay = 0;
  private blobs: FluidBlob[] = [];
  private wavyLines: WavyLine[] = [];
  private gyroRings: GyroRing[] = [];
  private stains: Stain[] = [];
  private cloudBlobs: CloudBlob[] = [];
  private toxicDrops: ToxicDrop[] = [];
  private patternPaths: PatternPath[] = [];
  private dotMeshes: DotMesh[] = [];
  private dotGrids: DotGrid[] = [];
  private boldDotGrids: DotGrid[] = [];
  private rotatingObjects: RotatingObject[] = [];
  private atmosphereMeshes: AtmosphereMesh[] = [];
  private floatingElements: FloatingElement[] = [];
  private textParticles: TextParticle[] = [];

  constructor() {
    super();
    // Move stains and clouds to the very back
    this.addChild(this.cloudGfx);
    this.addChild(this.stainGfx);
    this.addChild(this.toxicGfx);
    this.addChild(this.patternGfx);
    this.addChild(this.meshGfx);
    this.addChild(this.gridGfx);
    this.addChild(this.boldGridGfx);
    this.addChild(this.rotatingGfx);
    this.addChild(this.gyroGfx);
    this.addChild(this.blobGfx);
    this.addChild(this.wavyGfx);
    this.addChild(this.logoContainer);

    // New Atmospheric Layers behind text
    this.addChild(this.textMatrixGfx);
    this.addChild(this.textFloatingGfx);
    this.addChild(this.textHoloMeshGfx);

    this.addChild(this.textAtmosphereGfx);
    this.addChild(this.textBgGfx);
    this.addChild(this.textGfx);

    this.logoContainer.addChild(this.logoGfx);

    this.initFluidElements();
    this.initGyroRings();
    this.initStains();
    this.initToxicElements();
    this.initPatternLines();
    this.initDotMeshes();
    this.initDotGrids();
    this.initBoldDotGrids();
    this.initRotatingObjects();
    this.initTextAtmosphere();
    this.initFloatingElements(); // Initialize new elements
    this.initTextParticles();
  }

  private initStains(): void {
    const CLOUD_COUNT = 6;

    // Initialize large soft cloud-like background blobs (the "under-glow")
    for (let i = 0; i < CLOUD_COUNT; i++) {
      this.cloudBlobs.push({
        x: (Math.random() - 0.5) * LOGO_SIZE * 1.2,
        y: (Math.random() - 0.5) * LOGO_SIZE * 1.2,
        radius: 60 + Math.random() * 60, // Reduced from 150-350px
        color: STAIN_PALETTE[Math.floor(Math.random() * STAIN_PALETTE.length)],
        alpha: 0.03 + Math.random() * 0.05,
        driftSpeed: 0.02 + Math.random() * 0.05,
        offset: Math.random() * 100,
      });
    }

    // Initialize central, overlapping "ink" stains
    const STAIN_COUNT = 24; // Increased 2x as requested
    for (let i = 0; i < STAIN_COUNT; i++) {
      // Very tight clustering towards the center
      const dist = Math.pow(Math.random(), 2.0) * LOGO_SIZE * 0.45;
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 20; // Maintain small scale

      this.stains.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        radius,
        color: STAIN_PALETTE[Math.floor(Math.random() * STAIN_PALETTE.length)],
        alpha: 1.0, // ALL stains fully opaque
      });
    }
  }

  private initGyroRings(): void {
    this.gyroRings = [
      {
        radius: LOGO_SIZE * 0.9,
        color: MAUVE,
        speed: 0.8,
        tilt: 0.3,
        phase: 0,
      },
      {
        radius: LOGO_SIZE * 0.75,
        color: SAPPHIRE,
        speed: -1.2,
        tilt: -0.5,
        phase: Math.PI / 3,
      },
    ];
  }

  private initFluidElements(): void {
    // Initialize Blobs
    for (let i = 0; i < BLOB_COUNT; i++) {
      this.blobs.push({
        angle: Math.random() * Math.PI * 2,
        orbitRadius: LOGO_SIZE * 0.7 + Math.random() * 40,
        size: 8 + Math.random() * 20,
        speed: (Math.random() * 0.01 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        offset: Math.random() * 100,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        alpha: 0.2 + Math.random() * 0.3,
      });
    }

    // Initialize Wavy Lines
    this.wavyLines = [
      {
        r: LOGO_SIZE * 0.65,
        amp: 8,
        freq: 5,
        speed: 1.0,
        color: BLUE,
        alpha: 0.4,
        weight: 12,
      },
      {
        r: LOGO_SIZE * 0.7,
        amp: 12,
        freq: 3,
        speed: -0.8,
        color: MAUVE,
        alpha: 0.3,
        weight: 8,
      },
      {
        r: LOGO_SIZE * 0.75,
        amp: 15,
        freq: 7,
        speed: 1.2,
        color: TEAL,
        alpha: 0.25,
        weight: 6,
      },
      {
        r: LOGO_SIZE * 0.6,
        amp: 6,
        freq: 4,
        speed: -0.5,
        color: SKY,
        alpha: 0.35,
        weight: 10,
      },
    ];
  }

  public async show(): Promise<void> {}

  public update(_ticker: Ticker): void {
    const dt = _ticker.deltaTime;
    this.time += dt * 0.016;

    this.animateHeartbeat();
    this.drawFluidBlobs();
    this.drawWavyLines();
    this.drawGyroRings();
    this.drawStains();
    this.drawToxicElements(); // Toxic oozing layer
    this.drawPatternLines(); // Bold rounded pattern layer
    this.drawDotMeshes(); // Connective mesh layer
    this.drawDotGrids(); // Dotted grid layer
    this.drawBoldDotGrids(); // Bold white/black grid layer
    this.drawRotatingObjects(_ticker); // Opaque rotating layer

    // Atmospheric elements behind text
    this.drawTextMatrix();
    this.drawTextFloating(_ticker);
    this.drawTextHoloMesh();

    this.drawTextAtmosphere(_ticker); // Extra atmosphere layer behind text
    this.drawTextParticles(_ticker); // Final text layer
    this.drawProceduralLogo();
  }

  private initFloatingElements(): void {
    const COUNT = 40;
    const palette = [BLUE, MAUVE, RED, SKY, LAVENDER, SAPPHIRE];

    for (let i = 0; i < COUNT; i++) {
      this.floatingElements.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 800,
        z: Math.random() * 1000,
        size: 4 + Math.random() * 12,
        type:
          Math.random() > 0.7
            ? "crystal"
            : Math.random() > 0.4
              ? "cube"
              : "point",
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.03,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        vz: (Math.random() - 0.5) * 1.0,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 0.15 + Math.random() * 0.35,
      });
    }
  }

  private drawTextMatrix(): void {
    const g = this.textMatrixGfx;
    g.clear();
    const punch = this.beatDecay * 0.4;

    const spacing = 40;
    const rows = 15;
    const cols = 40;
    const scrollX = (this.time * 20) % spacing;
    const scrollY = (this.time * 10) % spacing;

    for (let i = -cols / 2; i < cols / 2; i++) {
      for (let j = -rows / 2; j < rows / 2; j++) {
        const x = i * spacing + scrollX;
        const y = j * spacing + scrollY;

        // Circular mask for the matrix
        const dist = Math.sqrt(x * x + y * y);
        if (dist > 800) continue;

        const alpha = (1 - dist / 800) * 0.15 * (1 + punch);
        const size = 1.5 + punch * 2.0;

        g.circle(x, y, size).fill({ color: BLUE, alpha });
      }
    }
  }

  private drawTextFloating(ticker: Ticker): void {
    const g = this.textFloatingGfx;
    g.clear();
    const dt = ticker.deltaTime;
    const punch = this.beatDecay * 0.6;

    for (const e of this.floatingElements) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
      e.angle += e.rotationSpeed * dt;

      // Wrap around
      if (Math.abs(e.x) > 1000) e.x = -Math.sign(e.x) * 950;
      if (Math.abs(e.y) > 600) e.y = -Math.sign(e.y) * 550;
      if (e.z < 0) e.z = 1000;
      if (e.z > 1000) e.z = 0;

      const scale = 400 / (400 + e.z);
      const px = e.x * scale;
      const py = e.y * scale;
      const size = e.size * scale * (1 + punch);
      const alpha = e.alpha * scale * (1 + punch);

      if (e.type === "point") {
        g.circle(px, py, size * 0.5).fill({ color: e.color, alpha });
      } else if (e.type === "cube") {
        const half = size;
        g.poly(
          [
            px - half,
            py - half,
            px + half,
            py - half,
            px + half,
            py + half,
            px - half,
            py + half,
          ],
          true,
        ).stroke({ color: e.color, alpha: alpha * 1.5, width: 1.5 });
      } else if (e.type === "crystal") {
        g.poly(
          [
            px,
            py - size * 1.5,
            px + size,
            py,
            px,
            py + size * 1.5,
            px - size,
            py,
          ],
          true,
        ).stroke({ color: e.color, alpha: alpha * 1.5, width: 1.5 });
      }
    }
  }

  private drawTextHoloMesh(): void {
    const g = this.textHoloMeshGfx;
    g.clear();
    const punch = this.beatDecay * 0.3;
    const threshold = 250;

    // Connect floating elements that are points or centers
    for (let i = 0; i < this.floatingElements.length; i++) {
      const e1 = this.floatingElements[i];
      const s1 = 400 / (400 + e1.z);
      const p1x = e1.x * s1;
      const p1y = e1.y * s1;

      for (let j = i + 1; j < this.floatingElements.length; j++) {
        const e2 = this.floatingElements[j];
        const s2 = 400 / (400 + e2.z);
        const p2x = e2.x * s2;
        const p2y = e2.y * s2;

        const dx = p2x - p1x;
        const dy = p2y - p1y;
        const d2 = dx * dx + dy * dy;

        if (d2 < threshold * threshold) {
          const d = Math.sqrt(d2);
          const alpha = (1 - d / threshold) * 0.15 * (1 + punch);
          g.moveTo(p1x, p1y)
            .lineTo(p2x, p2y)
            .stroke({ color: SKY, alpha, width: 0.6 });
        }
      }
    }
  }

  private initTextAtmosphere(): void {
    const MESH_COUNT = 4 + Math.floor(Math.random() * 3); // 4-6 localized meshes
    const palette = [LAVENDER, MAUVE, BLUE, RED, TOXIC_BLACK];

    for (let i = 0; i < MESH_COUNT; i++) {
      const dots: { x: number; y: number; vx: number; vy: number }[] = [];
      const dotCount = 15 + Math.floor(Math.random() * 20);

      // Cluster around the center text area
      const centerX = (Math.random() - 0.5) * 400;
      const centerY = (Math.random() - 0.5) * 100;

      for (let j = 0; j < dotCount; j++) {
        dots.push({
          x: centerX + (Math.random() - 0.5) * 1200,
          y: centerY + (Math.random() - 0.5) * 400,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
        });
      }

      this.atmosphereMeshes.push({
        dots,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 0.2 + Math.random() * 0.3,
      });
    }
  }

  private drawTextAtmosphere(ticker: Ticker): void {
    const g = this.textAtmosphereGfx;
    g.clear();
    const dt = ticker.deltaTime;
    const punch = this.beatDecay * 0.5;
    const distThreshold = 140;

    for (const mesh of this.atmosphereMeshes) {
      for (let i = 0; i < mesh.dots.length; i++) {
        const p1 = mesh.dots[i];
        p1.x += p1.vx * dt;
        p1.y += p1.vy * dt;

        // Bounce within center region
        if (Math.abs(p1.x) > 800) p1.vx *= -1;
        if (Math.abs(p1.y) > 300) p1.vy *= -1;

        // Draw connections
        for (let j = i + 1; j < mesh.dots.length; j++) {
          const p2 = mesh.dots[j];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist2 = dx * dx + dy * dy;

          if (dist2 < distThreshold * distThreshold) {
            const dist = Math.sqrt(dist2);
            const alpha = (1 - dist / distThreshold) * mesh.alpha * (1 + punch);
            g.moveTo(p1.x, p1.y)
              .lineTo(p2.x, p2.y)
              .stroke({ color: mesh.color, alpha, width: 0.8 });
          }
        }

        // Draw Dot
        const dotAlpha = mesh.alpha * (0.6 + punch * 0.4);
        g.circle(p1.x, p1.y, 1.5).fill({ color: mesh.color, alpha: dotAlpha });
      }
    }
  }

  private initTextParticles(): void {
    const text = "worxbend";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use a large enough buffer for crisp sampling
    const W = 1400;
    const H = 450;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, W, H);

    // Retro, pixel-style 'Silkscreen' font — width increased to 1400px
    ctx.font = "bold 160px Silkscreen, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText(text, W / 2, H / 2);

    const imageData = ctx.getImageData(0, 0, W, H).data;
    const STEP = 8; // Slightly more sparse for performance and style
    this.textParticles = [];

    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = (y * W + x) * 4;
        if (imageData[i] > 128) {
          // Center the particle around (0,0)
          const homeX = x - W / 2;
          const homeY = y - H / 2;
          this.textParticles.push({
            x: homeX + (Math.random() - 0.5) * 60,
            y: homeY + (Math.random() - 0.5) * 60,
            vx: 0,
            vy: 0,
            homeX,
            homeY,
            color: TOXIC_BLACK, // Changed to Black
            radius: 1.2 + Math.random() * 1.8,
            alpha: 0.8 + Math.random() * 0.2,
          });
        }
      }
    }
  }

  private drawTextParticles(ticker: Ticker): void {
    const g = this.textGfx;
    const bg = this.textBgGfx;
    g.clear();
    bg.clear();

    const dt = ticker.deltaTime;
    const punch = this.beatDecay * 0.5;
    const distThreshold = 18; // Max distance for mesh lines

    // Update positions and draw background glow/shadow
    for (const p of this.textParticles) {
      const dx = p.homeX - p.x;
      const dy = p.homeY - p.y;

      // Stronger spring force towards home
      p.vx += dx * 0.12;
      p.vy += dy * 0.12;

      // Significantly reduced random jitter
      p.vx += (Math.random() - 0.5) * 0.2;
      p.vy += (Math.random() - 0.5) * 0.2;

      // Increased friction for more stable settle
      p.vx *= 0.8;
      p.vy *= 0.8;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Semi-transparent glowy background - Extremely subtle Lavender/Blue theme
      bg.circle(p.x, p.y, 35).fill({ color: LAVENDER, alpha: 0.015 });
      bg.circle(p.x, p.y, 22).fill({ color: BLUE, alpha: 0.025 });
      bg.circle(p.x, p.y, 10).fill({ color: TOXIC_BLACK, alpha: 0.05 });
    }

    // Draw Mesh and Dots
    for (let i = 0; i < this.textParticles.length; i++) {
      const p1 = this.textParticles[i];

      // Optimization: Only check a small neighborhood since particles are grid-ordered
      const searchWindow = 45;
      const end = Math.min(i + searchWindow, this.textParticles.length);

      for (let j = i + 1; j < end; j++) {
        const p2 = this.textParticles[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d2 = dx * dx + dy * dy;

        if (d2 < distThreshold * distThreshold) {
          const dist = Math.sqrt(d2);
          const lineAlpha = (1 - dist / distThreshold) * 0.45;
          g.moveTo(p1.x, p1.y)
            .lineTo(p2.x, p2.y)
            .stroke({ color: TOXIC_BLACK, alpha: lineAlpha, width: 1.2 }); // Black mesh lines
        }
      }

      // Stronger size pulse: dots grow significantly with the heartbeat
      const drawRadius = p1.radius * (1 + punch * 2.5);

      // Draw White Outline for high contrast
      g.circle(p1.x, p1.y, drawRadius + 1.6).fill({
        color: 0xffffff,
        alpha: p1.alpha,
      });

      // Draw Black Dot
      g.circle(p1.x, p1.y, drawRadius).fill({
        color: TOXIC_BLACK,
        alpha: p1.alpha,
      });
    }
  }

  private initPatternLines(): void {
    const PATH_COUNT = 8 + Math.floor(Math.random() * 4);
    for (let i = 0; i < PATH_COUNT; i++) {
      const points: { x: number; y: number; ox: number; oy: number }[] = [];
      const segments = 3 + Math.floor(Math.random() * 3);

      // Start at 0,0 (relative to path x,y)
      let curX = 0;
      let curY = 0;
      points.push({
        x: curX,
        y: curY,
        ox: Math.random() * 10,
        oy: Math.random() * 10,
      });

      for (let j = 0; j < segments; j++) {
        curX += (Math.random() - 0.5) * 120;
        curY += (Math.random() - 0.5) * 120;
        points.push({
          x: curX,
          y: curY,
          ox: Math.random() * 10,
          oy: Math.random() * 10,
        });
      }

      this.patternPaths.push({
        x: (Math.random() - 0.5) * LOGO_SIZE * 0.9,
        y: (Math.random() - 0.5) * LOGO_SIZE * 0.9,
        points,
        width: 5 + Math.random() * 30, // Random boldness: 5px to 35px
        color: STAIN_PALETTE[Math.floor(Math.random() * STAIN_PALETTE.length)],
        speed: 0.05 + Math.random() * 0.1,
        rotationSpeed: (Math.random() - 0.5) * 0.4,
        rotationOffset: Math.random() * Math.PI * 2,
        offset: Math.random() * 100,
      });
    }
  }

  private initDotMeshes(): void {
    const MESH_COUNT = 2 + Math.floor(Math.random() * 2); // 2-3 meshes
    for (let i = 0; i < MESH_COUNT; i++) {
      const dots: { x: number; y: number; vx: number; vy: number }[] = [];
      const dotCount = 15 + Math.floor(Math.random() * 10);
      const radius = 80 + Math.random() * 60;

      for (let j = 0; j < dotCount; j++) {
        dots.push({
          x: (Math.random() - 0.5) * radius * 2,
          y: (Math.random() - 0.5) * radius * 2,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
        });
      }

      this.dotMeshes.push({
        x: (Math.random() - 0.5) * LOGO_SIZE * 0.7,
        y: (Math.random() - 0.5) * LOGO_SIZE * 0.7,
        dots,
        color: STAIN_PALETTE[Math.floor(Math.random() * STAIN_PALETTE.length)],
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        driftSpeed: 0.05 + Math.random() * 0.1,
        offset: Math.random() * 100,
        scale: 0.8 + Math.random() * 0.4,
      });
    }
  }

  private drawDotMeshes(): void {
    const g = this.meshGfx;
    g.clear();

    const punch = 1 + this.beatDecay * 0.1;

    for (const m of this.dotMeshes) {
      const driftX = Math.sin(this.time * m.driftSpeed + m.offset) * 25;
      const driftY = Math.cos(this.time * m.driftSpeed * 0.9 + m.offset) * 25;
      const rotation = this.time * m.rotationSpeed;

      const baseX = m.x + driftX;
      const baseY = m.y + driftY;

      // Transform dots
      const tDots = m.dots.map((d) => {
        const px = (d.x + Math.sin(this.time + d.x) * 5) * m.scale * punch;
        const py = (d.y + Math.cos(this.time + d.y) * 5) * m.scale * punch;

        const rx = px * Math.cos(rotation) - py * Math.sin(rotation);
        const ry = px * Math.sin(rotation) + py * Math.cos(rotation);

        return { x: baseX + rx, y: baseY + ry };
      });

      // Draw connections (mesh)
      for (let i = 0; i < tDots.length; i++) {
        for (let j = i + 1; j < tDots.length; j++) {
          const dx = tDots[i].x - tDots[j].x;
          const dy = tDots[i].y - tDots[j].y;
          const distSq = dx * dx + dy * dy;
          const maxDist = 70 * m.scale;

          if (distSq < maxDist * maxDist) {
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / maxDist) * 0.4;
            g.moveTo(tDots[i].x, tDots[i].y)
              .lineTo(tDots[j].x, tDots[j].y)
              .stroke({ color: m.color, width: 1.5, alpha });
          }
        }
      }

      // Draw dots
      for (const d of tDots) {
        g.circle(d.x, d.y, 2.5).fill({ color: m.color, alpha: 0.8 });
      }
    }
  }

  private drawPatternLines(): void {
    const g = this.patternGfx;
    g.clear();

    const punch = 1 + this.beatDecay * 0.15;

    for (const p of this.patternPaths) {
      const driftX = Math.sin(this.time * p.speed + p.offset) * 30;
      const driftY = Math.cos(this.time * p.speed * 0.8 + p.offset) * 30;
      const rotation = p.rotationOffset + this.time * p.rotationSpeed;

      const baseX = p.x + driftX;
      const baseY = p.y + driftY;

      // Map points through morphing and rotation
      const morphedPoints = p.points.map((pt) => {
        // Point-specific morphing/wobble
        const wx = Math.sin(this.time * 2 + pt.ox) * 10;
        const wy = Math.cos(this.time * 1.5 + pt.oy) * 10;
        const px = (pt.x + wx) * punch;
        const py = (pt.y + wy) * punch;

        // Apply rotation
        const rx = px * Math.cos(rotation) - py * Math.sin(rotation);
        const ry = px * Math.sin(rotation) + py * Math.cos(rotation);

        return { x: rx, y: ry };
      });

      // Draw as a smooth quadratic curve sequence
      g.moveTo(baseX + morphedPoints[0].x, baseY + morphedPoints[0].y);

      for (let i = 1; i < morphedPoints.length - 1; i++) {
        const xc = (morphedPoints[i].x + morphedPoints[i + 1].x) / 2;
        const yc = (morphedPoints[i].y + morphedPoints[i + 1].y) / 2;
        g.quadraticCurveTo(
          baseX + morphedPoints[i].x,
          baseY + morphedPoints[i].y,
          baseX + xc,
          baseY + yc,
        );
      }

      // Finish the curve
      const last = morphedPoints[morphedPoints.length - 1];
      g.lineTo(baseX + last.x, baseY + last.y);

      g.stroke({
        color: p.color,
        width: p.width,
        cap: "round",
        join: "round",
        alpha: 0.75,
      });
    }
  }

  private initToxicElements(): void {
    // Exactly 5 black oozing elements
    const configs = [
      { isGreen: false },
      { isGreen: false },
      { isGreen: false },
      { isGreen: false },
      { isGreen: false },
    ];

    if (this.stains.length === 0) return;

    for (let i = 0; i < configs.length; i++) {
      // Pick a random stain as the parent for movement sync
      const parentIndex = Math.floor(Math.random() * this.stains.length);
      const parent = this.stains[parentIndex];

      // Place it specifically on the border/perimeter of the stain
      const angle = Math.random() * Math.PI * 2;
      const dist = parent.radius * 0.95; // Right on the edge

      this.toxicDrops.push({
        parentIndex,
        relX: Math.cos(angle) * dist,
        relY: Math.sin(angle) * dist,
        radius: 3 + Math.random() * 5, // 8x smaller scale
        type: Math.random() > 0.5 ? "jagged" : "splat",
        angle: Math.random() * Math.PI * 2,
        driftSpeed: 0.05 + Math.random() * 0.1,
        offset: Math.random() * 100,
        isGreen: false, // All black
      });
    }
  }

  private drawToxicElements(): void {
    const g = this.toxicGfx;
    g.clear();

    const punch = 1 + this.beatDecay * 0.3;

    for (const d of this.toxicDrops) {
      const parent = this.stains[d.parentIndex];
      if (!parent) continue;

      // Base position matches the parent stain's drift logic from drawStains()
      const baseX = parent.x + Math.sin(this.time * 0.3 + parent.radius) * 12;
      const baseY = parent.y + Math.cos(this.time * 0.25 + parent.x) * 12;

      // Apply its own local micro-drift
      const driftX = Math.sin(this.time * d.driftSpeed + d.offset) * 4;
      const driftY = Math.cos(this.time * d.driftSpeed * 0.8 + d.offset) * 4;

      const x = baseX + d.relX + driftX;
      const y = baseY + d.relY + driftY;
      const r = d.radius * punch;
      const color = TOXIC_BLACK; // Always black

      // 1. Draw Oozing Drip (Vertical/Gravitational)
      // Increased length multiplier to 6.0 for a long, oozing look
      const dripLen =
        r *
        6.0 *
        (1 + this.beatDecay * 0.5) *
        (0.9 + Math.sin(this.time * 2 + d.offset) * 0.1);
      const segments = 8; // Increased segments for smoother long drips
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const wobble = Math.sin(this.time * 5 + i + d.offset) * (r * 0.3);
        const sx = x + wobble;
        const sy = y + dripLen * t;
        const sr = r * (1 - t * 0.5) * (t > 0.85 ? 1.3 : 1.0); // Taper and bulge

        g.circle(sx, sy, sr).fill(color);
      }

      // 2. Draw Main Body
      if (d.type === "jagged") {
        const points: { x: number; y: number }[] = [];
        const sides = 6;
        for (let j = 0; j < sides; j++) {
          const a = (j / sides) * Math.PI * 2 + d.angle + this.time * 0.2;
          const jaggedR = r * (0.8 + Math.random() * 0.4);
          points.push({
            x: x + Math.cos(a) * jaggedR,
            y: y + Math.sin(a) * jaggedR,
          });
        }
        g.poly(points).fill(color);
      } else {
        // Splat style
        g.circle(x, y, r).fill(color);
        for (let j = 0; j < 3; j++) {
          const a = (j * Math.PI * 2) / 3 + d.offset;
          const px = x + Math.cos(a) * r * 0.6;
          const py = y + Math.sin(a) * r * 0.6;
          g.circle(px, py, r * 0.8).fill(color);
        }
      }

      // 3. Urban Grime (Micro-splatters/Noise)
      for (let j = 0; j < 3; j++) {
        const noiseA = d.offset + j + this.time;
        const noiseD = r * (1.2 + Math.random() * 0.5);
        g.circle(
          x + Math.cos(noiseA) * noiseD,
          y + Math.sin(noiseA) * noiseD,
          1.5,
        ).fill(color);
      }
    }
  }

  private animateHeartbeat(): void {
    const prevPhase = (this.time - 0.016) % BEAT_INTERVAL;
    const currPhase = this.time % BEAT_INTERVAL;
    const dubPhase = BEAT_INTERVAL * DUB_PHASE_RATIO;

    if (currPhase < prevPhase) {
      this.beatDecay = 1.0;
    } else if (prevPhase < dubPhase && currPhase >= dubPhase) {
      this.beatDecay = Math.max(this.beatDecay, 0.55);
    }
    this.beatDecay = Math.max(0, this.beatDecay - 5.5 * 0.016);
  }

  private drawFluidBlobs(): void {
    const g = this.blobGfx;
    g.clear();

    for (const b of this.blobs) {
      b.angle += b.speed * (1 + this.beatDecay * 0.5);
      const wobble = Math.sin(this.time * 2 + b.offset) * 20;
      const r = b.orbitRadius + wobble + this.beatDecay * 30;
      const x = Math.cos(b.angle) * r;
      const y = Math.sin(b.angle) * r;

      const alpha = b.alpha * (0.8 + 0.2 * Math.sin(this.time + b.offset));
      const size = b.size * (1 + this.beatDecay * 0.2);

      g.circle(x, y, size).fill({ color: b.color, alpha });
      // Highlight
      g.circle(x - size * 0.3, y - size * 0.3, size * 0.2).fill({
        color: 0xffffff,
        alpha: alpha * 0.6,
      });
    }
  }

  private drawWavyLines(): void {
    const g = this.wavyGfx;
    g.clear();

    for (const line of this.wavyLines) {
      const points: { x: number; y: number }[] = [];
      const steps = 100;
      const phase = this.time * line.speed;
      const beatAmp = line.amp * (1 + this.beatDecay * 1.5);

      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const radialOffset = Math.sin(angle * line.freq + phase) * beatAmp;
        const r = line.r + radialOffset + this.beatDecay * 10;
        points.push({
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
        });
      }

      g.poly(points).stroke({
        color: line.color,
        width: line.weight,
        alpha: line.alpha,
        cap: "round",
        join: "round",
      });
    }
  }

  private drawGyroRings(): void {
    const g = this.gyroGfx;
    g.clear();

    const punch = 1 + this.beatDecay * 0.2;

    for (const ring of this.gyroRings) {
      const rotation = this.time * ring.speed + ring.phase;
      // Simulate 3D tilt by using an ellipse with varying aspect ratio
      const aspect = Math.abs(Math.cos(rotation * 0.5));
      const radius = ring.radius * punch;

      g.ellipse(0, 0, radius, radius * aspect).stroke({
        color: ring.color,
        width: 4 + this.beatDecay * 4,
        alpha: 0.4 + aspect * 0.4,
      });

      // Add "nodes" or "ticks" on the ring for tech feel
      const nodeCount = 4;
      for (let i = 0; i < nodeCount; i++) {
        const angle = rotation + (i * Math.PI * 2) / nodeCount;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * aspect;

        g.circle(x, y, 4 + this.beatDecay * 2).fill({
          color: ring.color,
          alpha: 0.8,
        });
      }
    }
  }

  private drawStains(): void {
    const cg = this.cloudGfx;
    const sg = this.stainGfx;
    cg.clear();
    sg.clear();

    const punch = 1 + this.beatDecay * 0.2;
    const outlineColor = 0x11111b; // Dark crust for hard outlines

    // 1. Draw background clouds (soft under-glow, single pass)
    for (const c of this.cloudBlobs) {
      const driftX = Math.sin(this.time * c.driftSpeed + c.offset) * 60;
      const driftY = Math.cos(this.time * c.driftSpeed * 0.7 + c.offset) * 60;
      const x = c.x + driftX;
      const y = c.y + driftY;
      const r = c.radius * punch;

      cg.circle(x, y, r).fill({ color: c.color, alpha: c.alpha });
    }

    // 2. Draw central overlapping graffiti stains (sharp edges)
    const outlineWidth = 4;

    // Pass 1: Draw unified outlines for the whole cluster
    for (const s of this.stains) {
      const x = s.x + Math.sin(this.time * 0.3 + s.radius) * 12;
      const y = s.y + Math.cos(this.time * 0.25 + s.x) * 12;
      const r = s.radius * punch;

      // Draw protrusions outline
      for (let j = 0; j < 3; j++) {
        const angle = (j * Math.PI * 2) / 3 + s.radius;
        const px = x + Math.cos(angle) * (r * 0.5);
        const py = y + Math.sin(angle) * (r * 0.5);
        sg.circle(px, py, r * 0.75 + outlineWidth).fill(outlineColor);
      }
      // Main core outline
      sg.circle(x, y, r + outlineWidth).fill(outlineColor);
    }

    // Pass 2: Draw the colored fills on top
    for (const s of this.stains) {
      const x = s.x + Math.sin(this.time * 0.3 + s.radius) * 12;
      const y = s.y + Math.cos(this.time * 0.25 + s.x) * 12;
      const r = s.radius * punch;

      // Draw protrusions fill
      for (let j = 0; j < 3; j++) {
        const angle = (j * Math.PI * 2) / 3 + s.radius;
        const px = x + Math.cos(angle) * (r * 0.5);
        const py = y + Math.sin(angle) * (r * 0.5);
        sg.circle(px, py, r * 0.75).fill(s.color);
      }
      // Main core fill
      sg.circle(x, y, r).fill(s.color);

      // Inner highlight (sharp)
      sg.circle(x - r * 0.15, y - r * 0.15, r * 0.35).fill({
        color: 0xffffff,
        alpha: 0.15,
      });
    }
  }

  private drawProceduralLogo(): void {
    const float = Math.sin(this.time * 0.8) * 10;
    const breathe = 1 + 0.05 * Math.sin(this.time * 0.6);
    const punch = 1 + 0.15 * this.beatDecay;

    this.logoContainer.scale.set(breathe * punch);
    this.logoContainer.y = float;

    // Subtle glow/aura center area
    this.logoGfx.clear();
    this.logoGfx
      .circle(0, float, LOGO_SIZE * 0.4)
      .fill({ color: MAUVE, alpha: 0.05 * punch });
  }

  private initDotGrids(): void {
    const GRID_COUNT = 2 + Math.floor(Math.random() * 2); // 2-3 grids
    for (let i = 0; i < GRID_COUNT; i++) {
      this.dotGrids.push({
        x: (Math.random() - 0.5) * LOGO_SIZE * 0.8,
        y: (Math.random() - 0.5) * LOGO_SIZE * 0.8,
        cols: 4 + Math.floor(Math.random() * 4),
        rows: 4 + Math.floor(Math.random() * 4),
        spacing: 15 + Math.random() * 15,
        color: STAIN_PALETTE[Math.floor(Math.random() * STAIN_PALETTE.length)],
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        driftSpeed: 0.04 + Math.random() * 0.08,
        offset: Math.random() * 100,
        alpha: 0.3 + Math.random() * 0.3,
      });
    }
  }

  private drawDotGrids(): void {
    const g = this.gridGfx;
    g.clear();

    const punch = 1 + this.beatDecay * 0.1;

    for (const grid of this.dotGrids) {
      const driftX = Math.sin(this.time * grid.driftSpeed + grid.offset) * 35;
      const driftY =
        Math.cos(this.time * grid.driftSpeed * 0.8 + grid.offset) * 35;
      const rotation = this.time * grid.rotationSpeed;

      const baseX = grid.x + driftX;
      const baseY = grid.y + driftY;

      const halfW = ((grid.cols - 1) * grid.spacing) / 2;
      const halfH = ((grid.rows - 1) * grid.spacing) / 2;

      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const lx = c * grid.spacing - halfW;
          const ly = r * grid.spacing - halfH;

          // Orbit/Pulse each dot slightly
          const px = (lx + Math.sin(this.time * 2 + c) * 3) * punch;
          const py = (ly + Math.cos(this.time * 2 + r) * 3) * punch;

          // Rotate
          const rx = px * Math.cos(rotation) - py * Math.sin(rotation);
          const ry = px * Math.sin(rotation) + py * Math.cos(rotation);

          g.circle(baseX + rx, baseY + ry, 2).fill({
            color: grid.color,
            alpha: grid.alpha,
          });
        }
      }
    }
  }

  private initBoldDotGrids(): void {
    const GRID_COUNT = 1; // Exactly one cluster
    for (let i = 0; i < GRID_COUNT; i++) {
      this.boldDotGrids.push({
        x: (Math.random() - 0.5) * LOGO_SIZE * 1.1,
        y: (Math.random() - 0.5) * LOGO_SIZE * 1.1,
        cols: 8, // Exact 8x8 grid
        rows: 8, // Exact 8x8 grid
        spacing: 12 + Math.random() * 8, // Increased density (tightened spacing)
        color: LAVENDER, // Catppuccin Lavender
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        driftSpeed: 0.03 + Math.random() * 0.06,
        offset: Math.random() * 100,
        alpha: 0.9, // High opacity for bold feel
      });
    }
  }

  private drawBoldDotGrids(): void {
    const g = this.boldGridGfx;
    g.clear();

    const punch = 1 + this.beatDecay * 0.12;

    for (const grid of this.boldDotGrids) {
      const driftX = Math.sin(this.time * grid.driftSpeed + grid.offset) * 40;
      const driftY =
        Math.cos(this.time * grid.driftSpeed * 0.7 + grid.offset) * 40;
      const rotation = this.time * grid.rotationSpeed;

      const baseX = grid.x + driftX;
      const baseY = grid.y + driftY;

      const halfW = ((grid.cols - 1) * grid.spacing) / 2;
      const halfH = ((grid.rows - 1) * grid.spacing) / 2;

      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const lx = c * grid.spacing - halfW;
          const ly = r * grid.spacing - halfH;

          // Orbit/Pulse each dot
          const px = (lx + Math.sin(this.time * 1.5 + c) * 4) * punch;
          const py = (ly + Math.cos(this.time * 1.5 + r) * 4) * punch;

          // Rotate
          const rx = px * Math.cos(rotation) - py * Math.sin(rotation);
          const ry = px * Math.sin(rotation) + py * Math.cos(rotation);

          const dotX = baseX + rx;
          const dotY = baseY + ry;
          const radius = 3.5;

          // Draw Black Outline
          g.circle(dotX, dotY, radius + 2).fill({
            color: TOXIC_BLACK,
            alpha: grid.alpha,
          });

          // Draw White Dot
          g.circle(dotX, dotY, radius).fill({
            color: grid.color,
            alpha: grid.alpha,
          });
        }
      }
    }
  }

  private initRotatingObjects(): void {
    const COUNT = 10 + Math.floor(Math.random() * 6); // 10-16 objects
    const palette = [LAVENDER, MAUVE, BLUE, SAPPHIRE, SKY];

    for (let i = 0; i < COUNT; i++) {
      this.rotatingObjects.push({
        x: (Math.random() - 0.5) * LOGO_SIZE * 1.8,
        y: (Math.random() - 0.5) * LOGO_SIZE * 1.8,
        type: Math.random() > 0.4 ? "rect" : "circle", // Bias slightly towards rects
        size: 15 + Math.random() * 25,
        color: palette[Math.floor(Math.random() * palette.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        driftSpeed: 0.02 + Math.random() * 0.04,
        offset: Math.random() * 100,
      });
    }
  }

  private drawRotatingObjects(ticker: Ticker): void {
    const g = this.rotatingGfx;
    g.clear();
    const punch = this.beatDecay * 0.3;

    for (const obj of this.rotatingObjects) {
      obj.rotation += obj.rotationSpeed * ticker.deltaTime;

      const dx = Math.sin(this.time * obj.driftSpeed + obj.offset) * 45;
      const dy = Math.cos(this.time * obj.driftSpeed * 0.8 + obj.offset) * 45;

      const drawX = obj.x + dx;
      const drawY = obj.y + dy;
      const drawSize = obj.size * (1 + punch);

      if (obj.type === "rect") {
        const half = drawSize / 2;
        const cos = Math.cos(obj.rotation);
        const sin = Math.sin(obj.rotation);

        // Corner offsets from center (drawX, drawY)
        const x1 = -half * cos - -half * sin;
        const y1 = -half * sin + -half * cos;
        const x2 = half * cos - -half * sin;
        const y2 = half * sin + -half * cos;
        const x3 = half * cos - half * sin;
        const y3 = half * sin + half * cos;
        const x4 = -half * cos - half * sin;
        const y4 = -half * sin + half * cos;

        g.poly([
          drawX + x1,
          drawY + y1,
          drawX + x2,
          drawY + y2,
          drawX + x3,
          drawY + y3,
          drawX + x4,
          drawY + y4,
        ]).fill({ color: obj.color, alpha: 1.0 });
      } else {
        g.circle(drawX, drawY, drawSize / 2).fill({
          color: obj.color,
          alpha: 1.0,
        });
      }
    }
  }

  public resize(width: number, height: number): void {
    this.x = width * 0.5;
    this.y = height * 0.5;
  }
}
