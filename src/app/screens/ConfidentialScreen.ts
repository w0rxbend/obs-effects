import type { Ticker } from "pixi.js";
import { Container, Graphics, HTMLText, HTMLTextStyle } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const TAPE_YELLOW = 0xf9e2af; // Catppuccin Mocha Yellow
const TAPE_BLACK = 0x11111b; // Catppuccin Mocha Crust
const CATT_MAUVE = 0xcba6f7;
const CATT_PINK = 0xf38ba8;
const CATT_PEACH = 0xfab387;
const CATT_SKY = 0x89dceb;
const CATT_YELLOW = 0xf9e2af;
const WHITE = 0xffffff;

const PARTICLE_PALETTE = [
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_SKY,
  CATT_YELLOW,
  WHITE,
] as const;

// ── Main tape phrases ─────────────────────────────────────────────────────────
const MAIN_PHRASES = [
  "STREAMER IS DEFINITELY NOT CRYING",
  "HIDING PASSWORDS IN PLAIN SIGHT",
  "IF YOU SAW THAT, YOU SAW NOTHING",
  "MY BOSS THINKS I AM WORKING",
  "CONFIDENTIAL: SALARY NEGOTIATION TACTICS",
  "CHAT DO NOT CLIP THIS. CHAT.",
  "DISCORD DM READING SIMULATOR",
  "GOOGLE SEARCH HISTORY: CLASSIFIED",
  "ABSOLUTELY NOT ONLINE SHOPPING",
  "STREAMER SWITCHING TO COMPETITOR",
  "TOP SECRET: ACTUALLY READING DOCS",
  "CTRL+Z CANNOT SAVE ME NOW",
  "YES THIS IS A WORK MEETING",
  "DO NOT TELL WIFE ABOUT THIS TAB",
  "STREAMER IS GOOGLING HOW TO CODE",
  "CLASSIFIED: TWITCH RIVAL RESEARCH",
  "TAX FRAUD SPEEDRUN IN PROGRESS",
  "NOTHING HAPPENED. GO WATCH ADS.",
] as const;

// ── NerdFont separator icons (warning / caution theme) ────────────────────────
const SEPARATOR_ICONS = [
  "\uF071", // nf-fa-exclamation_triangle  ⚠
  "\uF06A", // nf-fa-exclamation_circle
  "\uF0F3", // nf-fa-bell
  "\uF0E7", // nf-fa-bolt  ⚡
  "\uF1E2", // nf-fa-bomb
  "\uF188", // nf-fa-bug
  "\uF12A", // nf-fa-exclamation
  "\uF024", // nf-fa-flag
  "\u26A0", // ⚠ warning sign (Unicode)
  "\u2622", // ☢ radioactive
  "\u2623", // ☣ biohazard
  "\u2620", // ☠ skull
  "\u26A1", // ⚡ lightning
  "\u26D4", // ⛔ no entry
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const NET_DOT_COUNT = 45;
const NET_MAX_DIST = 180;
const PARTICLE_COUNT = 140;
// Local half-width of each tape (must reach screen edges from centre at any rotation)
const TAPE_HW = 1400;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TapeObj {
  container: Container;
  labelA: HTMLText;
  labelB: HTMLText;
  labelWidth: number; // estimated px width of one label (2 chunk repeats)
  scrollSpeed: number; // px/s in tape-local x, negative = leftward
  baseCX: number;
  baseCY: number;
  baseAngle: number;
  bounceAmp: number;
  bounceFreq: number;
  bouncePhase: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  isMain: boolean;
}

interface NetDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerpColor(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

/**
 * Builds a caution-tape Graphics in tape-local coordinates (origin = centre).
 * Stripes are drawn ONLY inside the border zones so they never overlap the
 * yellow centre band — no overdraw, no layering issues.
 */
function buildTapeGraphics(hh: number): Graphics {
  const hw = TAPE_HW;
  const bz = Math.max(hh * 0.32, 14); // border zone height
  const cHH = hh - bz; // centre half-height
  const period = bz * 2.4; // stripe period scaled to border zone
  const blackW = period * 0.48;
  const slant = bz; // 45° within the border zone

  const g = new Graphics();

  // 1. Full yellow background (no overdraw issues — drawn once)
  g.rect(-hw, -hh, hw * 2, hh * 2).fill({ color: TAPE_YELLOW });

  // 2. Black stripes in TOP border zone only
  for (let x = -hw - slant * 2; x < hw + slant; x += period) {
    g.poly([
      x,
      -hh,
      x + blackW,
      -hh,
      x + blackW + slant,
      -cHH,
      x + slant,
      -cHH,
    ]).fill({ color: TAPE_BLACK });
  }

  // 3. Black stripes in BOTTOM border zone only (mirrored)
  for (let x = -hw - slant * 2; x < hw + slant; x += period) {
    g.poly([
      x + slant,
      cHH,
      x + blackW + slant,
      cHH,
      x + blackW,
      hh,
      x,
      hh,
    ]).fill({
      color: TAPE_BLACK,
    });
  }

  // 4. Hard outer border lines
  g.rect(-hw, -hh, hw * 2, 3).fill({ color: TAPE_BLACK });
  g.rect(-hw, hh - 3, hw * 2, 3).fill({ color: TAPE_BLACK });

  // 5. Thin separator lines at centre band edges
  g.rect(-hw, -cHH - 1, hw * 2, 2).fill({ color: TAPE_BLACK, alpha: 0.5 });
  g.rect(-hw, cHH - 1, hw * 2, 2).fill({ color: TAPE_BLACK, alpha: 0.5 });

  return g;
}

export class ConfidentialScreen extends Container {
  public static assetBundles = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly bgGfx = new Graphics();
  private readonly netGfx = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly tapeCont = new Container();

  private readonly tapes: TapeObj[] = [];
  private readonly netDots: NetDot[] = [];
  private readonly particles: Particle[] = [];

  private time = 0;
  private w = 0;
  private h = 0;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.netGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.tapeCont);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.spawnNetDots();
    this.spawnParticles();
    this.createTapes();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    const breathe = 1 + 0.025 * Math.sin(this.time * 0.5);
    this.drawBackground(breathe);
    this.drawNetwork(dt);
    this.drawParticles(dt);
    this.updateTapes(dt);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width * 0.5;
    this.y = height * 0.5;
  }

  // ── Background subtle haze ─────────────────────────────────────────────────

  private drawBackground(breathe: number): void {
    this.bgGfx.clear();
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const r = Math.max(hw, hh);

    // Very subtle warm amber glow behind the tape
    this.bgGfx
      .circle(0, 0, r * 1.8 * breathe)
      .fill({ color: TAPE_YELLOW, alpha: 0.018 });
    this.bgGfx
      .circle(0, 0, r * 1.0 * breathe)
      .fill({ color: TAPE_YELLOW, alpha: 0.03 });
    this.bgGfx
      .circle(0, 0, r * 0.5 * breathe)
      .fill({ color: TAPE_YELLOW, alpha: 0.035 });
  }

  // ── Tape creation ──────────────────────────────────────────────────────────

  private createTapes(): void {
    const tapeDefs = [
      // Main tape — centre, nearly horizontal, large
      { cx: 0, cy: 0, angle: (Math.random() - 0.5) * 0.06, height: 160, isMain: true, bounceAmp: 22, bounceFreq: 0.38, wobbleAmp: 0.012, wobbleFreq: 0.22, scrollSpeed: 220 },
      // Secondary tapes — scattered, various angles
      { cx: -0.05, cy: -0.52, angle: 0.38,  height: 110, isMain: false, bounceAmp: 14, bounceFreq: 0.31, wobbleAmp: 0.018, wobbleFreq: 0.27, scrollSpeed: -170 },
      { cx:  0.08, cy:  0.55, angle: -0.28, height: 100, isMain: false, bounceAmp: 16, bounceFreq: 0.27, wobbleAmp: 0.021, wobbleFreq: 0.19, scrollSpeed:  150 },
      { cx: -0.18, cy: -0.26, angle: 0.72,  height: 115, isMain: false, bounceAmp: 12, bounceFreq: 0.42, wobbleAmp: 0.016, wobbleFreq: 0.31, scrollSpeed: -200 },
      { cx:  0.22, cy:  0.30, angle: -0.55, height: 105, isMain: false, bounceAmp: 18, bounceFreq: 0.35, wobbleAmp: 0.020, wobbleFreq: 0.24, scrollSpeed:  130 },
      { cx: -0.08, cy:  0.65, angle: 0.18,  height: 120, isMain: false, bounceAmp: 10, bounceFreq: 0.29, wobbleAmp: 0.014, wobbleFreq: 0.22, scrollSpeed: -180 },
      { cx:  0.04, cy: -0.68, angle: -0.42, height: 108, isMain: false, bounceAmp: 20, bounceFreq: 0.44, wobbleAmp: 0.022, wobbleFreq: 0.33, scrollSpeed:  240 },
      { cx: -0.14, cy:  0.14, angle: 1.10,  height: 100, isMain: false, bounceAmp: 13, bounceFreq: 0.33, wobbleAmp: 0.019, wobbleFreq: 0.28, scrollSpeed: -140 },
      { cx:  0.18, cy: -0.40, angle: -0.88, height: 112, isMain: false, bounceAmp: 17, bounceFreq: 0.38, wobbleAmp: 0.017, wobbleFreq: 0.20, scrollSpeed:  190 },
    ] as const;

    const sw = this.w > 0 ? this.w : 1920;
    const sh = this.h > 0 ? this.h : 1080;

    for (const def of tapeDefs) {
      this.buildTape({
        cx: def.cx * sw,
        cy: def.cy * sh,
        angle: def.angle,
        height: def.height,
        isMain: def.isMain,
        bounceAmp: def.bounceAmp,
        bounceFreq: def.bounceFreq,
        wobbleAmp: def.wobbleAmp,
        wobbleFreq: def.wobbleFreq,
        scrollSpeed: def.scrollSpeed,
      });
    }

    // Main tape on top
    this.tapeCont.setChildIndex(this.tapes[0].container, this.tapeCont.children.length - 1);
  }

  private buildTape(opts: {
    cx: number;
    cy: number;
    angle: number;
    height: number;
    isMain: boolean;
    bounceAmp: number;
    bounceFreq: number;
    wobbleAmp: number;
    wobbleFreq: number;
    scrollSpeed: number;
  }): void {
    const { cx, cy, angle, height, isMain, bounceAmp, bounceFreq, wobbleAmp, wobbleFreq, scrollSpeed } = opts;
    const hh = height * 0.5;

    const container = new Container();
    container.x = cx;
    container.y = cy;
    container.rotation = angle;

    const g = buildTapeGraphics(hh);
    container.addChild(g);

    const fontSize = isMain ? 52 : Math.round(height * 0.40);
    const phrase = randomFrom(MAIN_PHRASES);

    // Silkscreen monospace: ~0.62em per char. Keep each label to 2 repeats to stay well under
    // the 4096px WebGL texture limit — two labels side-by-side give seamless infinite scroll.
    const charPx = fontSize * 0.62;

    const symFont = `'SymbolsNF', 'Symbols Nerd Font Mono', monospace`;
    const txtFont = `'Silkscreen', monospace`;
    const icon = randomFrom(SEPARATOR_ICONS);
    const sym = `<span style="font-family:${symFont}; letter-spacing:0">  ${icon}  </span>`;
    const phraseHtml = `<span style="font-family:${txtFont}">${phrase}</span>`;
    const chunkHtml = phraseHtml + sym;

    // Estimate chunk width: phrase chars + ~3 chars for the icon + padding spaces
    const chunkCharEstimate = phrase.length + 7;
    const labelWidth = chunkCharEstimate * charPx * 2;

    const makeLabel = (): HTMLText => {
      const t = new HTMLText({
        text: chunkHtml.repeat(2),
        style: new HTMLTextStyle({
          fontFamily: txtFont,
          fontSize,
          fill: TAPE_BLACK,
          align: "left",
          padding: 12,
          letterSpacing: isMain ? 3 : 2,
        }),
      });
      t.anchor.set(0, 0.5);
      t.y = 0;
      return t;
    };

    const labelA = makeLabel();
    const labelB = makeLabel();
    labelA.x = -TAPE_HW;
    labelB.x = -TAPE_HW + labelWidth;
    container.addChild(labelA);
    container.addChild(labelB);

    this.tapeCont.addChild(container);

    this.tapes.push({
      container,
      labelA,
      labelB,
      labelWidth,
      scrollSpeed,
      baseCX: cx,
      baseCY: cy,
      baseAngle: angle,
      bounceAmp,
      bounceFreq,
      bouncePhase: Math.random() * Math.PI * 2,
      wobbleAmp,
      wobbleFreq,
      wobblePhase: Math.random() * Math.PI * 2,
      isMain,
    });
  }

  // ── Tape update ────────────────────────────────────────────────────────────

  private updateTapes(dt: number): void {
    for (const tape of this.tapes) {
      tape.bouncePhase += tape.bounceFreq * dt;
      tape.wobblePhase += tape.wobbleFreq * dt;

      const offset = Math.sin(tape.bouncePhase) * tape.bounceAmp;
      const perpX = -Math.sin(tape.baseAngle) * offset;
      const perpY = Math.cos(tape.baseAngle) * offset;

      tape.container.x = tape.baseCX + perpX;
      tape.container.y = tape.baseCY + perpY;
      tape.container.rotation =
        tape.baseAngle + Math.sin(tape.wobblePhase) * tape.wobbleAmp;

      // Move both labels by the scroll speed
      const dx = tape.scrollSpeed * dt;
      tape.labelA.x += dx;
      tape.labelB.x += dx;

      // When a label scrolls fully off the left, jump it to the right of the other
      if (tape.scrollSpeed < 0) {
        if (tape.labelA.x + tape.labelWidth < -TAPE_HW)
          tape.labelA.x = tape.labelB.x + tape.labelWidth;
        if (tape.labelB.x + tape.labelWidth < -TAPE_HW)
          tape.labelB.x = tape.labelA.x + tape.labelWidth;
      } else {
        // Scrolling right: jump label off the right back to the left of the other
        if (tape.labelA.x > TAPE_HW)
          tape.labelA.x = tape.labelB.x - tape.labelWidth;
        if (tape.labelB.x > TAPE_HW)
          tape.labelB.x = tape.labelA.x - tape.labelWidth;
      }

      if (tape.isMain) {
        const a = 0.85 + 0.15 * Math.sin(this.time * 2.1);
        tape.labelA.alpha = a;
        tape.labelB.alpha = a;
      }
    }
  }

  // ── Network dots ──────────────────────────────────────────────────────────

  private spawnNetDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < NET_DOT_COUNT; i++) {
      this.netDots.push({
        x: (Math.random() - 0.5) * hw * 1.8,
        y: (Math.random() - 0.5) * hh * 1.8,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18,
        size: 1.0 + Math.random() * 2.0,
        color: randomFrom(PARTICLE_PALETTE),
        alpha: 0.15 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private drawNetwork(dt: number): void {
    this.netGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const d of this.netDots) {
      d.vx *= 0.985;
      d.vy *= 0.985;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x > hw - 8) {
        d.x = hw - 8;
        d.vx *= -0.8;
      }
      if (d.x < -hw + 8) {
        d.x = -hw + 8;
        d.vx *= -0.8;
      }
      if (d.y > hh - 8) {
        d.y = hh - 8;
        d.vy *= -0.8;
      }
      if (d.y < -hh + 8) {
        d.y = -hh + 8;
        d.vy *= -0.8;
      }
    }

    for (let i = 0; i < this.netDots.length; i++) {
      const a = this.netDots[i];
      for (let j = i + 1; j < this.netDots.length; j++) {
        const b = this.netDots[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= NET_MAX_DIST) continue;
        const t = 1 - dist / NET_MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        this.netGfx
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({
            color: col,
            alpha: t * t * 0.2,
            width: 0.4 + t * 0.6,
            cap: "round",
          });
      }
    }

    for (const d of this.netDots) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.1 + d.phase);
      const a = d.alpha * tw;
      this.netGfx
        .circle(d.x, d.y, d.size * 3.0)
        .fill({ color: d.color, alpha: a * 0.08 });
      this.netGfx
        .circle(d.x, d.y, d.size)
        .fill({ color: d.color, alpha: Math.min(1, a) });
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * hw * 2,
        y: (Math.random() - 0.5) * hh * 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18 - 4,
        size: 0.4 + Math.random() * 2.0,
        alpha: 0.1 + Math.random() * 0.4,
        color: randomFrom(PARTICLE_PALETTE),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2.0,
      });
    }
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x > hw + 30) p.x = -hw - 30;
      if (p.x < -hw - 30) p.x = hw + 30;
      if (p.y > hh + 30) p.y = -hh - 30;
      if (p.y < -hh - 30) p.y = hh + 30;

      p.twinklePhase += p.twinkleSpeed * dt;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(p.twinklePhase));
      const a = p.alpha * tw;

      this.particleGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: p.color, alpha: Math.min(1, a) });
      if (p.size > 1.0) {
        this.particleGfx
          .circle(p.x, p.y, p.size * 2.8)
          .fill({ color: p.color, alpha: a * 0.12 });
      }
    }
  }
}
