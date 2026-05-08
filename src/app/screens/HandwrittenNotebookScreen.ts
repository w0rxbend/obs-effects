import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

const PAPER_BG = 0xf5f0e3;
const RULE_COLOR = 0x96b8d8;
const MARGIN_COLOR = 0xe89090;
const INK_COLOR = 0x1a1535;

const RULE_SPACING = 38;
const MARGIN_RATIO = 0.08;

// Phase durations: write, pause-full, fade-out
const DURATIONS = [3.2, 2.0, 0.55];

enum Phase {
  WRITING = 0,
  PAUSE = 1,
  FADING = 2,
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class HandwrittenNotebookScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bg = new Graphics();
  private textLine!: Text;
  // coverGfx is a paper-coloured rectangle that hides the not-yet-written right side.
  // It shrinks leftward as the animation progresses — no PixiJS mask needed.
  private readonly coverGfx = new Graphics();
  private readonly rulesTop = new Graphics();

  private w = 1920;
  private h = 1080;
  private phase: Phase = Phase.WRITING;
  private pt = 0;

  constructor() {
    super();

    this.addChild(this.bg);

    const style = new TextStyle({
      fontFamily: "Caveat",
      fontSize: 110,
      fill: INK_COLOR,
      letterSpacing: 2,
      // Caveat has tall ascenders and wide descenders that overflow default canvas bounds
      padding: 40,
    });
    this.textLine = new Text({ text: "Скоро розпочнемо", style });
    this.textLine.anchor.set(0.5, 0.5);
    this.textLine.rotation = -0.022;

    // Layer order: bg → text → cover (hides right side) → ruled lines (always on top)
    this.addChild(this.textLine);
    this.addChild(this.coverGfx);
    this.addChild(this.rulesTop);
  }

  public init(): void {
    this.layout();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.layout();
  }

  private layout(): void {
    this.textLine.x = this.w / 2;
    this.textLine.y = Math.round(this.h / 2 / RULE_SPACING) * RULE_SPACING;
    this.drawBg();
    this.drawRulesTop();
  }

  private drawBg(): void {
    const g = this.bg;
    const { w, h } = this;
    g.clear();

    g.rect(0, 0, w, h).fill({ color: PAPER_BG });

    // corner fold shadows
    const rn = mulberry32(77);
    g.moveTo(0, 0)
      .lineTo(rn() * 200 + 120, 0)
      .lineTo(0, rn() * 160 + 90)
      .closePath()
      .fill({ color: 0x000000, alpha: 0.06 });

    g.moveTo(w, h)
      .lineTo(w - (rn() * 160 + 80), h)
      .lineTo(w, h - (rn() * 140 + 70))
      .closePath()
      .fill({ color: 0x000000, alpha: 0.04 });

    // crumple wrinkle lines
    const wr = mulberry32(33);
    for (let i = 0; i < 16; i++) {
      const x1 = wr() * w * 0.9 + w * 0.05;
      const y1 = wr() * h * 0.9 + h * 0.05;
      const a = wr() * Math.PI;
      const len = wr() * 280 + 60;
      const x2 = x1 + Math.cos(a) * len;
      const y2 = y1 + Math.sin(a) * len;
      const cx = (x1 + x2) / 2 + (wr() - 0.5) * 60;
      const cy = (y1 + y2) / 2 + (wr() - 0.5) * 40;
      g.moveTo(x1, y1)
        .quadraticCurveTo(cx, cy, x2, y2)
        .stroke({
          color: 0x888870,
          alpha: 0.05 + wr() * 0.08,
          width: 0.6 + wr() * 1.6,
        });
    }

    // paper grain
    const gr = mulberry32(55);
    for (let i = 0; i < 3500; i++) {
      g.circle(gr() * w, gr() * h, 0.4 + gr() * 0.6).fill({
        color: 0x887766,
        alpha: gr() * 0.11,
      });
    }

    // edge aging shadow
    g.rect(0, 0, w, 8).fill({ color: 0x000000, alpha: 0.07 });
    g.rect(0, h - 8, w, 8).fill({ color: 0x000000, alpha: 0.06 });
    g.rect(0, 0, 8, h).fill({ color: 0x000000, alpha: 0.05 });
    g.rect(w - 8, 0, 8, h).fill({ color: 0x000000, alpha: 0.04 });

    // ruled lines
    for (let y = RULE_SPACING; y < h; y += RULE_SPACING) {
      g.moveTo(0, y)
        .lineTo(w, y)
        .stroke({ color: RULE_COLOR, alpha: 0.55, width: 1 });
    }

    // left margin
    const mx = Math.floor(w * MARGIN_RATIO);
    g.moveTo(mx, 0)
      .lineTo(mx, h)
      .stroke({ color: MARGIN_COLOR, alpha: 0.65, width: 2 });

    // hole punches
    const hx = Math.floor(mx * 0.4);
    for (const hy of [h * 0.2, h * 0.5, h * 0.8]) {
      g.circle(hx, hy, 14).fill({ color: 0xffffff, alpha: 0.88 });
      g.circle(hx, hy, 14).stroke({ color: 0xccbbaa, alpha: 0.35, width: 1.5 });
    }

    // small doodle stars near margin
    const dr = mulberry32(101);
    for (let i = 0; i < 5; i++) {
      const sx = mx + 20 + dr() * 60;
      const sy = dr() * h * 0.7 + h * 0.1;
      this.drawStar(g, sx, sy, 5, 8, 4, dr);
    }
  }

  private drawStar(
    g: Graphics,
    cx: number,
    cy: number,
    points: number,
    outerR: number,
    innerR: number,
    rn: () => number,
  ): void {
    const tilt = rn() * 0.8 - 0.4;
    const step = (Math.PI * 2) / points;
    for (let i = 0; i < points; i++) {
      const a0 = i * step + tilt;
      const a1 = a0 + step / 2;
      const ox = cx + Math.cos(a0) * outerR;
      const oy = cy + Math.sin(a0) * outerR;
      const ix = cx + Math.cos(a1) * innerR;
      const iy = cy + Math.sin(a1) * innerR;
      if (i === 0) g.moveTo(ox, oy);
      else g.lineTo(ox, oy);
      g.lineTo(ix, iy);
    }
    g.closePath().stroke({ color: INK_COLOR, alpha: 0.2, width: 1 });
  }

  private drawRulesTop(): void {
    const g = this.rulesTop;
    const { w, h } = this;
    g.clear();
    for (let y = RULE_SPACING; y < h; y += RULE_SPACING) {
      g.moveTo(0, y)
        .lineTo(w, y)
        .stroke({ color: RULE_COLOR, alpha: 0.55, width: 1 });
    }
    const mx = Math.floor(w * MARGIN_RATIO);
    g.moveTo(mx, 0)
      .lineTo(mx, h)
      .stroke({ color: MARGIN_COLOR, alpha: 0.65, width: 2 });
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    this.pt += dt;

    const dur = DURATIONS[this.phase];
    if (this.pt >= dur) {
      this.pt -= dur;
      const next = ((this.phase + 1) % DURATIONS.length) as Phase;
      if (next === Phase.WRITING) {
        this.textLine.alpha = 1;
      }
      this.phase = next;
    }

    const t = Math.min(this.pt / DURATIONS[this.phase], 1);

    switch (this.phase) {
      case Phase.WRITING:
        this.textLine.alpha = 1;
        this.drawCover(easeOut(t));
        break;
      case Phase.PAUSE:
        // cover already cleared at end of WRITING (t reached 1)
        break;
      case Phase.FADING:
        this.textLine.alpha = 1 - easeOut(t);
        break;
    }
  }

  private drawCover(t: number): void {
    this.coverGfx.clear();
    if (t >= 1) return; // fully revealed — no cover needed

    // The "pen" travels from the margin line rightward across the full screen.
    // The cover fills everything to the right of where the pen has reached,
    // hiding the text that hasn't been "written" yet.
    const penStart = Math.floor(this.w * MARGIN_RATIO) + 10;
    const penEnd = this.w + 20; // slightly beyond right edge
    const penX = penStart + (penEnd - penStart) * t;

    this.coverGfx
      .rect(penX, 0, penEnd - penX, this.h)
      .fill({ color: PAPER_BG });
  }
}
