import type { Ticker } from "pixi.js";
import { Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from "pixi.js";


// ── Palette ──────────────────────────────────────────────────────────────────
const TICKER_BG    = 0x00cc44;  // green band
const TICKER_TEXT  = 0x000000;  // black text
const TOXIC_VIOLET = 0x181825; // top & bottom border

// ── Dimensions ───────────────────────────────────────────────────────────────
const BORDER_H  = 6;
const BAND_H    = 80;
const TOTAL_H   = BAND_H + BORDER_H * 2;
const FONT_SIZE = 24;
const ICON_H    = 52;
const ITEM_GAP  = 90;

// ── Scroll speed ─────────────────────────────────────────────────────────────
const SCROLL_PX_PER_MS = 0.2;  // ~200 px/s

// ── News items ────────────────────────────────────────────────────────────────
const NEWS = [
  "WORXBEND GOES LIVE",
  "BREAKING: LOCAL DEVELOPER DESCRIBES CODEBASE AS 'LEGACY' — WROTE IT LAST WEEK",
  "EXCLUSIVE: STARTUP PIVOTS FOR NINTH TIME; NOW SELLS ARTISANAL BLOCKCHAIN WATER",
  "ALERT: ENGINEER FIXES BUG BY DELETING TEST; TESTS NOW PASSING; CHAMPAGNE OPENED",
  "REPORT: MAN WHO SAID 'IT WORKS ON MY MACHINE' SHIPS MACHINE TO PRODUCTION",
  "CONFIRMED: STANDUP MEETING COULD HAVE BEEN AN EMAIL; EMAIL COULD HAVE BEEN NOTHING",
];

const TICKER_STYLE = new TextStyle({
  fontFamily: "'Bangers', cursive",
  fontSize: FONT_SIZE,
  fill: TICKER_TEXT,
  padding: 6,
  letterSpacing: 3,
});

interface TickerEntry {
  obj: Container;
  width: number;
}

export class TitlePowerlineScreen extends Container {
  public static assetBundles = ["main"];

  private readonly band         = new Graphics();
  private readonly scrollMask   = new Graphics();
  private readonly scrollCont   = new Container();
  private readonly fluidBorderGfx = new Graphics();

  private items:      TickerEntry[] = [];
  private textIdx     = 0;
  private nextIsIcon  = false;
  private screenW = 0;
  private ready   = false;
  private fluidTime = 0;

  constructor() {
    super();
    this.addChild(this.band);
    this.addChild(this.scrollMask);
    this.addChild(this.scrollCont);
    this.scrollCont.mask = this.scrollMask;
    this.addChild(this.fluidBorderGfx); // drawn on top of the static border
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.ready = true;
    this.populateItems();
  }

  public update(time: Ticker): void {
    if (!this.ready || this.screenW === 0) return;

    this.fluidTime += time.deltaMS * 0.001; // seconds
    this.drawFluidBorder();

    this.scrollCont.x -= SCROLL_PX_PER_MS * time.deltaMS;

    // cull items that scrolled off the left edge
    const leftBound = -this.scrollCont.x;
    while (this.items.length > 0) {
      const first = this.items[0];
      if (first.obj.x + first.width < leftBound) {
        this.scrollCont.removeChild(first.obj);
        first.obj.destroy();
        this.items.shift();
      } else break;
    }

    // fill right side with new items as needed
    const fillTo = leftBound + this.screenW + 400;
    let right = this.rightEdge();
    while (right < fillTo) {
      const entry = this.spawnNext();
      entry.obj.x = right + ITEM_GAP;
      this.scrollCont.addChild(entry.obj);
      this.items.push(entry);
      right = entry.obj.x + entry.width;
    }
  }

  public resize(width: number, height: number): void {
    this.screenW = width;
    this.y = height - TOTAL_H;

    this.band.clear();
    // Fill from y=0 so the green band sits flush under the wave
    this.band.rect(0, 0, width, BAND_H + BORDER_H).fill(TICKER_BG);
    this.band.rect(0, BORDER_H + BAND_H, width, BORDER_H).fill(TOXIC_VIOLET);

    this.scrollMask.clear();
    this.scrollMask.rect(0, BORDER_H, width, BAND_H).fill(0xffffff);

    if (this.ready) this.populateItems();
  }

  // ── Item management ───────────────────────────────────────────────────────

  private populateItems(): void {
    for (const e of this.items) {
      this.scrollCont.removeChild(e.obj);
      e.obj.destroy();
    }
    this.items = [];
    this.textIdx = 0;
    this.nextIsIcon = false;
    this.scrollCont.x = 0;

    let right = 0;
    while (right < this.screenW + 400) {
      const entry = this.spawnNext();
      entry.obj.x = right + ITEM_GAP;
      this.scrollCont.addChild(entry.obj);
      this.items.push(entry);
      right = entry.obj.x + entry.width;
    }
  }

  private rightEdge(): number {
    if (this.items.length === 0) return 0;
    const last = this.items[this.items.length - 1];
    return last.obj.x + last.width;
  }

  private spawnNext(): TickerEntry {
    if (this.nextIsIcon) {
      this.nextIsIcon = false;
      return this.spawnIcon();
    }
    this.nextIsIcon = true;
    return this.spawnText();
  }

  private spawnText(): TickerEntry {
    const label = NEWS[this.textIdx % NEWS.length];
    this.textIdx++;
    const t = new Text({ text: label, style: TICKER_STYLE });
    t.y = BORDER_H + (BAND_H - t.height) * 0.5;
    return { obj: t, width: t.width };
  }

  // ── Fluid border ──────────────────────────────────────────────────────────

  /**
   * Draws the top border as actual undulating fluid waves.
   *
   * Each wave layer is rendered as a series of thin vertical trapezoid slices
   * (SEG_W px wide). The bottom edge of every slice follows a sum of layered
   * sine waves, so the shape has a real wavy silhouette — not just a coloured
   * rectangle. Three wave layers are stacked:
   *
   *   Layer A (back)  — tallest, slowest, most transparent  → wide swell
   *   Layer B (mid)   — medium height, medium speed          → main body
   *   Layer C (front) — shortest, fastest, most opaque      → bright crest
   *
   * The colour of each slice scrolls through the Catppuccin palette based on
   * its x position + time, giving a flowing rainbow plasma look.
   * A 1px near-white highlight is drawn at y=0 for a crisp top edge.
   */
  private drawFluidBorder(): void {
    this.fluidBorderGfx.clear();
    if (this.screenW === 0) return;

    const t     = this.fluidTime;
    const SEG_W = 6; // px per slice — fine enough for smooth curves

    // Wave crests rise upward (negative y) from y=0.
    // The trough floor is at y=0 (band top edge); crests poke above it.
    // A flat TICKER_BG fill below ensures seamless green from y=0 downward.
    const WAVE_H = BORDER_H * 2.8; // max crest height above y=0

    /** Returns how far ABOVE y=0 the wave surface sits at this x (positive = upward). */
    const crestY = (x: number, amp: number, f1: number, s1: number,
                                            f2: number, s2: number,
                                            f3: number, s3: number): number => {
      const raw =
          amp * 1.00 * Math.sin(x * f1 - t * s1)
        + amp * 0.50 * Math.sin(x * f2 + t * s2 + 1.2)
        + amp * 0.25 * Math.sin(x * f3 - t * s3 + 2.5);
      // Shift so the minimum is 0 (wave never dips below band edge)
      return Math.max(0, raw + amp * 1.75);
    };

    // Layer definitions — [amplitude, f1, s1, f2, s2, f3, s3, alpha]
    const layers: [number, number, number, number, number, number, number, number][] = [
      // back swell — tallest, slowest, most transparent
      [WAVE_H * 0.55, 0.008, 1.1, 0.018, 1.7, 0.038, 3.2, 0.20],
      // mid body
      [WAVE_H * 0.38, 0.012, 1.8, 0.028, 2.6, 0.055, 4.8, 0.50],
      // bright crest — shortest, fastest, most opaque
      [WAVE_H * 0.22, 0.018, 2.8, 0.042, 4.1, 0.080, 7.0, 0.90],
    ];

    for (const [amp, f1, s1, f2, s2, f3, s3, layerAlpha] of layers) {
      for (let x = 0; x < this.screenW; x += SEG_W) {
        // How high above y=0 this slice rises
        const rise0 = crestY(x,          amp, f1, s1, f2, s2, f3, s3);
        const rise1 = crestY(x + SEG_W,  amp, f1, s1, f2, s2, f3, s3);

        // Trapezoid: wavy top (negative y = above band edge), flat bottom at y=0
        // so the green band shows through below the wave silhouette
        this.fluidBorderGfx
          .poly([x, -rise0,  x + SEG_W, -rise1,  x + SEG_W, 0,  x, 0])
          .fill({ color: TICKER_BG, alpha: layerAlpha });
      }
    }
  }

  private spawnIcon(): TickerEntry {
    const base  = Texture.from("sprite.png");
    const cols  = Math.floor(base.width / 250);
    const rows  = Math.floor(base.height / 250);
    const total = Math.max(1, cols * rows);
    const idx   = Math.floor(Math.random() * total);
    const frame = new Rectangle(
      (idx % cols) * 250,
      Math.floor(idx / cols) * 250,
      250,
      250,
    );
    const tex = new Texture({ source: base.source, frame });
    const spr = new Sprite(tex);
    spr.scale.set(ICON_H / 250);
    spr.y = BORDER_H + (BAND_H - spr.height) * 0.5;
    return { obj: spr, width: spr.width };
  }
}
