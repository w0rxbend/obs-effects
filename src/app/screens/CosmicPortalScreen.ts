import type { Ticker } from "pixi.js";
import {
  BufferImageSource,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Sprite,
  Texture,
} from "pixi.js";
import { TAU, randRange as rand } from "../../lib/math";

const WEBCAM_R = 220;
const WR2 = WEBCAM_R * WEBCAM_R;

// Catppuccin Mocha
const MAUVE = 0xcba6f7;
const PINK = 0xf38ba8;
const PEACH = 0xfab387;
const YELLOW = 0xf9e2af;
const LAVENDER = 0xb4befe;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const TEAL = 0x94e2d5;
const GREEN = 0xa6e3a1;
const FLAMINGO = 0xf2cdcd;
const SURFACE0 = 0x313244;
const BASE = 0x1e1e2e;
const CRUST = 0x11111b;

// ─── Shared drawing scratch ──────────────────────────────────────────────────

/**
 * A single fill style reused by every dot the particle layers draw.
 *
 * Pixi copies the style object into its own draw instruction, so handing it the
 * same mutated object every time is safe and keeps a few thousand throwaway
 * `{ color, alpha }` literals per frame off the heap.
 */
const DOT_FILL = { color: 0, alpha: 1 };

function dot(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha: number,
): void {
  DOT_FILL.color = color;
  DOT_FILL.alpha = alpha;
  g.circle(x, y, r).fill(DOT_FILL);
}

/**
 * Fixed-capacity ring buffer holding the last `cap` positions of one particle.
 *
 * Trails used to be `[number, number][]` arrays grown with `push` and trimmed
 * with `shift`, which allocated a two-element array per particle per frame and
 * re-indexed the whole array on every trim. The points now live in one
 * Float64Array that is written in place; walking it from `trailStart` yields
 * exactly the same oldest-to-newest order the draw loops relied on.
 */
interface Trail {
  readonly pts: Float64Array;
  readonly cap: number;
  /** Slot the next point is written into. */
  head: number;
  /** How many slots currently hold a point (never more than `cap`). */
  len: number;
}

function makeTrail(cap: number): Trail {
  return { pts: new Float64Array(cap * 2), cap, head: 0, len: 0 };
}

function pushTrail(tr: Trail, x: number, y: number): void {
  const i = tr.head * 2;
  tr.pts[i] = x;
  tr.pts[i + 1] = y;
  tr.head = tr.head + 1 === tr.cap ? 0 : tr.head + 1;
  if (tr.len < tr.cap) tr.len++;
}

/** Slot holding the oldest point, i.e. where a draw loop starts reading. */
function trailStart(tr: Trail): number {
  return (tr.head - tr.len + tr.cap) % tr.cap;
}

// ─── Layer 1: N-body gravitational stars ─────────────────────────────────────

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: number;
  trail: Trail;
}
const STAR_N = 60;
const STAR_TRAIL = 8;
const STAR_G = 200;
const STAR_COLS = [LAVENDER, BLUE, SAPPHIRE] as const;

// ─── Layer 2: Gray-Scott reaction-diffusion ──────────────────────────────────

const RD_N = 64;
const RD_DU = 0.21;
const RD_DV = 0.105;
const RD_F = 0.055;
const RD_K = 0.062;

// Channels of the two grid colours, pre-split so the pixel writer never has to
// unpack them per cell.
const MAUVE_R = (MAUVE >> 16) & 0xff;
const MAUVE_G = (MAUVE >> 8) & 0xff;
const MAUVE_B = MAUVE & 0xff;
const PINK_R = (PINK >> 16) & 0xff;
const PINK_G = (PINK >> 8) & 0xff;
const PINK_B = PINK & 0xff;

// ─── Layer 3: Clifford strange attractor ─────────────────────────────────────

const CA_PTS = 6000;
const CA_SCL = 155;
const CA_DOT_R = 0.6;
/** Texels of the shared dot texture, and the world-space size of its quad. */
const CA_DOT_TEX = 8;
const CA_DOT_QUAD = 4;
const CA_DOT_SCALE = CA_DOT_QUAD / CA_DOT_TEX;

/**
 * The one white dot every attractor particle samples.
 *
 * The attractor used to emit 6000 `Graphics.circle().fill()` calls per frame;
 * the same 6000 points now live in a ParticleContainer that draws in one go.
 * The canvas is sized so a texel lands on a device pixel at the renderer's 2x
 * resolution, which keeps the dot the same size it was as a circle.
 */
function makeDotTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = CA_DOT_TEX;
  canvas.height = CA_DOT_TEX;
  const ctx = canvas.getContext("2d")!;
  const half = CA_DOT_TEX / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(half, half, CA_DOT_R * (CA_DOT_TEX / CA_DOT_QUAD), 0, TAU);
  ctx.fill();
  return Texture.from(canvas);
}

// ─── Layer 4: Magnetic field line particles ───────────────────────────────────

interface FieldPt {
  x: number;
  y: number;
  trail: Trail;
  color: number;
}
const MF_N = 120;
const MF_TRAIL = 6;
const MF_DIPO_R = 300;
const MF_COLS = [TEAL, GREEN] as const;

// ─── Layer 5: Boids comet swarm ───────────────────────────────────────────────

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Trail;
  color: number;
}
const BD_N = 80;
const BD_TRAIL = 12;
const BD_MAX_V = 85;
const BD_SEP_R = 25;
const BD_ALI_R = 50;
const BD_COH_R = 75;
// Squared radii, shrunk by the 0.001 the neighbour test adds to the distance, so
// the pair loop can compare squared lengths and skip the per-pair sqrt.
const BD_SEP_R2 = (BD_SEP_R - 0.001) ** 2;
const BD_ALI_R2 = (BD_ALI_R - 0.001) ** 2;
const BD_COH_R2 = (BD_COH_R - 0.001) ** 2;
const BD_COLS = [FLAMINGO, SAPPHIRE] as const;

// ─── Layer 6: Wave interference ────────────────────────────────────────────────

interface WaveSrc {
  angle: number;
  orbitSpeed: number;
  phase: number;
}
const WAVE_RINGS = 16;
const WAVE_SEGS = 72;
const WAVE_SRC_R = WEBCAM_R + 22;

// Every ring samples the same 72 angles, so their cos/sin are built once.
const WAVE_COS = new Float64Array(WAVE_SEGS);
const WAVE_SIN = new Float64Array(WAVE_SEGS);
for (let i = 0; i < WAVE_SEGS; i++) {
  const a = (i / WAVE_SEGS) * TAU;
  WAVE_COS[i] = Math.cos(a);
  WAVE_SIN[i] = Math.sin(a);
}

// ─── Layer 7: Accretion disk ───────────────────────────────────────────────────

const DISK_TILT = 18 * (Math.PI / 180);
const DCOS = Math.cos(DISK_TILT);
const DSIN = Math.sin(DISK_TILT);

function diskPt(a: number, b: number, t: number): { x: number; y: number } {
  const rx = a * Math.cos(t),
    ry = b * Math.sin(t);
  return { x: rx * DCOS - ry * DSIN, y: rx * DSIN + ry * DCOS };
}

interface DiskRing {
  a: number;
  b: number;
  color: number;
  alpha: number;
  w: number;
}
const DISK_RINGS: readonly DiskRing[] = [
  {
    a: WEBCAM_R * 1.04,
    b: WEBCAM_R * 0.26,
    color: YELLOW,
    alpha: 0.85,
    w: 2.0,
  },
  {
    a: WEBCAM_R * 1.09,
    b: WEBCAM_R * 0.28,
    color: YELLOW,
    alpha: 0.78,
    w: 3.0,
  },
  { a: WEBCAM_R * 1.15, b: WEBCAM_R * 0.29, color: PEACH, alpha: 0.72, w: 2.5 },
  { a: WEBCAM_R * 1.22, b: WEBCAM_R * 0.31, color: PINK, alpha: 0.63, w: 2.0 },
  { a: WEBCAM_R * 1.3, b: WEBCAM_R * 0.33, color: MAUVE, alpha: 0.52, w: 1.8 },
  {
    a: WEBCAM_R * 1.4,
    b: WEBCAM_R * 0.36,
    color: LAVENDER,
    alpha: 0.4,
    w: 1.5,
  },
  {
    a: WEBCAM_R * 1.52,
    b: WEBCAM_R * 0.39,
    color: SURFACE0,
    alpha: 0.27,
    w: 1.2,
  },
  { a: WEBCAM_R * 1.67, b: WEBCAM_R * 0.43, color: BASE, alpha: 0.14, w: 1.0 },
];

/** Points of the lensing ring — a fixed radius, so the circle is walked once. */
const LENS_SEGS = 128;
const LENS_R = WEBCAM_R + 4;
const LENS_PTS = new Float64Array((LENS_SEGS + 1) * 2);
for (let i = 0; i <= LENS_SEGS; i++) {
  const a = (i / LENS_SEGS) * TAU;
  LENS_PTS[i * 2] = LENS_R * Math.cos(a);
  LENS_PTS[i * 2 + 1] = LENS_R * Math.sin(a);
}

// ─────────────────────────────────────────────────────────────────────────────

export class CosmicPortalScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();

  // z-order: all effect layers → hole (erase) → above-hole layers
  private readonly rdSprite: Sprite;
  private readonly attractParticles: ParticleContainer;
  private readonly starGfx = new Graphics();
  private readonly fieldGfx = new Graphics();
  private readonly boidGfx = new Graphics();
  private readonly waveGfx = new Graphics();
  private readonly diskShadowGfx = new Graphics(); // static shadow gradient
  private readonly diskBgGfx = new Graphics(); // back disk
  private readonly holeGfx = new Graphics(); // erase webcam circle
  private readonly lensingGfx = new Graphics(); // above hole
  private readonly diskFgGfx = new Graphics(); // above hole: front disk

  // RD state
  private rdU = new Float32Array(RD_N * RD_N).fill(1);
  private rdV = new Float32Array(RD_N * RD_N).fill(0);
  private rdU2 = new Float32Array(RD_N * RD_N).fill(1);
  private rdV2 = new Float32Array(RD_N * RD_N).fill(0);

  // The RD grid is uploaded as a 64x64 texture stretched over the canvas instead
  // of being redrawn as up to 4096 Graphics rects every frame. Pixels are stored
  // pre-multiplied, so the upload must not pre-multiply them a second time.
  private readonly rdPixels = new Uint8Array(RD_N * RD_N * 4);
  private readonly rdSource = new BufferImageSource({
    resource: this.rdPixels,
    width: RD_N,
    height: RD_N,
    format: "rgba8unorm",
    alphaMode: "premultiplied-alpha",
    scaleMode: "nearest",
  });
  private readonly rdTexture = new Texture({ source: this.rdSource });
  /** 1 for grid cells that fall inside the webcam hole and are never drawn. */
  private readonly rdMask = new Uint8Array(RD_N * RD_N);

  // Attractor state
  private readonly dotTexture: Texture;
  private readonly caDots: Particle[] = [];

  // Particle state
  private stars: Star[] = [];
  private field: FieldPt[] = [];
  private boids: Boid[] = [];
  private waveSrcs: WaveSrc[] = [];

  // Per-frame scratch, allocated once so the update loop stays allocation-free.
  private readonly starForce = new Float64Array(STAR_N * 2);
  private readonly dipX = new Float64Array(2);
  private readonly dipY = new Float64Array(2);
  private readonly fieldB = new Float64Array(2);
  private readonly waveSrcX = new Float64Array(3);
  private readonly waveSrcY = new Float64Array(3);

  // Clifford attractor
  private caA = -1.4;
  private caB = 1.6;
  private caC = 1.0;
  private caD = 0.7;
  private caX = rand(-1, 1);
  private caY = rand(-1, 1);

  private time = 0;
  private w = 800;
  private h = 800;

  constructor() {
    super();
    this.addChild(this.world);

    this.rdSprite = new Sprite(this.rdTexture);

    this.dotTexture = makeDotTexture();
    this.attractParticles = new ParticleContainer({
      texture: this.dotTexture,
      dynamicProperties: { position: true, vertex: false, color: false },
    });
    for (let i = 0; i < CA_PTS; i++) {
      const p = new Particle({
        texture: this.dotTexture,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: CA_DOT_SCALE,
        scaleY: CA_DOT_SCALE,
        tint: (i & 1) === 0 ? PEACH : YELLOW,
        alpha: 0.04,
      });
      this.attractParticles.addParticle(p);
      this.caDots.push(p);
    }

    // Add all layers in z-order
    for (const g of [
      this.rdSprite,
      this.attractParticles,
      this.starGfx,
      this.fieldGfx,
      this.boidGfx,
      this.waveGfx,
      this.diskShadowGfx,
      this.diskBgGfx,
      this.holeGfx, // punch-through
      this.lensingGfx,
      this.diskFgGfx, // above hole
    ])
      this.world.addChild(g);

    this.holeGfx.blendMode = "erase";
    this.attractParticles.blendMode = "add";
    this.starGfx.blendMode = "add";

    // The hole and the accretion disk never change shape, so they are drawn once
    // instead of being cleared and rebuilt on every frame.
    this.holeGfx.circle(0, 0, WEBCAM_R).fill({ color: 0xffffff, alpha: 1 });
    this._buildDisk();

    this._seedRD();
    this._layoutRD();
    this._initStars();
    this._initField();
    this._initBoids();
    this._initWaves();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private _seedRD(): void {
    // Seed activity in the annular region (outside webcam circle in grid space)
    const cx = RD_N / 2,
      cy = RD_N / 2;
    const inner = WEBCAM_R / (800 / RD_N / 2); // webcam radius in grid cells ≈ 17.6
    for (let j = 0; j < RD_N; j++) {
      for (let i = 0; i < RD_N; i++) {
        const d = Math.sqrt((i - cx) ** 2 + (j - cy) ** 2);
        if (d > inner + 1 && d < inner + 12 && Math.random() < 0.35) {
          const idx = j * RD_N + i;
          this.rdU[idx] = 0.5 + rand(-0.02, 0.02);
          this.rdV[idx] = 0.25 + rand(-0.02, 0.02);
        }
      }
    }
  }

  private _initStars(): void {
    for (let i = 0; i < STAR_N; i++) {
      const a = rand(0, TAU);
      const r = rand(WEBCAM_R + 20, 380);
      this.stars.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: rand(-20, 20),
        vy: rand(-20, 20),
        mass: rand(0.5, 2.5),
        color: STAR_COLS[i % STAR_COLS.length],
        trail: makeTrail(STAR_TRAIL),
      });
    }
  }

  private _initField(): void {
    for (let i = 0; i < MF_N; i++) {
      const a = rand(0, TAU),
        r = rand(WEBCAM_R + 10, 370);
      this.field.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        trail: makeTrail(MF_TRAIL),
        color: MF_COLS[i % MF_COLS.length],
      });
    }
  }

  private _initBoids(): void {
    for (let i = 0; i < BD_N; i++) {
      const a = rand(0, TAU),
        r = rand(WEBCAM_R + 20, 360);
      const va = rand(0, TAU);
      this.boids.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: Math.cos(va) * 40,
        vy: Math.sin(va) * 40,
        trail: makeTrail(BD_TRAIL),
        color: BD_COLS[i % BD_COLS.length],
      });
    }
  }

  private _initWaves(): void {
    for (let i = 0; i < 3; i++) {
      this.waveSrcs.push({
        angle: (i / 3) * TAU,
        orbitSpeed: rand(0.25, 0.55) * (i % 2 === 0 ? 1 : -1),
        phase: rand(0, TAU),
      });
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 800, window.innerHeight || 800);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.world.x = w * 0.5;
    this.world.y = h * 0.5;
    this._layoutRD();
  }

  public override destroy(): void {
    this.rdTexture.destroy(true);
    this.dotTexture.destroy(true);
    super.destroy({ children: true });
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this._updateRD();
    this._updateAttractor();
    this._updateStars(dt);
    this._updateField(dt);
    this._updateBoids(dt);
    this._updateWaves();
    this._updateDisk();
  }

  // ─── Layer 2: Reaction-diffusion ───────────────────────────────────────────

  /**
   * Stretch the RD texture over the canvas and re-mark the cells that the
   * webcam hole covers. Both only change when the canvas does.
   */
  private _layoutRD(): void {
    this.rdSprite.position.set(this.w * -0.5, this.h * -0.5);
    this.rdSprite.width = this.w;
    this.rdSprite.height = this.h;

    const cw = this.w / RD_N,
      ch = this.h / RD_N;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (let j = 0; j < RD_N; j++) {
      for (let i = 0; i < RD_N; i++) {
        const wx = (i + 0.5) * cw - hw;
        const wy = (j + 0.5) * ch - hh;
        // Inside the webcam the hole would erase it anyway, so skip the draw.
        this.rdMask[j * RD_N + i] = wx * wx + wy * wy < WR2 ? 1 : 0;
      }
    }
  }

  private _updateRD(): void {
    const N = RD_N;
    const U = this.rdU,
      V = this.rdV,
      U2 = this.rdU2,
      V2 = this.rdV2;
    const mask = this.rdMask,
      px = this.rdPixels;

    for (let j = 0; j < N; j++) {
      // Row offsets with the wrap resolved by a compare instead of a modulo.
      const jn = j * N;
      const jln = (j === 0 ? N - 1 : j - 1) * N;
      const jrn = (j === N - 1 ? 0 : j + 1) * N;
      for (let i = 0; i < N; i++) {
        const idx = jn + i;
        const u = U[idx],
          v = V[idx],
          uvv = u * v * v;
        const il = i === 0 ? N - 1 : i - 1,
          ir = i === N - 1 ? 0 : i + 1;
        const lapU = U[jn + il] + U[jn + ir] + U[jln + i] + U[jrn + i] - 4 * u;
        const lapV = V[jn + il] + V[jn + ir] + V[jln + i] + V[jrn + i] - 4 * v;
        U2[idx] = Math.max(
          0,
          Math.min(1, u + (RD_DU * lapU - uvv + RD_F * (1 - u)) * 0.5),
        );
        const nv = Math.max(
          0,
          Math.min(1, v + (RD_DV * lapV + uvv - (RD_F + RD_K) * v) * 0.5),
        );
        V2[idx] = nv;

        // Colour the cell straight from the value just solved: that saves a
        // second full pass over the grid as well as one Graphics rect per cell.
        const o = idx * 4;
        if (nv < 0.05 || mask[idx] === 1) {
          px[o] = 0;
          px[o + 1] = 0;
          px[o + 2] = 0;
          px[o + 3] = 0;
          continue;
        }
        const t = Math.min(nv / 0.35, 1);
        const a = ((0.06 + t * 0.2) * 255 + 0.5) | 0;
        const af = a / 255;
        px[o] = ((t > 0.5 ? MAUVE_R : PINK_R) * af + 0.5) | 0;
        px[o + 1] = ((t > 0.5 ? MAUVE_G : PINK_G) * af + 0.5) | 0;
        px[o + 2] = ((t > 0.5 ? MAUVE_B : PINK_B) * af + 0.5) | 0;
        px[o + 3] = a;
      }
    }
    this.rdU = U2;
    this.rdV = V2;
    this.rdU2 = U;
    this.rdV2 = V;

    this.rdSource.update();
  }

  // ─── Layer 3: Clifford attractor ───────────────────────────────────────────

  private _updateAttractor(): void {
    // Slowly morph parameters
    this.caA = -1.4 + 0.28 * Math.sin(this.time * 0.071);
    this.caB = 1.6 + 0.28 * Math.cos(this.time * 0.093);
    this.caC = 1.0 + 0.18 * Math.sin(this.time * 0.107);
    this.caD = 0.7 + 0.18 * Math.cos(this.time * 0.127);

    let x = this.caX,
      y = this.caY;
    const scl = CA_SCL;
    const dots = this.caDots;

    // Colour and size are fixed per dot, so only the positions are re-uploaded.
    for (let i = 0; i < CA_PTS; i++) {
      const nx = Math.sin(this.caA * y) + this.caC * Math.cos(this.caA * x);
      const ny = Math.sin(this.caB * x) + this.caD * Math.cos(this.caB * y);
      x = nx;
      y = ny;
      const p = dots[i];
      p.x = x * scl;
      p.y = y * scl;
    }
    this.caX = x;
    this.caY = y;
  }

  // ─── Layer 1: N-body gravitational stars ───────────────────────────────────

  private _updateStars(dt: number): void {
    const stars = this.stars;
    const N = stars.length;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    // Gravity is symmetric, so each pair is solved once and the force is applied
    // to both bodies — half the distance work of the old all-pairs scan.
    const F = this.starForce;
    F.fill(0);
    for (let i = 0; i < N; i++) {
      const a = stars[i];
      for (let j = i + 1; j < N; j++) {
        const b = stars[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 1;
        const d = Math.sqrt(d2);
        const f = (STAR_G * a.mass * b.mass) / (d2 * d);
        const fx = f * dx,
          fy = f * dy;
        F[i * 2] += fx;
        F[i * 2 + 1] += fy;
        F[j * 2] -= fx;
        F[j * 2 + 1] -= fy;
      }
    }
    for (let i = 0; i < N; i++) {
      const a = stars[i];
      a.vx += (F[i * 2] / a.mass) * dt;
      a.vy += (F[i * 2 + 1] / a.mass) * dt;
    }

    const g = this.starGfx;
    g.clear();

    for (const s of stars) {
      const tr = s.trail;
      pushTrail(tr, s.x, s.y);

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Boundary wrap
      if (s.x < -hw) s.x += this.w;
      else if (s.x > hw) s.x -= this.w;
      if (s.y < -hh) s.y += this.h;
      else if (s.y > hh) s.y -= this.h;

      // Draw trail (hole will erase webcam area)
      let ti = trailStart(tr);
      for (let t = 0; t < tr.len; t++) {
        const alpha = (t / tr.len) * 0.55;
        dot(g, tr.pts[ti * 2], tr.pts[ti * 2 + 1], 0.8, s.color, alpha);
        ti = ti + 1 === tr.cap ? 0 : ti + 1;
      }
      // Star core
      dot(g, s.x, s.y, 1.5 + s.mass * 0.4, s.color, 0.95);
      dot(g, s.x, s.y, 3.0 + s.mass * 0.7, s.color, 0.18);
    }
  }

  // ─── Layer 4: Magnetic field line particles ────────────────────────────────

  /**
   * Field vector at (x, y), left in `fieldB` rather than returned as a fresh
   * tuple — this runs once per field particle per frame. Reads the pole
   * positions cached by `_updateField`.
   */
  private _dipoleField(x: number, y: number): void {
    let bx = 0,
      by = 0;
    for (let d = 0; d < 2; d++) {
      const px = x - this.dipX[d];
      const py = y - this.dipY[d];
      const r2 = px * px + py * py + 1;
      const r = Math.sqrt(r2);
      const s = d === 0 ? 1 : -1;
      bx += s * (-py / (r * r2));
      by += s * (px / (r * r2));
    }
    this.fieldB[0] = bx * 80000;
    this.fieldB[1] = by * 80000;
  }

  private _updateField(dt: number): void {
    const g = this.fieldGfx;
    g.clear();
    const SPEED = 55;

    // Both poles orbit on their own, independently of the particles, so their
    // positions are worked out once instead of once per particle.
    for (let d = 0; d < 2; d++) {
      const a = this.time * 0.3 + d * Math.PI;
      this.dipX[d] = Math.cos(a) * MF_DIPO_R;
      this.dipY[d] = Math.sin(a) * MF_DIPO_R;
    }

    for (const p of this.field) {
      this._dipoleField(p.x, p.y);
      const fx = this.fieldB[0],
        fy = this.fieldB[1];
      const len = Math.sqrt(fx * fx + fy * fy) + 0.0001;
      p.x += (fx / len) * SPEED * dt;
      p.y += (fy / len) * SPEED * dt;

      const tr = p.trail;

      // Reset if escaped
      if (p.x * p.x + p.y * p.y > 390 * 390) {
        const a = rand(0, TAU);
        p.x = Math.cos(a) * rand(WEBCAM_R + 10, 370);
        p.y = Math.sin(a) * rand(WEBCAM_R + 10, 370);
        tr.head = 0;
        tr.len = 0;
        continue;
      }

      pushTrail(tr, p.x, p.y);

      let ti = trailStart(tr);
      for (let t = 0; t < tr.len; t++) {
        const alpha = (t / tr.len) * 0.5;
        dot(g, tr.pts[ti * 2], tr.pts[ti * 2 + 1], 1.0, p.color, alpha);
        ti = ti + 1 === tr.cap ? 0 : ti + 1;
      }
    }
  }

  // ─── Layer 5: Boids comet swarm ────────────────────────────────────────────

  private _updateBoids(dt: number): void {
    const boids = this.boids;
    const N = boids.length;

    for (let i = 0; i < N; i++) {
      const b = boids[i];
      let sx = 0,
        sy = 0,
        ax = 0,
        ay = 0,
        cx = 0,
        cy = 0;
      let ns = 0,
        na = 0,
        nc = 0;

      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const o = boids[j];
        const dx = o.x - b.x,
          dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        // Cohesion has the widest radius, so anything past it misses all three
        // rules and can be dropped before taking a square root.
        if (d2 >= BD_COH_R2) continue;
        if (d2 < BD_SEP_R2) {
          const d = Math.sqrt(d2) + 0.001;
          sx -= dx / d;
          sy -= dy / d;
          ns++;
        }
        if (d2 < BD_ALI_R2) {
          ax += o.vx;
          ay += o.vy;
          na++;
        }
        cx += o.x;
        cy += o.y;
        nc++;
      }

      let fax = 0,
        fay = 0;
      if (ns > 0) {
        fax += (sx / ns) * 2.2;
        fay += (sy / ns) * 2.2;
      }
      if (na > 0) {
        fax += (ax / na - b.vx) * 0.45;
        fay += (ay / na - b.vy) * 0.45;
      }
      if (nc > 0) {
        fax += (cx / nc - b.x) * 0.012;
        fay += (cy / nc - b.y) * 0.012;
      }

      // Repel from webcam circle
      const r2 = b.x * b.x + b.y * b.y;
      const repR = WEBCAM_R + 60;
      if (r2 < repR * repR) {
        const r = Math.sqrt(r2) + 0.001;
        fax -= (b.x / r) * 180;
        fay -= (b.y / r) * 180;
      }
      // Keep on canvas
      if (r2 > 380 * 380) {
        const r = Math.sqrt(r2) + 0.001;
        fax -= (b.x / r) * 60;
        fay -= (b.y / r) * 60;
      }

      b.vx += fax * dt;
      b.vy += fay * dt;
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + 0.001;
      if (spd > BD_MAX_V) {
        b.vx = (b.vx / spd) * BD_MAX_V;
        b.vy = (b.vy / spd) * BD_MAX_V;
      }
      if (spd < 25) {
        b.vx *= 1.06;
        b.vy *= 1.06;
      }

      pushTrail(b.trail, b.x, b.y);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    const g = this.boidGfx;
    g.clear();
    for (const b of boids) {
      const tr = b.trail;
      let ti = trailStart(tr);
      for (let t = 0; t < tr.len; t++) {
        const alpha = (t / tr.len) * 0.6;
        dot(g, tr.pts[ti * 2], tr.pts[ti * 2 + 1], 1.5, b.color, alpha);
        ti = ti + 1 === tr.cap ? 0 : ti + 1;
      }
      dot(g, b.x, b.y, 2.5, b.color, 0.88);
    }
  }

  // ─── Layer 6: Interference wave rings ─────────────────────────────────────

  private _updateWaves(): void {
    for (const src of this.waveSrcs) {
      src.angle += src.orbitSpeed * 0.01;
      src.phase += 0.045;
    }

    const g = this.waveGfx;
    g.clear();

    // The source positions and the time term are the same for all 576 samples,
    // so they are worked out once instead of inside the innermost loop.
    const srcs = this.waveSrcs;
    const nsrc = srcs.length;
    const sxs = this.waveSrcX,
      sys = this.waveSrcY;
    for (let k = 0; k < nsrc; k++) {
      sxs[k] = Math.cos(srcs[k].angle) * WAVE_SRC_R;
      sys[k] = Math.sin(srcs[k].angle) * WAVE_SRC_R;
    }
    const tw = this.time * 2.8;

    for (let ri = 0; ri < WAVE_RINGS; ri++) {
      const ringR = WEBCAM_R + 8 + ri * 23;
      if (ringR > 400) break;

      for (let si = 0; si < WAVE_SEGS; si++) {
        const px = WAVE_COS[si] * ringR;
        const py = WAVE_SIN[si] * ringR;

        let amp = 0;
        for (let k = 0; k < nsrc; k++) {
          const dx = px - sxs[k],
            dy = py - sys[k];
          const d = Math.sqrt(dx * dx + dy * dy);
          amp += Math.sin(d * 0.08 - tw + srcs[k].phase);
        }
        amp /= 3;
        if (Math.abs(amp) < 0.32) continue;

        dot(g, px, py, 1.3, amp > 0 ? LAVENDER : PINK, Math.abs(amp) * 0.16);
      }
    }
  }

  // ─── Layer 7: Accretion disk ───────────────────────────────────────────────

  /** Ring outline as flat x/y pairs; a skipped point is stored as NaN. */
  private _diskBuildPts(
    ring: DiskRing,
    tStart: number,
    tEnd: number,
    skipCam: boolean,
  ): Float64Array {
    const N = 80;
    const camR = (WEBCAM_R - 2) * (WEBCAM_R - 2);
    const pts = new Float64Array((N + 1) * 2);
    for (let i = 0; i <= N; i++) {
      const t = tStart + (i / N) * (tEnd - tStart);
      const pt = diskPt(ring.a, ring.b, t);
      const skip = skipCam && pt.x * pt.x + pt.y * pt.y < camR;
      pts[i * 2] = skip ? NaN : pt.x;
      pts[i * 2 + 1] = skip ? NaN : pt.y;
    }
    return pts;
  }

  private _diskStroke(
    g: Graphics,
    pts: Float64Array,
    color: number,
    width: number,
    alpha: number,
  ): void {
    if (alpha < 0.002) return;
    let started = false;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      if (Number.isNaN(x)) {
        started = false;
        continue;
      }
      const y = pts[i + 1];
      if (!started) {
        g.moveTo(x, y);
        started = true;
      } else g.lineTo(x, y);
    }
    g.stroke({ color, width, alpha });
  }

  private _diskDrawArc(
    g: Graphics,
    ring: DiskRing,
    pts: Float64Array,
    alphaScale: number,
  ): void {
    const a = ring.alpha * alphaScale;
    this._diskStroke(g, pts, ring.color, ring.w * 7, a * 0.05);
    this._diskStroke(g, pts, ring.color, ring.w * 3, a * 0.18);
    this._diskStroke(g, pts, ring.color, ring.w, a);
  }

  /**
   * Draw the shadow gradient and both halves of the disk once.
   *
   * None of this geometry moves: the only thing the frame loop changed was a
   * `pulse` that scaled every ring alpha by the same amount, and Pixi folds a
   * container alpha into the batched vertex colours in exactly that way. So the
   * disk is built here and `_updateDisk` only animates `alpha`.
   */
  private _buildDisk(): void {
    const shadow = this.diskShadowGfx;
    const EXT = WEBCAM_R * 0.7;
    const LAYS = 26;
    const lh = EXT / LAYS;
    for (let i = 0; i < LAYS; i++) {
      const r = WEBCAM_R + lh * (i + 0.5);
      const t = i / (LAYS - 1);
      shadow.circle(0, 0, r);
      shadow.stroke({
        color: CRUST,
        width: lh * 2.4,
        alpha: Math.pow(1 - t, 1.6) * 0.58,
      });
    }

    for (const ring of DISK_RINGS) {
      // Back disk (below hole — gets partially erased)
      const bgPts = this._diskBuildPts(ring, Math.PI, TAU, true);
      this._diskDrawArc(this.diskBgGfx, ring, bgPts, 0.42);

      // Front disk (above hole — overlaps cam bottom for depth illusion)
      const fgPts = this._diskBuildPts(ring, 0, Math.PI, false);
      this._diskDrawArc(this.diskFgGfx, ring, fgPts, 1);
    }
  }

  private _lensRingPath(g: Graphics): void {
    for (let i = 0; i <= LENS_SEGS; i++) {
      const x = LENS_PTS[i * 2],
        y = LENS_PTS[i * 2 + 1];
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }

  private _updateDisk(): void {
    const pulse = 0.82 + 0.18 * Math.sin(this.time * 0.68);
    this.diskBgGfx.alpha = pulse;
    this.diskFgGfx.alpha = pulse;

    // Lensing ring (above hole — shows over camera feed). Its two shimmer terms
    // differ per stroke, so this layer is still redrawn each frame.
    const lg = this.lensingGfx;
    lg.clear();
    const sh1 = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * 1.9));
    const sh2 = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 2.5 + 1.3));
    this._lensRingPath(lg);
    lg.stroke({ color: BLUE, width: 18, alpha: sh1 * 0.07 });
    this._lensRingPath(lg);
    lg.stroke({ color: LAVENDER, width: 7, alpha: sh1 * 0.22 });
    this._lensRingPath(lg);
    lg.stroke({ color: BLUE, width: 2, alpha: sh2 * 0.82 });
  }
}
