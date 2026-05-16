import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";

// ─── Palette ─────────────────────────────────────────────────────────────────
const BG = 0x060810;
const C_MAUVE = 0xcba6f7;
const C_BLUE = 0x89b4fa;
const C_SKY = 0x74c7ec;
const C_LAVENDER = 0x7287fd;
const C_ROSE = 0xf38ba8;

// ─── Blob definitions ────────────────────────────────────────────────────────
// All positional/radial values are normalised fractions of canvas dimensions.
// Tuple layout: [bx,by, ox,oy, speed, phaseX,phaseY, radiusFrac, color, alpha, pulsePh, breathPh]
// bx/by    = base centre as fraction of w/h
// ox/oy    = orbital amplitude as fraction of w/h
// speed    = orbital angular speed (rad/s)
// radiusFrac = blob radius as fraction of min(w,h)
// alpha    = fill opacity baked into geometry (breathing is applied via gfx.alpha)
// pulsePh  = size oscillation phase
// breathPh = alpha oscillation phase
type BlobRow = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

// prettier-ignore
const NEBULA_ROWS: BlobRow[] = [
  [0.35, 0.45, 0.12, 0.08, 0.070, 0.0, 1.3, 0.22, C_MAUVE,    0.62, 0.0, 0.5],
  [0.65, 0.52, 0.10, 0.12, 0.060, 2.1, 0.8, 0.24, C_BLUE,     0.58, 1.2, 1.8],
  [0.50, 0.35, 0.14, 0.06, 0.050, 1.0, 2.4, 0.21, C_SKY,      0.52, 2.3, 3.1],
  [0.25, 0.60, 0.08, 0.10, 0.080, 3.2, 0.3, 0.19, C_LAVENDER, 0.56, 0.7, 2.5],
  [0.75, 0.40, 0.11, 0.09, 0.065, 1.7, 3.6, 0.20, C_ROSE,     0.38, 1.5, 4.2],
];

// prettier-ignore
const WISP_ROWS: BlobRow[] = [
  [0.45, 0.55, 0.18, 0.14, 0.130, 0.5, 2.0, 0.11, C_SKY,      0.55, 0.3, 1.0],
  [0.55, 0.45, 0.16, 0.12, 0.110, 1.5, 0.7, 0.10, C_LAVENDER, 0.50, 1.1, 2.2],
  [0.40, 0.40, 0.20, 0.10, 0.150, 2.5, 3.1, 0.09, C_BLUE,     0.45, 2.0, 3.5],
  [0.60, 0.60, 0.12, 0.16, 0.170, 0.9, 1.5, 0.10, C_MAUVE,    0.50, 0.5, 4.7],
  [0.30, 0.50, 0.15, 0.15, 0.120, 3.5, 0.4, 0.08, C_SKY,      0.45, 1.7, 1.5],
  [0.70, 0.50, 0.13, 0.13, 0.100, 1.2, 2.8, 0.09, C_LAVENDER, 0.40, 2.8, 0.2],
];

const SCAN_GAP = 5; // pixels between scanlines
const SCAN_ALPHA = 0.028;

// ─── Screen ──────────────────────────────────────────────────────────────────
export class AmbientEnergyScreen extends Container {
  public static assetBundles: string[] = [];

  // Rendering layers — order determines z-depth
  private readonly bgGfx = new Graphics();
  private readonly nebulaLayer = new Container(); // heavy blur
  private readonly wispLayer = new Container(); // medium blur
  private readonly vigGfx = new Graphics(); // blurred corner vignette
  private readonly scanGfx = new Graphics(); // static scanlines
  private readonly overGfx = new Graphics(); // unfiltered top overlay

  // Per-blob sprites whose transforms are updated each frame (no geometry rebuild)
  private readonly nebulaSprites: Graphics[] = [];
  private readonly wispSprites: Graphics[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;
  private scanY = 0; // scanline drift offset

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.nebulaLayer);
    this.addChild(this.wispLayer);
    this.addChild(this.vigGfx);
    this.addChild(this.scanGfx);
    this.addChild(this.overGfx);

    // Blur layers — strength tuned so soft nebula blobs look like volumetric fog
    this.nebulaLayer.filters = [new BlurFilter({ strength: 72, quality: 3 })];
    this.wispLayer.filters = [new BlurFilter({ strength: 28, quality: 2 })];
    // Vignette: blurred corner circles create a natural radial dark edge
    this.vigGfx.filters = [new BlurFilter({ strength: 55, quality: 2 })];

    this.buildBlobSprites();
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.buildScanlines();
    this.drawVignette();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.buildScanlines();
    this.drawVignette();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    // Drift scanlines downward at ~1.2 px/s; geometry stays fixed, only Y offset changes
    this.scanY = (this.scanY + dt * 1.2) % SCAN_GAP;
    this.scanGfx.y = this.scanY;

    this.drawBackground();
    this.updateBlobs(this.nebulaSprites, NEBULA_ROWS);
    this.updateBlobs(this.wispSprites, WISP_ROWS);
    this.drawOverlay();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  private buildBlobSprites(): void {
    for (const row of NEBULA_ROWS) {
      const g = new Graphics();
      // Unit circle at origin; position+scale are set each frame via transforms
      g.circle(0, 0, 1).fill({ color: row[8], alpha: row[9] });
      this.nebulaLayer.addChild(g);
      this.nebulaSprites.push(g);
    }
    for (const row of WISP_ROWS) {
      const g = new Graphics();
      g.circle(0, 0, 1).fill({ color: row[8], alpha: row[9] });
      this.wispLayer.addChild(g);
      this.wispSprites.push(g);
    }
  }

  // Scanlines are drawn once per show/resize; only scanGfx.y changes each frame
  private buildScanlines(): void {
    const g = this.scanGfx;
    g.clear();
    g.y = 0;
    this.scanY = 0;
    // Draw an extra row above and below so Y-drift wraps seamlessly
    for (let y = -SCAN_GAP; y < this.h + SCAN_GAP * 2; y += SCAN_GAP) {
      g.moveTo(0, y)
        .lineTo(this.w, y)
        .stroke({ color: 0x000000, alpha: SCAN_ALPHA, width: 1 });
    }
  }

  // Vignette is drawn once per show/resize; the blur spreads darkness inward
  // from each corner without reaching the screen centre (~1101 px away at 1080p).
  private drawVignette(): void {
    const g = this.vigGfx;
    g.clear();
    const { w, h } = this;
    // Radius chosen so the circle (+ blur spread) stops well short of centre
    const r = Math.min(w, h) * 0.72;
    const a = 0.88;
    g.circle(0, 0, r).fill({ color: 0x000000, alpha: a });
    g.circle(w, 0, r).fill({ color: 0x000000, alpha: a });
    g.circle(0, h, r).fill({ color: 0x000000, alpha: a });
    g.circle(w, h, r).fill({ color: 0x000000, alpha: a });
  }

  // ── Per-frame updates ─────────────────────────────────────────────────────────
  private drawBackground(): void {
    const g = this.bgGfx;
    const { w, h } = this;
    g.clear();
    g.rect(0, 0, w, h).fill({ color: BG });

    // Very dark colour zones drift slowly, creating a subtle gradient-in-motion feel
    const t = this.time;
    const md = Math.min(w, h);

    g.circle(
      (0.5 + Math.sin(t * 0.018) * 0.14) * w,
      (0.5 + Math.cos(t * 0.013) * 0.11) * h,
      0.7 * md,
    ).fill({ color: 0x071a2e, alpha: 0.3 });

    g.circle(
      (0.3 + Math.cos(t * 0.022) * 0.11) * w,
      (0.6 + Math.sin(t * 0.017) * 0.09) * h,
      0.55 * md,
    ).fill({ color: 0x0d0720, alpha: 0.22 });

    g.circle(
      (0.72 + Math.sin(t * 0.015) * 0.09) * w,
      (0.38 + Math.cos(t * 0.02) * 0.08) * h,
      0.5 * md,
    ).fill({ color: 0x060e1c, alpha: 0.18 });
  }

  // Update blob transforms each frame — geometry is pre-built and never rebuilt
  private updateBlobs(sprites: Graphics[], rows: BlobRow[]): void {
    const { w, h } = this;
    const minD = Math.min(w, h);
    const t = this.time;

    for (let i = 0; i < rows.length; i++) {
      const [bx, by, ox, oy, sp, px, py, fr, , , pp, bp] = rows[i];
      const s = sprites[i];
      const x = bx * w + Math.cos(t * sp + px) * ox * w;
      const y = by * h + Math.sin(t * sp + py) * oy * h;
      const r = fr * minD * (1 + 0.06 * Math.sin(t * 0.25 + pp));
      s.position.set(x, y);
      s.scale.set(r, r);
      // breathing alpha: never drops to 0 so blobs are always slightly visible
      s.alpha = 0.72 + 0.28 * Math.sin(t * 0.18 + bp);
    }
  }

  // Subtle unblurred highlight that drifts at the screen centre and breathes slowly
  private drawOverlay(): void {
    const g = this.overGfx;
    const { w, h } = this;
    g.clear();
    const t = this.time;
    const cx = w * 0.5 + Math.sin(t * 0.08) * w * 0.03;
    const cy = h * 0.5 + Math.cos(t * 0.06) * h * 0.025;
    const br = 0.65 + 0.35 * Math.sin(t * 0.14);
    const md = Math.min(w, h);
    g.circle(cx, cy, md * 0.22).fill({ color: 0x1a2a44, alpha: 0.12 * br });
    g.circle(cx, cy, md * 0.1).fill({ color: 0x2a3a58, alpha: 0.08 * br });
  }
}
