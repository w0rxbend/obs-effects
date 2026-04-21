import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;

// Catppuccin Mocha
const CRUST = 0x11111b;
const MANTLE = 0x181825;
const BASE = 0x1e1e2e;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const LAVENDER = 0xb4befe;
const SAPPHIRE = 0x74c7ec;
const TEAL = 0x94e2d5;
const MAUVE = 0xcba6f7;
const PINK = 0xf38ba8;
const YELLOW = 0xf9e2af;

// ── Layout ────────────────────────────────────────────────────────────────────
const HORIZON_Y = 405; // screen Y of the horizon line
const VPX = W / 2; // vanishing-point X (dead centre)

// ── Perspective grid ──────────────────────────────────────────────────────────
// NH rows (0 = nearest / bottom, NH-1 = farthest / near horizon)
// NV columns spread evenly, converging to the vanishing point
const NH = 22;
const NV = 25;

// Row screen-Y: equal spacing from near bottom → near horizon
const ROW_BOT_Y = H - 16;
const ROW_TOP_Y = HORIZON_Y + 10;

// Column bottom-edge X positions — slightly wider than screen for dramatic spread
const COL_SPREAD = W + 200;
const colBotX = Array.from(
  { length: NV },
  (_, j) => (W - COL_SPREAD) / 2 + (j / (NV - 1)) * COL_SPREAD,
);

// Base row screen-Y positions (before terrain deformation)
const rowY = Array.from(
  { length: NH },
  (_, i) => ROW_BOT_Y - (i / (NH - 1)) * (ROW_BOT_Y - ROW_TOP_Y),
);

// Perspective X of column j at screen-Y sy
function perspX(j: number, sy: number): number {
  const t = (sy - HORIZON_Y) / (H - HORIZON_Y); // 0 at horizon, 1 at screen bottom
  return VPX + (colBotX[j] - VPX) * t;
}

// ── Terrain ───────────────────────────────────────────────────────────────────
// Terrain is screen-space: each row/col intersection lifts UP by `offset` pixels.
// Max lift scales with distance (mountains only appear far away).
const MAX_LIFT_FAR = 105; // px at far horizon rows
const TERRAIN_POWER = 2.0; // how steeply lift grows with distance

function maxLift(i: number): number {
  return MAX_LIFT_FAR * Math.pow(i / (NH - 1), TERRAIN_POWER);
}

// Animated height noise [0, 1]
function noise(nj: number, ni: number, t: number): number {
  const x = nj * TAU;
  const z = ni * TAU;
  let h = 0;
  h += 0.48 * Math.sin(x * 1.3 + t * 0.24) * Math.cos(z * 1.1 + t * 0.18);
  h += 0.27 * Math.sin(x * 2.9 + t * 0.41 + 1.2) * Math.cos(z * 2.6 + t * 0.31);
  h += 0.15 * Math.sin(x * 5.8 + t * 0.63 + 0.8) * Math.cos(z * 5.1 + t * 0.49);
  h += 0.1 * Math.sin(x * 11.2 + t * 0.88 + 2.1) * Math.cos(z * 9.7 + t * 0.72);
  return (h + 1) * 0.5;
}

// ── Scan ──────────────────────────────────────────────────────────────────────
// Sweeps row-by-row from NH-1 (farthest/top) toward 0 (nearest/bottom)
const SCAN_PERIOD = 4800; // ms per full far→near sweep
const SCAN_GLOW_R = 1.7; // rows of outer glow halo
const SCAN_CORE_R = 0.55; // rows of bright core

export class TopoLandscapeScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgG = new Graphics(); // sky gradient + stars (static)
  private readonly sunLayer = new Container(); // sun (static)
  private readonly mtnG = new Graphics(); // mountains silhouette (static)
  private readonly gridG = new Graphics(); // base grid lines (per-frame)
  private readonly glowG = new Graphics(); // scan glow, additive (per-frame)

  // Per-vertex screen positions (NH rows × NV cols)
  private readonly ptX: Float32Array;
  private readonly ptY: Float32Array;

  private elapsed = 0;
  private tParam = 0;
  private ready = false;

  constructor() {
    super();
    const N = NH * NV;
    this.ptX = new Float32Array(N);
    this.ptY = new Float32Array(N);

    for (const l of [
      this.bgG,
      this.sunLayer,
      this.mtnG,
      this.gridG,
      this.glowG,
    ]) {
      this.addChild(l);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.glowG as any).blendMode = "add";

    // Pre-compute static X positions (only Y changes with terrain)
    for (let i = 0; i < NH; i++) {
      for (let j = 0; j < NV; j++) {
        this.ptX[i * NV + j] = perspX(j, rowY[i]);
      }
    }
  }

  public async show(): Promise<void> {
    this.buildSky();
    this.buildSun();
    this.buildMountains();
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;
    const dt = time.deltaMS;
    this.elapsed += dt;
    this.tParam += dt * 0.00038;

    // Update terrain-deformed Y positions
    for (let i = 0; i < NH; i++) {
      const ml = maxLift(i);
      const ni = i / (NH - 1);
      for (let j = 0; j < NV; j++) {
        const lift = noise(j / (NV - 1), ni, this.tParam) * ml;
        this.ptY[i * NV + j] = rowY[i] - lift;
      }
    }

    this.drawGrid();
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width - W) / 2);
    this.y = Math.round((height - H) / 2);
  }

  // ── Static builders ──────────────────────────────────────────────────────────

  private buildSky(): void {
    const g = this.bgG;
    g.rect(0, 0, W, H).fill({ color: CRUST });

    // Purple-tinted sky gradient fading from base to surface near horizon
    const skyBands: [number, number, number, number, number][] = [
      // y,  height,  color,     alpha
      [0, H * 0.45, BASE, 0.3, 0],
      [H * 0.25, H * 0.4, SURFACE0, 0.18, 0],
      [H * 0.55, H * 0.25, MAUVE, 0.1, 0],
    ];
    for (const [y, h, col, a] of skyBands) {
      g.rect(0, y, W, h).fill({ color: col, alpha: a });
    }

    // Stars — only in the sky portion (above horizon)
    for (let i = 0; i < 650; i++) {
      const hue = Math.random();
      const col = hue < 0.6 ? SURFACE1 : hue < 0.84 ? LAVENDER : MAUVE;
      g.circle(
        Math.random() * W,
        Math.random() * (HORIZON_Y * 0.95),
        Math.random() * 0.85 + 0.2,
      ).fill({ color: col, alpha: Math.random() * 0.22 + 0.04 });
    }

    // Horizon bloom: pink + mauve horizontal glows centred on the horizon
    for (let i = 8; i >= 1; i--) {
      g.rect(0, HORIZON_Y - i * 20, W, i * 40).fill({
        color: PINK,
        alpha: 0.008 * i,
      });
    }
    for (let i = 5; i >= 1; i--) {
      g.rect(0, HORIZON_Y - i * 10, W, i * 20).fill({
        color: MAUVE,
        alpha: 0.014 * i,
      });
    }
  }

  private buildSun(): void {
    const r = 168;
    const size = r * 2 + 4;
    const mid = r + 2;

    // ── Canvas-rendered sun gradient + scanlines ──────────────────────────────
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext("2d")!;

    // Radial gradient: yellow centre → peach → pink → mauve edge
    const grad = ctx.createRadialGradient(mid, mid, 0, mid, mid, r);
    grad.addColorStop(0.0, "#f9e2af"); // YELLOW
    grad.addColorStop(0.3, "#fab387"); // PEACH
    grad.addColorStop(0.58, "#f38ba8"); // PINK
    grad.addColorStop(0.85, "#cba6f7"); // MAUVE
    grad.addColorStop(1.0, "rgba(203,166,247,0)");

    // Clip to upper half so the grid floor masks the rest naturally
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, mid);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mid, mid, r, 0, TAU);
    ctx.fill();

    // Horizontal scanlines punched out with destination-out
    ctx.globalCompositeOperation = "destination-out";
    for (let y = 2; y < mid; y += 10) {
      ctx.fillStyle = "rgba(0,0,0,0.50)";
      ctx.fillRect(0, y, size, 5);
    }
    ctx.restore();

    const sprite = new Sprite(Texture.from(cv));
    sprite.anchor.set(0.5);
    sprite.x = VPX;
    sprite.y = HORIZON_Y;
    this.sunLayer.addChild(sprite);

    // Soft outer glow rings (additive)
    const glowG = new Graphics();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (glowG as any).blendMode = "add";
    for (let i = 7; i >= 1; i--) {
      glowG
        .circle(VPX, HORIZON_Y, r + i * 24)
        .fill({ color: PINK, alpha: 0.009 * i });
    }
    for (let i = 4; i >= 1; i--) {
      glowG
        .circle(VPX, HORIZON_Y, r + i * 14)
        .fill({ color: MAUVE, alpha: 0.015 * i });
    }
    // Thin bright rim at top of sun
    glowG.arc(VPX, HORIZON_Y, r - 2, Math.PI, 0).stroke({
      color: YELLOW,
      width: 1.5,
      alpha: 0.5,
    });
    this.sunLayer.addChild(glowG);
  }

  private buildMountains(): void {
    const g = this.mtnG;

    // Three silhouette layers, darkest farthest back
    const layers = [
      {
        maxH: 125,
        freq1: 0.0042,
        freq2: 0.0078,
        phase: 0.0,
        col: SURFACE0,
        alpha: 0.92,
      },
      {
        maxH: 88,
        freq1: 0.0058,
        freq2: 0.011,
        phase: 1.7,
        col: MANTLE,
        alpha: 0.96,
      },
      {
        maxH: 55,
        freq1: 0.0071,
        freq2: 0.0155,
        phase: 3.4,
        col: CRUST,
        alpha: 1.0,
      },
    ] as const;

    for (const layer of layers) {
      const step = 4; // x step in pixels
      const yBase = HORIZON_Y + 3;

      g.moveTo(-step, yBase + 8);
      for (let x = 0; x <= W + step; x += step) {
        const h =
          layer.maxH *
          Math.max(
            0,
            0.5 *
              (1 + Math.sin(x * layer.freq1 + layer.phase)) *
              (0.5 + 0.5 * Math.sin(x * layer.freq2 + layer.phase * 1.6)),
          );
        g.lineTo(x, yBase - h);
      }
      g.lineTo(W + step, yBase + 8)
        .lineTo(-step, yBase + 8)
        .fill({ color: layer.col, alpha: layer.alpha });
    }

    // Thin bright horizon line sitting on top of everything
    g.moveTo(0, HORIZON_Y).lineTo(W, HORIZON_Y).stroke({
      color: PINK,
      width: 1.2,
      alpha: 0.65,
    });
  }

  // ── Per-frame grid draw ───────────────────────────────────────────────────────

  private drawGrid(): void {
    this.gridG.clear();
    this.glowG.clear();

    // Scan row: travels from NH-1 (far/top) toward 0 (near/bottom) each period
    const phase = (this.elapsed % SCAN_PERIOD) / SCAN_PERIOD;
    const scanRowFloat = (NH - 1) * (1 - phase);

    // ── Horizontal lines (the "contour" lines that pulse) ─────────────────────
    for (let i = 0; i < NH; i++) {
      const dist = Math.abs(i - scanRowFloat);
      const inCore = dist < SCAN_CORE_R;
      const inGlow = dist < SCAN_GLOW_R;

      if (inCore) {
        // Bright scan contour — three stacked additive passes
        for (const [col, w, a] of [
          [MAUVE, 7.0, 0.2] as const,
          [PINK, 3.5, 0.55] as const,
          [LAVENDER, 1.6, 0.8] as const,
          [0xffffff, 0.8, 0.45] as const,
        ]) {
          for (let j = 0; j < NV - 1; j++) {
            this.glowG
              .moveTo(this.ptX[i * NV + j], this.ptY[i * NV + j])
              .lineTo(this.ptX[i * NV + j + 1], this.ptY[i * NV + j + 1]);
          }
          this.glowG.stroke({ color: col, width: w, alpha: a });
        }
      } else if (inGlow) {
        const f = 1 - dist / SCAN_GLOW_R;
        for (let j = 0; j < NV - 1; j++) {
          this.glowG
            .moveTo(this.ptX[i * NV + j], this.ptY[i * NV + j])
            .lineTo(this.ptX[i * NV + j + 1], this.ptY[i * NV + j + 1]);
        }
        this.glowG.stroke({ color: PINK, width: 5.0, alpha: 0.15 * f });
        for (let j = 0; j < NV - 1; j++) {
          this.glowG
            .moveTo(this.ptX[i * NV + j], this.ptY[i * NV + j])
            .lineTo(this.ptX[i * NV + j + 1], this.ptY[i * NV + j + 1]);
        }
        this.glowG.stroke({ color: TEAL, width: 1.8, alpha: 0.3 * f });
      } else {
        // Base dim line — slightly brighter closer to camera (low i)
        const nearness = 1 - i / (NH - 1);
        const baseAlpha = 0.06 + 0.12 * nearness;
        const baseCol = i > NH * 0.65 ? SAPPHIRE : MAUVE;
        for (let j = 0; j < NV - 1; j++) {
          this.gridG
            .moveTo(this.ptX[i * NV + j], this.ptY[i * NV + j])
            .lineTo(this.ptX[i * NV + j + 1], this.ptY[i * NV + j + 1]);
        }
        this.gridG.stroke({ color: baseCol, width: 0.6, alpha: baseAlpha });
      }
    }

    // ── Vertical lines (radiate from vanishing point) ─────────────────────────
    for (let j = 0; j < NV; j++) {
      const isEdge = j === 0 || j === NV - 1;
      // Use the bottom row as the "near" point and NH-1 as "far"
      for (let i = 0; i < NH - 1; i++) {
        this.gridG
          .moveTo(this.ptX[i * NV + j], this.ptY[i * NV + j])
          .lineTo(this.ptX[(i + 1) * NV + j], this.ptY[(i + 1) * NV + j]);
      }
      this.gridG.stroke({
        color: MAUVE,
        width: isEdge ? 0.9 : 0.45,
        alpha: isEdge ? 0.28 : 0.1,
      });
    }

    // ── Scan intersection dots on vertical lines ──────────────────────────────
    const si = Math.round(scanRowFloat);
    if (si >= 0 && si < NH) {
      for (let j = 0; j < NV; j++) {
        this.glowG
          .circle(this.ptX[si * NV + j], this.ptY[si * NV + j], 2.8)
          .fill({ color: LAVENDER, alpha: 0.6 });
      }
    }

    // ── Reflective floor gradient just below the grid ─────────────────────────
    // A faint radial bloom at the very bottom — adds the retro "neon floor" feel
    const scanSY = this.ptY[Math.max(0, si) * NV + Math.floor(NV / 2)];
    this.glowG
      .rect(VPX - 600, scanSY - 4, 1200, 8)
      .fill({ color: PINK, alpha: 0.06 });
  }
}
