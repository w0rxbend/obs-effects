import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

import {
  DEEP,
  MID,
  SURFACE,
  CAUSTIC,
  FOAM,
  TEAL,
  SKY,
  BLUE,
  MAUVE,
  YELLOW,
  WHITE,
  SAND,
  CORAL1,
  FishType,
  SARDINE_PALETTES,
  TROPICAL_PALETTES,
  ANGEL_PALETTES,
  PUFFER_PALETTES,
  SHARK_PALETTES,
  MANTA_PALETTES,
  SUB_PALETTES,
  PIRANHA_PALETTES,
  CRAB_PALETTES,
  HAMMERHEAD_PALETTES,
  JELLYFISH_PALETTES,
  SEA_SNAKE_PALETTES,
  CROCODILE_PALETTES,
  SHRIMP_PALETTES,
  PlantType,
  DecoType,
  rnd,
  pick,
} from "./aquarium/palettes";
import type { FishColors, PlantDef, DecoDef } from "./aquarium/palettes";
import {
  drawSardine,
  drawTropical,
  drawAngel,
  drawPuffer,
  drawShark,
  drawManta,
  drawSubmarine,
  drawPiranha,
  drawHammerhead,
  drawJellyfish,
  drawSeaSnake,
  drawCrocodile,
  drawShrimp,
  drawKelp,
  drawSeaFan,
  drawAnemone,
  drawBubbleAlgae,
  drawSeaGrass,
  drawFern,
  drawRock,
  drawStarfish,
  drawSeaUrchin,
  drawShell,
  drawAnchor,
  drawTreasureChest,
  drawCrab,
} from "./aquarium/art";

class FishAgent extends Container {
  private readonly gfx = new Graphics();

  vx = 0;
  vy = 0;
  maxSpeed = 0;
  wobblePhase = 0;
  wobbleSpeed = 0;
  wobbleAmp = 0;
  tailPhase = 0;
  tailSpeed = 0;
  propPhase = 0;
  leanPhase = 0;
  facingRight = true;

  readonly fishType: FishType;
  readonly colors: FishColors;
  readonly baseScale: number;

  constructor(type: FishType, colors: FishColors, scale: number) {
    super();
    this.fishType = type;
    this.colors = colors;
    this.baseScale = scale;
    this.addChild(this.gfx);
  }

  redraw(): void {
    this.gfx.clear();
    const c = this.colors;
    const tp = this.tailPhase;
    switch (this.fishType) {
      case FishType.SARDINE:
        drawSardine(this.gfx, tp, c);
        break;
      case FishType.TROPICAL:
        drawTropical(this.gfx, tp, c);
        break;
      case FishType.ANGEL:
        drawAngel(this.gfx, tp, c);
        break;
      case FishType.PUFFER:
        drawPuffer(this.gfx, tp, c);
        break;
      case FishType.SHARK:
        drawShark(this.gfx, tp, c);
        break;
      case FishType.MANTA:
        drawManta(this.gfx, tp, c);
        break;
      case FishType.SUBMARINE:
        drawSubmarine(this.gfx, this.propPhase, c);
        break;
      case FishType.PIRANHA:
        drawPiranha(this.gfx, tp, c);
        break;
      case FishType.HAMMERHEAD:
        drawHammerhead(this.gfx, tp, c);
        break;
      case FishType.JELLYFISH:
        drawJellyfish(this.gfx, tp, c);
        break;
      case FishType.SEA_SNAKE:
        drawSeaSnake(this.gfx, tp, c);
        break;
      case FishType.CROCODILE:
        drawCrocodile(this.gfx, tp, c);
        break;
      case FishType.SHRIMP:
        drawShrimp(this.gfx, tp, c);
        break;
    }
    this.scale.set(
      this.baseScale * (this.facingRight ? 1 : -1),
      this.baseScale,
    );
    const leanAmt =
      this.fishType === FishType.SUBMARINE || this.fishType === FishType.MANTA
        ? 0.04
        : 0.1;
    this.rotation = Math.sin(this.leanPhase) * leanAmt;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT TYPES
// ═════════════════════════════════════════════════════════════════════════════

interface Bubble {
  x: number;
  y: number;
  vy: number;
  r: number;
  alpha: number;
  alphaPhase: number;
  wobblePhase: number;
  wobbleAmp: number;
}

const BUBBLE_COUNT = 80;
const PARTICLE_COUNT = 55;
const PLANKTON_PER_SWARM = 38;
const PLANKTON_SWARM_COUNT = 6;
const SAND_RIPPLE_COUNT = 5;

// Vertical water gradient, deepest band first
const GRADIENT_BANDS = [
  DEEP,
  0x0c1430,
  0x0d1e40,
  0x0f2850,
  MID,
  0x123260,
  SURFACE,
  0x1e5580,
];

interface Crab {
  nx: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  phaseSpeed: number;
  pauseTimer: number;
  scale: number;
  colors: FishColors;
}

interface PlanktonMember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  phaseSpeed: number;
  r: number;
  shape: 0 | 1 | 2; // 0=copepod  1=radiolarian  2=dinoflagellate
}

interface PlanktonSwarm {
  cx: number;
  cy: number;
  vcx: number;
  vcy: number;
  color: number;
  glowColor: number;
  members: PlanktonMember[];
}

// ═════════════════════════════════════════════════════════════════════════════
// AQUARIUM SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export class AquariumScreen extends Container {
  public static assetBundles = ["main"];

  // Layers back → front
  private readonly bgGfx = new Graphics(); // static water gradient
  private readonly bgFxGfx = new Graphics(); // whale silhouette + centre shafts
  private readonly lightRayGfx = new Graphics();
  private readonly causticGfx = new Graphics();
  private readonly sandGfx = new Graphics(); // static terrain body, rocks, caves
  private readonly sandFxGfx = new Graphics(); // swaying algae, stalactites, cave glow
  private readonly rippleGfx: Graphics[] = []; // one static curve per ripple
  private readonly pebbleGfx = new Graphics(); // static scattered pebbles
  private readonly decoGfx = new Graphics(); // rocks, starfish, shells, anchor, chest
  private readonly plantsGfx = new Graphics(); // all plants
  private readonly crabGfx = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly planktonGfx = new Graphics();
  private readonly fishCont = new Container();
  private readonly bubbleGfx = new Graphics();
  private readonly surfaceGfx = new Graphics();

  private readonly agents: FishAgent[] = [];
  private readonly bubbles: Bubble[] = [];
  private readonly particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    alpha: number;
    color: number;
    r: number;
    life: number;
  }> = [];

  // Pre-defined plants and decos
  private readonly plants: PlantDef[] = [];
  private readonly decos: DecoDef[] = [];

  // Caustic pools
  private readonly caustics: Array<{
    x: number;
    y: number;
    phase: number;
    speed: number;
    size: number;
    alpha: number;
  }> = [];

  // Light rays
  private readonly lightRays: Array<{
    nx: number;
    phase: number;
    speed: number;
    width: number;
    alpha: number;
  }> = [];

  // Plankton swarms
  private readonly planktonSwarms: PlanktonSwarm[] = [];

  // Crabs
  private readonly crabs: Crab[] = [];

  // Terrain
  private readonly terrainPts: Array<{ nx: number; ny: number }> = [];
  private readonly terrainRocks: Array<{ nx: number; width: number }> = [];
  private readonly terrainCaves: Array<{ nx: number; width: number }> = [];

  private time = 0;
  private w = 0;
  private h = 0;

  // Layers whose geometry only depends on the stage size are re-emitted when
  // this flag is set instead of on every frame.
  private staticDirty = true;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.bgFxGfx);
    this.addChild(this.lightRayGfx);
    this.addChild(this.causticGfx);
    this.addChild(this.sandGfx);
    this.addChild(this.sandFxGfx);
    for (let r = 0; r < SAND_RIPPLE_COUNT; r++) {
      const g = new Graphics();
      this.rippleGfx.push(g);
      this.addChild(g);
    }
    this.addChild(this.pebbleGfx);
    this.addChild(this.decoGfx);
    this.addChild(this.plantsGfx);
    this.addChild(this.crabGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.planktonGfx);
    this.addChild(this.fishCont);
    this.addChild(this.bubbleGfx);
    this.addChild(this.surfaceGfx);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.spawnTerrain();
    this.spawnCaustics();
    this.spawnLightRays();
    this.spawnPlants();
    this.spawnDecos();
    this.spawnCrabs();
    this.spawnAgents();
    this.spawnPlankton();
    this.spawnBubbles();
    this.spawnParticles();
    this.staticDirty = true;
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    if (this.staticDirty) this.redrawStaticLayers();

    this.drawBackground();
    this.drawLightRays(dt);
    this.drawCaustics(dt);
    this.drawSandFx();
    this.drawDecos();
    this.drawPlants(dt);
    this.updateCrabs(dt);
    this.drawParticles(dt);
    this.drawPlankton(dt);
    this.updateAgents(dt);
    this.drawBubbles(dt);
    this.drawSurface();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = 0;
    this.y = 0;
    this.staticDirty = true;
  }

  /**
   * Re-emits every layer whose geometry is a pure function of the stage size:
   * the water gradient, the terrain body with its rocks and caves, the sand
   * ripple curves and the scattered pebbles. None of that art moves, so it is
   * tessellated once here rather than on every frame.
   */
  private redrawStaticLayers(): void {
    if (this.w === 0) return;
    this.drawGradient();
    // The sea floor needs the terrain control points, which spawnTerrain()
    // only creates in show() — that is, after the first resize().
    if (this.terrainPts.length === 0) return;
    this.staticDirty = false;
    this.drawSandStatic();
    this.drawSandRipples();
    this.drawPebbles();
  }

  // ── Background + caustics ──────────────────────────────────────────────────

  private drawGradient(): void {
    this.bgGfx.clear();
    const steps = GRADIENT_BANDS.length;
    for (let i = 0; i < steps; i++) {
      this.bgGfx
        .rect(0, (i / steps) * this.h, this.w, this.h / steps)
        .fill({ color: GRADIENT_BANDS[i], alpha: 1 });
    }
  }

  private drawBackground(): void {
    this.bgFxGfx.clear();
    if (this.w === 0) return;

    // ── Distant whale silhouette ──────────────────────────────────────────────
    // Drifts slowly left-to-right across the deep background, looping
    const whalePeriod = 180; // seconds per full crossing
    const wt = (this.time % whalePeriod) / whalePeriod;
    const wx = -0.18 * this.w + wt * 1.36 * this.w;
    const wy = this.h * 0.42;
    const wsc = this.h * 0.00042; // scale relative to screen height
    const wAlpha = 0.1 + 0.04 * Math.sin(this.time * 0.12); // barely visible
    const tw = Math.sin(this.time * 0.22) * 14 * wsc; // tail fluke sway

    // Body
    this.bgFxGfx
      .moveTo(wx + 320 * wsc, wy)
      .bezierCurveTo(
        wx + 280 * wsc,
        wy - 70 * wsc,
        wx + 100 * wsc,
        wy - 90 * wsc,
        wx,
        wy - 55 * wsc,
      )
      .bezierCurveTo(
        wx - 60 * wsc,
        wy - 20 * wsc,
        wx - 80 * wsc,
        wy + 30 * wsc,
        wx - 40 * wsc,
        wy + 60 * wsc,
      )
      .bezierCurveTo(
        wx + 60 * wsc,
        wy + 95 * wsc,
        wx + 220 * wsc,
        wy + 80 * wsc,
        wx + 320 * wsc,
        wy,
      )
      .fill({ color: 0x0a1828, alpha: wAlpha });

    // Tail flukes
    this.bgFxGfx
      .moveTo(wx + 320 * wsc, wy)
      .bezierCurveTo(
        wx + 360 * wsc,
        wy - 10 * wsc,
        wx + 400 * wsc,
        wy - 60 * wsc + tw,
        wx + 390 * wsc,
        wy - 100 * wsc + tw,
      )
      .bezierCurveTo(
        wx + 380 * wsc,
        wy - 120 * wsc + tw,
        wx + 360 * wsc,
        wy - 90 * wsc + tw,
        wx + 320 * wsc,
        wy,
      )
      .fill({ color: 0x0a1828, alpha: wAlpha });
    this.bgFxGfx
      .moveTo(wx + 320 * wsc, wy)
      .bezierCurveTo(
        wx + 360 * wsc,
        wy + 10 * wsc,
        wx + 400 * wsc,
        wy + 60 * wsc - tw,
        wx + 390 * wsc,
        wy + 100 * wsc - tw,
      )
      .bezierCurveTo(
        wx + 380 * wsc,
        wy + 120 * wsc - tw,
        wx + 360 * wsc,
        wy + 90 * wsc - tw,
        wx + 320 * wsc,
        wy,
      )
      .fill({ color: 0x0a1828, alpha: wAlpha });

    // Pectoral fin
    this.bgFxGfx
      .moveTo(wx + 140 * wsc, wy + 20 * wsc)
      .bezierCurveTo(
        wx + 120 * wsc,
        wy + 80 * wsc,
        wx + 80 * wsc,
        wy + 110 * wsc,
        wx + 60 * wsc,
        wy + 90 * wsc,
      )
      .bezierCurveTo(
        wx + 80 * wsc,
        wy + 60 * wsc,
        wx + 110 * wsc,
        wy + 40 * wsc,
        wx + 140 * wsc,
        wy + 20 * wsc,
      )
      .fill({ color: 0x0a1828, alpha: wAlpha * 0.8 });

    // Light sheen on back
    this.bgFxGfx
      .moveTo(wx + 60 * wsc, wy - 50 * wsc)
      .bezierCurveTo(
        wx + 150 * wsc,
        wy - 85 * wsc,
        wx + 240 * wsc,
        wy - 75 * wsc,
        wx + 300 * wsc,
        wy - 30 * wsc,
      )
      .stroke({ color: 0x1a3a5a, alpha: wAlpha * 0.6, width: 8 * wsc });

    const cx = this.w * 0.5;
    for (let r = 0; r < 5; r++) {
      const angle = (r - 2) * 0.22;
      const alpha = 0.03 + 0.018 * Math.sin(this.time * 0.3 + r);
      this.bgFxGfx
        .moveTo(cx, 0)
        .lineTo(cx + Math.sin(angle) * this.h * 1.2, this.h)
        .stroke({ color: CAUSTIC, alpha, width: 55 + r * 28 });
    }
  }

  private spawnLightRays(): void {
    for (let i = 0; i < 14; i++) {
      this.lightRays.push({
        nx: rnd(0.05, 0.95),
        phase: rnd(0, Math.PI * 2),
        speed: rnd(0.08, 0.22),
        width: rnd(18, 75),
        alpha: rnd(0.025, 0.085),
      });
    }
  }

  private drawLightRays(dt: number): void {
    this.lightRayGfx.clear();
    if (this.w === 0) return;
    for (const r of this.lightRays) {
      r.phase += r.speed * dt;
      const drift = Math.sin(r.phase) * this.w * 0.035;
      const cx = r.nx * this.w + drift;
      const alpha = r.alpha * (0.55 + 0.45 * Math.sin(r.phase * 1.6));
      const rayH = this.h * 0.82;
      const STRIPS = 6;
      for (let s = 0; s < STRIPS; s++) {
        const t0 = s / STRIPS;
        const t1 = (s + 1) / STRIPS;
        const fade = Math.pow(1 - t0, 1.6);
        const wx0 = r.width * 0.4 + this.w * 0.09 * t0;
        const wx1 = r.width * 0.4 + this.w * 0.09 * t1;
        this.lightRayGfx
          .poly([
            cx - wx0,
            rayH * t0,
            cx + wx0,
            rayH * t0,
            cx + wx1,
            rayH * t1,
            cx - wx1,
            rayH * t1,
          ])
          .fill({ color: 0x7ad8ee, alpha: alpha * fade });
      }
    }
  }

  private spawnCaustics(): void {
    for (let i = 0; i < 28; i++) {
      this.caustics.push({
        x: rnd(0, 1920),
        y: rnd(0, 380),
        phase: rnd(0, Math.PI * 2),
        speed: rnd(0.4, 1.2),
        size: rnd(22, 80),
        alpha: rnd(0.04, 0.11),
      });
    }
  }

  private drawCaustics(dt: number): void {
    this.causticGfx.clear();
    if (this.w === 0) return;
    for (const c of this.caustics) {
      c.phase += c.speed * dt;
      const xp = (c.x / 1920) * this.w;
      const yp = (c.y / 380) * this.h * 0.32;
      const sc = 0.8 + 0.4 * Math.sin(c.phase);
      this.causticGfx.ellipse(xp, yp, c.size * sc, c.size * 0.38 * sc).stroke({
        color: CAUSTIC,
        alpha: c.alpha * (0.5 + 0.5 * Math.sin(c.phase * 1.3)),
        width: 1.4,
      });
    }
  }

  // ── Terrain ────────────────────────────────────────────────────────────────

  private spawnTerrain(): void {
    // Control points: nx=normalised x, ny=normalised y of terrain surface
    // Lower ny = higher ground (closer to top of screen)
    const pts: Array<{ nx: number; ny: number }> = [
      { nx: 0.0, ny: 0.84 },
      { nx: 0.06, ny: 0.79 }, // gentle left dune
      { nx: 0.13, ny: 0.84 },
      { nx: 0.22, ny: 0.81 },
      { nx: 0.28, ny: 0.71 }, // left rock formation peak
      { nx: 0.33, ny: 0.83 },
      { nx: 0.4, ny: 0.85 },
      { nx: 0.43, ny: 0.89 }, // cave depression
      { nx: 0.47, ny: 0.85 },
      { nx: 0.54, ny: 0.82 },
      { nx: 0.58, ny: 0.76 }, // centre dune crest
      { nx: 0.64, ny: 0.83 },
      { nx: 0.7, ny: 0.85 },
      { nx: 0.73, ny: 0.7 }, // right rock formation peak
      { nx: 0.78, ny: 0.82 },
      { nx: 0.82, ny: 0.88 }, // right cave depression
      { nx: 0.86, ny: 0.83 },
      { nx: 0.91, ny: 0.78 }, // far-right dune
      { nx: 0.96, ny: 0.83 },
      { nx: 1.0, ny: 0.84 },
    ];
    this.terrainPts.length = 0;
    this.terrainPts.push(...pts);

    this.terrainRocks.length = 0;
    this.terrainRocks.push({ nx: 0.28, width: 0.1 });
    this.terrainRocks.push({ nx: 0.73, width: 0.11 });

    this.terrainCaves.length = 0;
    this.terrainCaves.push({ nx: 0.43, width: 0.09 });
    this.terrainCaves.push({ nx: 0.82, width: 0.08 });
  }

  private getTerrainY(nx: number): number {
    const pts = this.terrainPts;
    if (pts.length === 0) return this.h * 0.84;
    if (nx <= pts[0].nx) return pts[0].ny * this.h;
    if (nx >= pts[pts.length - 1].nx) return pts[pts.length - 1].ny * this.h;
    for (let i = 1; i < pts.length; i++) {
      if (nx <= pts[i].nx) {
        const t = (nx - pts[i - 1].nx) / (pts[i].nx - pts[i - 1].nx);
        const st = t * t * (3 - 2 * t); // smooth-step
        return (pts[i - 1].ny * (1 - st) + pts[i].ny * st) * this.h;
      }
    }
    return pts[pts.length - 1].ny * this.h;
  }

  // ── Sand floor ─────────────────────────────────────────────────────────────

  /** Trace the terrain surface curve into `g`, shifted down by `offsetY`. */
  private traceSurface(g: Graphics, offsetY: number): void {
    const W = this.w,
      H = this.h;
    const pts = this.terrainPts;
    g.moveTo(0, pts[0].ny * H + offsetY);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1],
        p1 = pts[i];
      const mx = (p0.nx + p1.nx) * 0.5 * W;
      g.bezierCurveTo(
        mx,
        p0.ny * H + offsetY,
        mx,
        p1.ny * H + offsetY,
        p1.nx * W,
        p1.ny * H + offsetY,
      );
    }
  }

  /** Terrain body, rock masses and cave mouths — fixed once per stage size. */
  private drawSandStatic(): void {
    const g = this.sandGfx;
    g.clear();
    const W = this.w,
      H = this.h;

    // Layer 1: deep substrate (dark rock base)
    this.traceSurface(g, H * 0.015);
    g.lineTo(W, H).lineTo(0, H).closePath().fill({ color: 0x3a2f22, alpha: 1 });

    // Layer 2: mid sand body
    this.traceSurface(g, H * 0.007);
    g.lineTo(W, H)
      .lineTo(0, H)
      .closePath()
      .fill({ color: 0xc8a96e, alpha: 0.9 });

    // Layer 3: top sand surface (lightest)
    this.traceSurface(g, 0);
    g.lineTo(W, H).lineTo(0, H).closePath().fill({ color: SAND, alpha: 0.7 });

    // ── Rock formations ──────────────────────────────────────────────
    for (const rock of this.terrainRocks) {
      const rx = rock.nx * W;
      const ry = this.getTerrainY(rock.nx);
      const rw = rock.width * W;

      // Dark rocky mass rising from terrain
      g.moveTo(rx - rw * 0.55, ry + 6)
        .bezierCurveTo(
          rx - rw * 0.45,
          ry - 30,
          rx - rw * 0.15,
          ry - 50,
          rx,
          ry - 58,
        )
        .bezierCurveTo(
          rx + rw * 0.15,
          ry - 50,
          rx + rw * 0.45,
          ry - 28,
          rx + rw * 0.55,
          ry + 6,
        )
        .closePath()
        .fill({ color: 0x455a64, alpha: 0.95 });

      // Craggy secondary peak
      g.moveTo(rx - rw * 0.25, ry + 4)
        .bezierCurveTo(
          rx - rw * 0.2,
          ry - 22,
          rx + rw * 0.05,
          ry - 36,
          rx + rw * 0.18,
          ry - 30,
        )
        .bezierCurveTo(
          rx + rw * 0.3,
          ry - 20,
          rx + rw * 0.25,
          ry,
          rx + rw * 0.25,
          ry + 4,
        )
        .closePath()
        .fill({ color: 0x546e7a, alpha: 0.9 });

      // Highlight ridge
      g.moveTo(rx - rw * 0.28, ry - 20)
        .bezierCurveTo(
          rx - rw * 0.1,
          ry - 48,
          rx + rw * 0.08,
          ry - 56,
          rx + rw * 0.18,
          ry - 44,
        )
        .stroke({ color: 0x90a4ae, alpha: 0.4, width: 2.5 });
    }

    // ── Cave openings ─────────────────────────────────────────────────
    for (const cave of this.terrainCaves) {
      const cx = cave.nx * W;
      const cy = this.getTerrainY(cave.nx);
      const cw = cave.width * W;

      // Deep void
      g.ellipse(cx, cy + 10, cw * 0.52, 42).fill({
        color: 0x05080f,
        alpha: 0.98,
      });
      g.ellipse(cx, cy + 14, cw * 0.38, 30).fill({
        color: 0x020408,
        alpha: 1.0,
      });

      // Cave rim — lighter arch highlight
      g.moveTo(cx - cw * 0.52, cy + 10)
        .bezierCurveTo(
          cx - cw * 0.4,
          cy - 18,
          cx + cw * 0.4,
          cy - 18,
          cx + cw * 0.52,
          cy + 10,
        )
        .stroke({ color: 0x6fa8c4, alpha: 0.3, width: 2.8 });

      // Rock overhang above cave
      g.moveTo(cx - cw * 0.6, cy)
        .bezierCurveTo(
          cx - cw * 0.5,
          cy - 12,
          cx - cw * 0.3,
          cy - 20,
          cx,
          cy - 18,
        )
        .bezierCurveTo(
          cx + cw * 0.3,
          cy - 20,
          cx + cw * 0.5,
          cy - 12,
          cx + cw * 0.6,
          cy,
        )
        .fill({ color: 0x546e7a, alpha: 0.8 });
    }
  }

  /**
   * A sand ripple is the terrain curve translated straight down, so each one
   * is stroked once here and the swell is animated by moving its layer in y
   * rather than by re-tracing twenty bezier segments per ripple per frame.
   */
  private drawSandRipples(): void {
    for (let r = 0; r < SAND_RIPPLE_COUNT; r++) {
      const g = this.rippleGfx[r];
      g.clear();
      this.traceSurface(g, 9 + r * 11);
      g.stroke({ color: 0xc8b88a, alpha: 0.22 - r * 0.03, width: 1.6 });
    }
  }

  /** Scattered pebbles resting on the sea floor. */
  private drawPebbles(): void {
    const g = this.pebbleGfx;
    g.clear();
    for (let i = 0; i < 40; i++) {
      const pnx = ((i * 137.508) % 100) / 100;
      const ty = this.getTerrainY(pnx);
      const px = pnx * this.w;
      const py = ty + 4 + ((i * 11.3) % 1) * 28;
      const pr = 1.5 + ((i * 7.71) % 1) * 4.5;
      g.ellipse(px, py, pr, pr * 0.58).fill({ color: 0xb8a88a, alpha: 0.5 });
    }
  }

  /** The parts of the sea floor that genuinely move every frame. */
  private drawSandFx(): void {
    const g = this.sandFxGfx;
    g.clear();
    if (this.w === 0 || this.terrainPts.length === 0) return;
    const W = this.w;

    // ── Algae fringe on top of the rock formations ────────────────────
    for (const rock of this.terrainRocks) {
      const rx = rock.nx * W;
      const ry = this.getTerrainY(rock.nx);
      const rw = rock.width * W;

      for (let a = 0; a < 5; a++) {
        const ax = rx - rw * 0.3 + a * rw * 0.15;
        const ay = ry - 55 + Math.sin(a * 1.7) * 8;
        const sw = Math.sin(this.time * 0.8 + a * 1.2) * 4;
        g.moveTo(ax, ay)
          .bezierCurveTo(
            ax + sw,
            ay - 12,
            ax + sw + 1,
            ay - 20,
            ax + sw,
            ay - 26,
          )
          .stroke({ color: 0x27ae60, alpha: 0.75, width: 1.8, cap: "round" });
      }
    }

    // ── Cave stalactites + inner glow ─────────────────────────────────
    for (const cave of this.terrainCaves) {
      const cx = cave.nx * W;
      const cy = this.getTerrainY(cave.nx);
      const cw = cave.width * W;

      // Stalactites hanging from overhang
      for (let s = 0; s < 5; s++) {
        const sx = cx - cw * 0.38 + (s / 4) * cw * 0.76;
        const sh = 10 + Math.sin(s * 2.1 + cave.nx * 10) * 6;
        const tw = Math.sin(this.time * 0.6 + s * 0.9) * 1.5;
        g.moveTo(sx - 3.5, cy - 10)
          .lineTo(sx + tw, cy - 10 + sh)
          .lineTo(sx + 3.5, cy - 10)
          .closePath()
          .fill({ color: 0x78909c, alpha: 0.75 });
      }

      // Subtle glow from inside cave — stays on this layer so it keeps
      // covering the stalactites, exactly as it did in the single-layer draw
      g.ellipse(cx, cy + 16, cw * 0.28, 20).fill({
        color: 0x1a3a5c,
        alpha: 0.35,
      });
    }

    // ── Sand ripples along surface ────────────────────────────────────
    for (let r = 0; r < SAND_RIPPLE_COUNT; r++) {
      this.rippleGfx[r].y = Math.sin(this.time * 0.38 + r * 1.3) * 3;
    }
  }

  // ── Plants ─────────────────────────────────────────────────────────────────

  private spawnPlants(): void {
    const add = (
      type: PlantType,
      nx: number,
      height: number,
      color: number,
      color2: number,
      scale = 1,
    ) => {
      this.plants.push({
        type,
        nx,
        phase: rnd(0, Math.PI * 2),
        speed: rnd(0.55, 1.4),
        height,
        color,
        color2,
        scale,
      });
    };
    // Kelp — tall, back-of-tank feel
    add(PlantType.KELP, 0.06, 280, 0x8b7355, 0x4a7c3f);
    add(PlantType.KELP, 0.13, 190, 0x7a6840, 0x3d6b34);
    add(PlantType.KELP, 0.18, 220, 0x7a6840, 0x3d6b34);
    add(PlantType.KELP, 0.32, 260, 0x9c7f50, 0x527a3a);
    add(PlantType.KELP, 0.5, 210, 0x8b7355, 0x4a7c3f);
    add(PlantType.KELP, 0.72, 300, 0x9c7f50, 0x527a3a);
    add(PlantType.KELP, 0.82, 180, 0x7a6840, 0x3d6b34);
    add(PlantType.KELP, 0.88, 240, 0x8b7355, 0x4a7c3f);
    add(PlantType.KELP, 0.95, 200, 0x9c7f50, 0x4a7c3f);

    // Sea fans — branching gorgonians
    add(PlantType.SEA_FAN, 0.1, 130, 0xff6b9d, 0xff6b9d);
    add(PlantType.SEA_FAN, 0.22, 150, TEAL, TEAL);
    add(PlantType.SEA_FAN, 0.28, 160, CORAL1, CORAL1);
    add(PlantType.SEA_FAN, 0.4, 120, 0xff9f43, 0xff9f43);
    add(PlantType.SEA_FAN, 0.55, 140, 0xff9f43, 0xff9f43);
    add(PlantType.SEA_FAN, 0.63, 155, BLUE, BLUE);
    add(PlantType.SEA_FAN, 0.8, 170, MAUVE, MAUVE);
    add(PlantType.SEA_FAN, 0.9, 135, CORAL1, CORAL1);

    // Anemones
    add(PlantType.ANEMONE, 0.04, 75, TEAL, 0xd0fff8);
    add(PlantType.ANEMONE, 0.12, 90, 0xff6b6b, WHITE);
    add(PlantType.ANEMONE, 0.26, 85, 0x4db6ac, WHITE);
    add(PlantType.ANEMONE, 0.38, 80, YELLOW, WHITE);
    add(PlantType.ANEMONE, 0.42, 80, MAUVE, 0xffffff);
    add(PlantType.ANEMONE, 0.58, 88, 0xff6b6b, YELLOW);
    add(PlantType.ANEMONE, 0.65, 95, 0xff9f43, YELLOW);
    add(PlantType.ANEMONE, 0.75, 78, BLUE, WHITE);
    add(PlantType.ANEMONE, 0.87, 92, MAUVE, 0xffd0f0);
    add(PlantType.ANEMONE, 0.97, 70, TEAL, WHITE);

    // Bubble algae
    add(PlantType.BUBBLE_ALGAE, 0.16, 95, 0x52b788, 0x74c69d);
    add(PlantType.BUBBLE_ALGAE, 0.35, 110, 0x52b788, 0x74c69d);
    add(PlantType.BUBBLE_ALGAE, 0.47, 80, 0x40916c, 0x52b788);
    add(PlantType.BUBBLE_ALGAE, 0.6, 90, 0x40916c, 0x52b788);
    add(PlantType.BUBBLE_ALGAE, 0.78, 105, 0x52b788, 0x95d5b2);
    add(PlantType.BUBBLE_ALGAE, 0.92, 100, 0x52b788, 0x74c69d);

    // Sea grass — dense patches
    add(PlantType.SEA_GRASS, 0.03, 50, 0x52b788, 0x2d6a4f);
    add(PlantType.SEA_GRASS, 0.22, 55, 0x52b788, 0x2d6a4f);
    add(PlantType.SEA_GRASS, 0.3, 45, 0x74c69d, 0x40916c);
    add(PlantType.SEA_GRASS, 0.48, 48, 0x40916c, 0x2d6a4f);
    add(PlantType.SEA_GRASS, 0.57, 52, 0x52b788, 0x2d6a4f);
    add(PlantType.SEA_GRASS, 0.68, 60, 0x74c69d, 0x40916c);
    add(PlantType.SEA_GRASS, 0.77, 46, 0x40916c, 0x2d6a4f);
    add(PlantType.SEA_GRASS, 0.84, 50, 0x52b788, 0x2d6a4f);
    add(PlantType.SEA_GRASS, 0.96, 45, 0x40916c, 0x2d6a4f);

    // Ferns
    add(PlantType.FERN, 0.08, 150, 0x74c69d, 0x52b788);
    add(PlantType.FERN, 0.24, 120, 0x52b788, 0x2d6a4f);
    add(PlantType.FERN, 0.37, 140, 0x95d5b2, 0x74c69d);
    add(PlantType.FERN, 0.44, 130, 0x52b788, 0x2d6a4f);
    add(PlantType.FERN, 0.62, 155, 0x74c69d, 0x52b788);
    add(PlantType.FERN, 0.76, 160, 0x95d5b2, 0x74c69d);
    add(PlantType.FERN, 0.93, 135, 0x52b788, 0x2d6a4f);
  }

  private drawPlants(dt: number): void {
    this.plantsGfx.clear();
    if (this.w === 0) return;
    const hScale = this.h / 1080;

    for (const p of this.plants) {
      p.phase += p.speed * dt;
      const wx = p.nx * this.w;
      const wy = this.getTerrainY(p.nx);

      switch (p.type) {
        case PlantType.KELP:
          drawKelp(this.plantsGfx, wx, wy, p.phase, p.height * hScale);
          break;
        case PlantType.SEA_FAN:
          drawSeaFan(
            this.plantsGfx,
            wx,
            wy,
            p.phase,
            p.height * hScale,
            p.color,
          );
          break;
        case PlantType.ANEMONE:
          drawAnemone(
            this.plantsGfx,
            wx,
            wy,
            p.phase,
            14,
            p.height * hScale,
            p.color,
            p.color2,
          );
          break;
        case PlantType.BUBBLE_ALGAE:
          drawBubbleAlgae(this.plantsGfx, wx, wy, p.phase, p.height * hScale);
          break;
        case PlantType.SEA_GRASS:
          drawSeaGrass(this.plantsGfx, wx, wy, p.phase, 9, p.height * hScale);
          break;
        case PlantType.FERN:
          drawFern(this.plantsGfx, wx, wy, p.phase, p.height * hScale, p.color);
          break;
      }
    }
  }

  // ── Bottom decorations ─────────────────────────────────────────────────────

  private spawnDecos(): void {
    const add = (
      type: DecoType,
      nx: number,
      ny: number,
      color: number,
      scale: number,
      phase = 0,
    ) => {
      this.decos.push({
        type,
        nx,
        ny,
        x: 0,
        color,
        scale,
        phase,
        openSpeed: rnd(0.3, 0.7),
      });
    };
    // Rocks — various shapes
    add(DecoType.ROCK, 0.05, 0.865, 0x546e7a, 1.1, 0);
    add(DecoType.ROCK, 0.15, 0.875, 0x607d8b, 0.8, 1);
    add(DecoType.ROCK, 0.38, 0.87, 0x455a64, 1.3, 2);
    add(DecoType.ROCK, 0.52, 0.88, 0x546e7a, 0.9, 3);
    add(DecoType.ROCK, 0.7, 0.865, 0x78909c, 1.2, 0);
    add(DecoType.ROCK, 0.85, 0.875, 0x607d8b, 1.0, 1);

    // Starfish
    add(DecoType.STARFISH, 0.1, 0.87, 0xe74c3c, 1.0);
    add(DecoType.STARFISH, 0.3, 0.875, 0xe67e22, 1.1);
    add(DecoType.STARFISH, 0.62, 0.872, 0x9b59b6, 0.9);
    add(DecoType.STARFISH, 0.9, 0.868, 0xf39c12, 1.2);

    // Sea urchins
    add(DecoType.SEA_URCHIN, 0.2, 0.874, 0x2c3e50, 1.0);
    add(DecoType.SEA_URCHIN, 0.46, 0.872, 0x6c3483, 1.1);
    add(DecoType.SEA_URCHIN, 0.78, 0.87, 0x1a252f, 0.9);

    // Shells
    add(DecoType.SHELL, 0.08, 0.872, 0xd5d8dc, 1.0);
    add(DecoType.SHELL, 0.25, 0.876, 0xfdebd0, 0.9);
    add(DecoType.SHELL, 0.56, 0.874, 0xaed6f1, 1.1);
    add(DecoType.SHELL, 0.94, 0.873, 0xd5d8dc, 1.0);

    // Anchor (half-buried)
    add(DecoType.ANCHOR, 0.32, 0.87, 0x546e7a, 1.0);

    // Treasure chest (slowly opening)
    add(DecoType.TREASURE_CHEST, 0.66, 0.87, WOOD_PLACEHOLDER, 1.1);
  }

  private drawDecos(): void {
    this.decoGfx.clear();
    if (this.w === 0) return;
    const t = this.time;

    for (const d of this.decos) {
      const wx = d.nx * this.w;
      const wy = this.getTerrainY(d.nx);
      d.x = wx;

      switch (d.type) {
        case DecoType.ROCK:
          drawRock(this.decoGfx, wx, wy, d, t);
          break;
        case DecoType.STARFISH:
          drawStarfish(this.decoGfx, wx, wy, t * d.openSpeed, d.color);
          break;
        case DecoType.SEA_URCHIN:
          drawSeaUrchin(this.decoGfx, wx, wy, t, d.color);
          break;
        case DecoType.SHELL:
          drawShell(this.decoGfx, wx, wy, d.color);
          break;
        case DecoType.ANCHOR:
          drawAnchor(this.decoGfx, wx, wy, t);
          break;
        case DecoType.TREASURE_CHEST: {
          const openAmt = 0.55 + 0.45 * Math.sin(t * d.openSpeed);
          drawTreasureChest(this.decoGfx, wx, wy, openAmt);
          break;
        }
      }
    }
  }

  // ── Plankton ───────────────────────────────────────────────────────────────

  // ── Crabs ──────────────────────────────────────────────────────────────────

  private spawnCrabs(): void {
    for (let i = 0; i < 8; i++) {
      this.crabs.push({
        nx: rnd(0.05, 0.95),
        dir: Math.random() > 0.5 ? 1 : -1,
        speed: rnd(18, 45),
        phase: rnd(0, Math.PI * 2),
        phaseSpeed: rnd(2.5, 4.5),
        pauseTimer: rnd(0, 2),
        scale: rnd(0.55, 0.85),
        colors: pick(CRAB_PALETTES),
      });
    }
  }

  private updateCrabs(dt: number): void {
    this.crabGfx.clear();
    if (this.w === 0) return;

    for (const crab of this.crabs) {
      if (crab.pauseTimer > 0) {
        crab.pauseTimer -= dt;
        crab.phase += crab.phaseSpeed * 0.25 * dt; // idle claw animation
      } else {
        crab.phase += crab.phaseSpeed * dt;
        crab.nx += (crab.dir * crab.speed * dt) / this.w;

        if (crab.nx < 0.02) {
          crab.nx = 0.02;
          crab.dir = 1;
        }
        if (crab.nx > 0.98) {
          crab.nx = 0.98;
          crab.dir = -1;
        }

        if (Math.random() < 0.004) {
          crab.pauseTimer = rnd(0.4, 2.2);
          if (Math.random() < 0.3) crab.dir = (crab.dir * -1) as 1 | -1;
        }
      }

      const wx = crab.nx * this.w;
      const wy = this.getTerrainY(crab.nx);
      drawCrab(
        this.crabGfx,
        wx,
        wy,
        crab.phase,
        crab.dir === 1,
        crab.scale,
        crab.colors,
      );
    }
  }

  private spawnPlankton(): void {
    const palette: Array<{ color: number; glow: number }> = [
      { color: 0x4ad8e8, glow: 0x00ffff },
      { color: 0x80e840, glow: 0x88ff00 },
      { color: 0xf0e070, glow: 0xffff88 },
      { color: 0xf078d8, glow: 0xff88ff },
      { color: 0x60a8f8, glow: 0x44aaff },
      { color: 0xf8a060, glow: 0xffcc44 },
    ];
    const baseW = this.w > 0 ? this.w : 1920;
    const baseH = this.h > 0 ? this.h : 1080;

    for (let s = 0; s < PLANKTON_SWARM_COUNT; s++) {
      const pal = palette[s % palette.length];
      const cx = rnd(0.1, 0.9) * baseW;
      const cy = rnd(0.1, 0.78) * baseH;
      const members: PlanktonMember[] = [];
      for (let i = 0; i < PLANKTON_PER_SWARM; i++) {
        members.push({
          x: cx + rnd(-200, 200),
          y: cy + rnd(-120, 120),
          vx: rnd(-4, 4),
          vy: rnd(-3, 3),
          phase: rnd(0, Math.PI * 2),
          phaseSpeed: rnd(1.2, 3.0),
          r: rnd(1.2, 3.2),
          shape: (i % 3) as 0 | 1 | 2,
        });
      }
      this.planktonSwarms.push({
        cx,
        cy,
        vcx: rnd(-10, 10),
        vcy: rnd(-5, 5),
        color: pal.color,
        glowColor: pal.glow,
        members,
      });
    }
  }

  private drawPlankton(dt: number): void {
    this.planktonGfx.clear();
    if (this.w === 0) return;
    const floorY = this.h * 0.84;

    for (const sw of this.planktonSwarms) {
      // Drift swarm center with gentle random steering
      sw.vcx += rnd(-0.8, 0.8) * dt;
      sw.vcy += rnd(-0.5, 0.5) * dt;
      sw.vcx = Math.max(-14, Math.min(14, sw.vcx));
      sw.vcy = Math.max(-7, Math.min(7, sw.vcy));
      sw.cx += sw.vcx * dt;
      sw.cy += sw.vcy * dt;
      if (sw.cx < -60) sw.cx = this.w + 60;
      if (sw.cx > this.w + 60) sw.cx = -60;
      if (sw.cy < this.h * 0.05) {
        sw.cy = this.h * 0.05;
        sw.vcy = Math.abs(sw.vcy);
      }
      if (sw.cy > this.h * 0.78) {
        sw.cy = this.h * 0.78;
        sw.vcy = -Math.abs(sw.vcy);
      }

      for (const m of sw.members) {
        m.phase += m.phaseSpeed * dt;

        // Weak cohesion + gentle random walk — keep members spread out
        m.vx += (sw.cx - m.x) * 0.12 * dt + rnd(-4, 4) * dt;
        m.vy += (sw.cy - m.y) * 0.12 * dt + rnd(-3, 3) * dt;
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        if (spd > 10) {
          m.vx = (m.vx / spd) * 10;
          m.vy = (m.vy / spd) * 10;
        }

        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y > floorY) {
          m.y = floorY;
          m.vy = -Math.abs(m.vy);
        }

        const blink = 0.45 + 0.55 * Math.sin(m.phase);
        const ga = blink * 0.18;
        const ba = blink * 0.72;

        // Outer glow
        this.planktonGfx
          .circle(m.x, m.y, m.r * 4)
          .fill({ color: sw.glowColor, alpha: ga });

        if (m.shape === 0) {
          // Copepod — oval body + two antennae
          this.planktonGfx
            .ellipse(m.x, m.y, m.r * 1.6, m.r)
            .fill({ color: sw.color, alpha: ba });
          const aLen = m.r * 3.5;
          const as = Math.sin(m.phase * 1.4) * 0.4;
          this.planktonGfx
            .moveTo(m.x - m.r, m.y)
            .lineTo(m.x - m.r - aLen * Math.cos(as), m.y - aLen * Math.sin(as))
            .stroke({ color: sw.color, alpha: ba * 0.6, width: 0.6 });
          this.planktonGfx
            .moveTo(m.x - m.r, m.y)
            .lineTo(
              m.x - m.r - aLen * Math.cos(-as),
              m.y - aLen * Math.sin(-as),
            )
            .stroke({ color: sw.color, alpha: ba * 0.6, width: 0.6 });
        } else if (m.shape === 1) {
          // Radiolarian — circle + radiating spines
          this.planktonGfx
            .circle(m.x, m.y, m.r)
            .fill({ color: sw.color, alpha: ba });
          const SPINES = 8;
          for (let sp = 0; sp < SPINES; sp++) {
            const sa = (sp / SPINES) * Math.PI * 2 + m.phase * 0.15;
            const sLen = m.r * (2.8 + 0.7 * Math.sin(m.phase + sp));
            this.planktonGfx
              .moveTo(m.x + Math.cos(sa) * m.r, m.y + Math.sin(sa) * m.r)
              .lineTo(m.x + Math.cos(sa) * sLen, m.y + Math.sin(sa) * sLen)
              .stroke({ color: sw.color, alpha: ba * 0.55, width: 0.5 });
          }
        } else {
          // Dinoflagellate — teardrop body + curling flagellum
          const angle = Math.atan2(m.vy, m.vx);
          this.planktonGfx
            .moveTo(
              m.x + Math.cos(angle) * m.r * 2,
              m.y + Math.sin(angle) * m.r * 2,
            )
            .bezierCurveTo(
              m.x + Math.cos(angle + 1.1) * m.r * 1.8,
              m.y + Math.sin(angle + 1.1) * m.r * 1.8,
              m.x + Math.cos(angle + 2.2) * m.r * 1.5,
              m.y + Math.sin(angle + 2.2) * m.r * 1.5,
              m.x,
              m.y,
            )
            .fill({ color: sw.color, alpha: ba });
          // Flagellum whip
          const fw = Math.sin(m.phase * 2) * m.r * 2;
          this.planktonGfx
            .moveTo(m.x, m.y)
            .bezierCurveTo(
              m.x - Math.cos(angle) * m.r * 2 + fw,
              m.y - Math.sin(angle) * m.r * 2,
              m.x - Math.cos(angle) * m.r * 4,
              m.y - Math.sin(angle) * m.r * 4 + fw,
              m.x - Math.cos(angle) * m.r * 5.5,
              m.y - Math.sin(angle) * m.r * 5.5,
            )
            .stroke({ color: sw.color, alpha: ba * 0.5, width: 0.6 });
        }
      }
    }
  }

  // ── Particles ──────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x: rnd(0, 1920),
        y: rnd(0, 1080),
        vx: rnd(-8, 8),
        vy: rnd(-4, -1),
        alpha: rnd(0.08, 0.32),
        color: pick([WHITE, TEAL, SKY, FOAM, CAUSTIC]),
        r: rnd(0.5, 2.5),
        life: rnd(0, 1),
      });
    }
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    if (this.w === 0) return;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt * 0.08;
      if (p.y < -10 || p.life > 1) {
        p.x = rnd(0, this.w);
        p.y = this.h + 10;
        p.life = 0;
      }
      if (p.x < -10) p.x = this.w + 10;
      if (p.x > this.w + 10) p.x = -10;
      this.particleGfx
        .circle(p.x, p.y, p.r)
        .fill({ color: p.color, alpha: p.alpha });
      this.particleGfx
        .circle(p.x, p.y, p.r * 3.2)
        .fill({ color: p.color, alpha: p.alpha * 0.14 });
    }
  }

  // ── Fish agents ─────────────────────────────────────────────────────────────

  private spawnAgent(
    type: FishType,
    palette: FishColors[],
    scale: number,
    speed: number,
    wobbleAmp: number,
    tailSpeed: number,
    yMin: number,
    yMax: number,
    schoolX?: number,
    schoolY?: number,
  ): void {
    const colors = pick(palette);
    const agent = new FishAgent(type, colors, scale);
    const goRight = Math.random() > 0.5;
    const baseW = this.w > 0 ? this.w : 1920;
    const baseH = this.h > 0 ? this.h : 1080;

    agent.x = schoolX !== undefined ? schoolX + rnd(-70, 70) : rnd(0, baseW);
    agent.y =
      schoolY !== undefined ? schoolY + rnd(-35, 35) : rnd(yMin, yMax) * baseH;
    agent.vx = speed * (goRight ? 1 : -1);
    agent.vy = rnd(-6, 6);
    agent.maxSpeed = speed;
    agent.facingRight = goRight;
    agent.wobbleSpeed = rnd(0.6, 1.4);
    agent.wobbleAmp = wobbleAmp;
    agent.tailSpeed = tailSpeed * rnd(0.85, 1.2);
    agent.leanPhase = rnd(0, Math.PI * 2);

    this.fishCont.addChild(agent);
    this.agents.push(agent);
  }

  private spawnAgents(): void {
    // Sardines — school
    for (let i = 0; i < 16; i++)
      this.spawnAgent(
        FishType.SARDINE,
        SARDINE_PALETTES,
        rnd(0.55, 0.85),
        rnd(55, 100),
        12,
        4.5,
        0.08,
        0.78,
      );
    // Tropical
    for (let i = 0; i < 8; i++)
      this.spawnAgent(
        FishType.TROPICAL,
        TROPICAL_PALETTES,
        rnd(0.8, 1.2),
        rnd(30, 65),
        18,
        3.8,
        0.1,
        0.8,
      );
    // Angel
    for (let i = 0; i < 5; i++)
      this.spawnAgent(
        FishType.ANGEL,
        ANGEL_PALETTES,
        rnd(0.7, 1.1),
        rnd(18, 40),
        10,
        2.5,
        0.12,
        0.76,
      );
    // Puffer
    for (let i = 0; i < 4; i++)
      this.spawnAgent(
        FishType.PUFFER,
        PUFFER_PALETTES,
        rnd(0.65, 0.95),
        rnd(12, 28),
        16,
        2.0,
        0.3,
        0.8,
      );
    // Sharks
    for (let i = 0; i < 3; i++)
      this.spawnAgent(
        FishType.SHARK,
        SHARK_PALETTES,
        rnd(1.1, 1.8),
        rnd(60, 110),
        8,
        3.2,
        0.15,
        0.7,
      );
    // Manta
    for (let i = 0; i < 2; i++)
      this.spawnAgent(
        FishType.MANTA,
        MANTA_PALETTES,
        rnd(0.9, 1.4),
        rnd(20, 40),
        6,
        1.5,
        0.2,
        0.72,
      );
    // Submarines
    for (let i = 0; i < 2; i++)
      this.spawnAgent(
        FishType.SUBMARINE,
        SUB_PALETTES,
        rnd(1.0, 1.4),
        rnd(25, 45),
        4,
        0.0,
        0.35,
        0.75,
      );

    // PIRANHAS — spawn in two schools for menacing effect
    const s1x = rnd(0.1, 0.4) * (this.w > 0 ? this.w : 1920);
    const s1y = rnd(0.3, 0.6) * (this.h > 0 ? this.h : 1080);
    for (let i = 0; i < 7; i++)
      this.spawnAgent(
        FishType.PIRANHA,
        PIRANHA_PALETTES,
        rnd(0.75, 1.05),
        rnd(38, 70),
        14,
        4.0,
        0.2,
        0.75,
        s1x,
        s1y,
      );

    const s2x = rnd(0.55, 0.9) * (this.w > 0 ? this.w : 1920);
    const s2y = rnd(0.35, 0.65) * (this.h > 0 ? this.h : 1080);
    for (let i = 0; i < 5; i++)
      this.spawnAgent(
        FishType.PIRANHA,
        PIRANHA_PALETTES,
        rnd(0.7, 1.0),
        rnd(35, 68),
        14,
        4.0,
        0.2,
        0.75,
        s2x,
        s2y,
      );

    // HAMMERHEADS — large, deep patrol
    for (let i = 0; i < 2; i++)
      this.spawnAgent(
        FishType.HAMMERHEAD,
        HAMMERHEAD_PALETTES,
        rnd(1.2, 1.7),
        rnd(45, 80),
        8,
        2.8,
        0.18,
        0.68,
      );

    // JELLYFISH — slow drifters spread through full water column
    for (let i = 0; i < 18; i++)
      this.spawnAgent(
        FishType.JELLYFISH,
        JELLYFISH_PALETTES,
        rnd(0.6, 1.2),
        rnd(6, 24),
        6,
        2.0,
        0.05,
        0.82,
      );

    // SEA SNAKES — sinuous mid-water hunters
    for (let i = 0; i < 4; i++)
      this.spawnAgent(
        FishType.SEA_SNAKE,
        SEA_SNAKE_PALETTES,
        rnd(0.7, 1.0),
        rnd(28, 55),
        10,
        3.5,
        0.3,
        0.8,
      );

    // CROCODILES — slow armoured bottom-dwellers
    for (let i = 0; i < 3; i++)
      this.spawnAgent(
        FishType.CROCODILE,
        CROCODILE_PALETTES,
        rnd(0.65, 0.95),
        rnd(12, 22),
        3,
        1.8,
        0.65,
        0.8,
      );

    // SHRIMPS — small, skittery, near floor
    for (let i = 0; i < 12; i++)
      this.spawnAgent(
        FishType.SHRIMP,
        SHRIMP_PALETTES,
        rnd(0.45, 0.7),
        rnd(18, 40),
        3,
        4.5,
        0.68,
        0.82,
      );
  }

  private updateAgents(dt: number): void {
    if (this.w === 0) return;
    const floor = this.h * 0.82;

    for (const a of this.agents) {
      a.wobblePhase += a.wobbleSpeed * dt;
      a.tailPhase += a.tailSpeed * dt;
      a.leanPhase += 0.8 * dt;
      a.propPhase += 4.0 * dt;

      a.x += a.vx * dt;
      a.y += a.vy * dt + Math.sin(a.wobblePhase) * a.wobbleAmp * dt;

      const margin = 130;
      if (a.x > this.w + margin) a.x = -margin;
      if (a.x < -margin) a.x = this.w + margin;

      const yMin =
        this.h *
        (a.fishType === FishType.SHARK || a.fishType === FishType.HAMMERHEAD
          ? 0.12
          : 0.06);
      if (a.y > floor) {
        a.y = floor;
        a.vy = -Math.abs(a.vy) - rnd(5, 18);
      }
      if (a.y < yMin) {
        a.vy = Math.abs(a.vy) + rnd(2, 8);
      }

      // clamp to per-fish speed cap so velocity doesn't grow unboundedly
      const vyMax = a.maxSpeed * 0.6;
      if (a.vy > vyMax) a.vy = vyMax;
      if (a.vy < -vyMax) a.vy = -vyMax;
      const vxMax = a.maxSpeed * 1.3;
      if (a.vx > vxMax) a.vx = vxMax;
      if (a.vx < -vxMax) a.vx = -vxMax;

      if (a.vx > 0.5) a.facingRight = true;
      if (a.vx < -0.5) a.facingRight = false;

      a.redraw();
    }
  }

  // ── Bubbles ────────────────────────────────────────────────────────────────

  private spawnBubbles(): void {
    for (let i = 0; i < BUBBLE_COUNT; i++)
      this.bubbles.push(this.makeBubble(true));
  }

  private makeBubble(scatter = false): Bubble {
    return {
      x: rnd(0, this.w > 0 ? this.w : 1920),
      y: scatter ? rnd(0, this.h > 0 ? this.h : 1080) : this.h + rnd(0, 60),
      vy: rnd(18, 55),
      r: rnd(2, 12),
      alpha: rnd(0.12, 0.42),
      alphaPhase: rnd(0, Math.PI * 2),
      wobblePhase: rnd(0, Math.PI * 2),
      wobbleAmp: rnd(4, 14),
    };
  }

  private drawBubbles(dt: number): void {
    this.bubbleGfx.clear();
    if (this.w === 0) return;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.y -= b.vy * dt;
      b.wobblePhase += 2.0 * dt;
      b.alphaPhase += 1.1 * dt;
      if (b.y < -20) {
        this.bubbles[i] = this.makeBubble();
        continue;
      }
      const bx = b.x + Math.sin(b.wobblePhase) * b.wobbleAmp;
      const a = b.alpha * (0.6 + 0.4 * Math.sin(b.alphaPhase));
      this.bubbleGfx
        .circle(bx, b.y, b.r * 0.55)
        .fill({ color: WHITE, alpha: a * 0.45 });
      this.bubbleGfx
        .circle(bx, b.y, b.r)
        .stroke({ color: FOAM, alpha: a, width: 1.0 });
      this.bubbleGfx
        .circle(bx, b.y, b.r * 1.8)
        .fill({ color: CAUSTIC, alpha: a * 0.06 });
    }
  }

  // ── Surface shimmer ────────────────────────────────────────────────────────

  private drawSurface(): void {
    this.surfaceGfx.clear();
    if (this.w === 0) return;
    const t = this.time;
    this.surfaceGfx.moveTo(0, 6);
    for (let i = 1; i <= 40; i++) {
      const sx = (i / 40) * this.w;
      const sy =
        6 + Math.sin(t * 1.2 + i * 0.6) * 4 + Math.sin(t * 0.7 + i * 1.1) * 2.5;
      this.surfaceGfx.lineTo(sx, sy);
    }
    this.surfaceGfx.stroke({ color: FOAM, alpha: 0.35, width: 2 });
    this.surfaceGfx
      .rect(0, 0, this.w, 28)
      .fill({ color: CAUSTIC, alpha: 0.055 + 0.03 * Math.sin(t * 0.9) });
  }
}

// placeholder kept to avoid undefined reference in DecoDef colour literal
const WOOD_PLACEHOLDER = 0x8b5e3c;
