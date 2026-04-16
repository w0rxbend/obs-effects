import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const TAPE_YELLOW  = 0xFFCC00;
const TAPE_BLACK   = 0x111111;
const CATT_MAUVE   = 0xcba6f7;
const CATT_PINK    = 0xf38ba8;
const CATT_PEACH   = 0xfab387;
const CATT_SKY     = 0x89dceb;
const CATT_YELLOW  = 0xf9e2af;
const WHITE        = 0xffffff;

const PARTICLE_PALETTE = [CATT_MAUVE, CATT_PINK, CATT_PEACH, CATT_SKY, CATT_YELLOW, WHITE] as const;

// ── Main tape phrases ─────────────────────────────────────────────────────────
const MAIN_PHRASES = [
  "DO NOT WATCH — IT IS CURSED",
  "STREAMER HIDING PHD THESIS",
  "CERTIFIED DISASTER ZONE",
  "NOTHING TO SEE HERE (FBI ADVICE)",
  "UNDER INVESTIGATION BY INTERPOL",
  "HAZARDOUS CONTENT — WEAR GOGGLES",
  "AREA 51: OVERFLOW STORAGE",
  "404: DIGNITY NOT FOUND",
  "WARNING: EXTREME CRINGE DETECTED",
  "NSFW: NOT SAFE FOR WALLET",
  "BIOHAZARD: UNFILTERED OPINIONS",
  "QUARANTINE ZONE — NO ENTRY",
  "CLASSIFIED BY ORDER OF THE CAT",
  "ENTER AT OWN RISK — YOU WERE WARNED",
  "THIS STREAM IS A SIMULATION",
  "STREAMER IS TECHNICALLY AN ADULT",
  "CONTENT WARNING: COMPETENCE VARIES",
  "ABANDON ALL HOPE, YE WHO STREAM HERE",
] as const;

// ── Small tape caution texts ───────────────────────────────────────────────────
const CAUTION_TEXTS = [
  "⚠ CAUTION ⚠ DO NOT CROSS ⚠ CAUTION ⚠ DO NOT CROSS ⚠",
  "★ POLICE LINE ★ DO NOT CROSS ★ POLICE LINE ★",
  "⚠ DANGER ZONE ⚠ KEEP OUT ⚠ DANGER ZONE ⚠ KEEP OUT ⚠",
  "▶ NO ENTRY ◀ RESTRICTED AREA ▶ NO ENTRY ◀",
  "⚠ CAUTION ⚠ CAUTION ⚠ CAUTION ⚠ CAUTION ⚠",
  "★ DO NOT CROSS ★ DO NOT CROSS ★ DO NOT CROSS ★",
  "⚠ HAZARD ⚠ CRIME SCENE ⚠ HAZARD ⚠ CRIME SCENE ⚠",
  "▶ RESTRICTED ◀ KEEP OUT ▶ RESTRICTED ◀ KEEP OUT ◀",
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const NET_DOT_COUNT   = 45;
const NET_MAX_DIST    = 180;
const PARTICLE_COUNT  = 140;
// Local half-width of each tape (must reach screen edges from centre at any rotation)
const TAPE_HW         = 1400;
// Stripe geometry (local tape coords, 45° diagonals)
const STRIPE_PERIOD   = 72;   // px between stripe starts
const STRIPE_BLACK_W  = 36;   // px of black per stripe

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TapeObj {
  container:   Container;
  mainText:    Text | null;     // only for the main tape
  baseCX:      number;
  baseCY:      number;
  baseAngle:   number;
  bounceAmp:   number;
  bounceFreq:  number;
  bouncePhase: number;
  wobbleAmp:   number;
  wobbleFreq:  number;
  wobblePhase: number;
  isMain:      boolean;
  phraseTimer: number;
  phraseIdx:   number;
}

interface NetDot {
  x: number; y: number;
  vx: number; vy: number;
  size: number; color: number; alpha: number; phase: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number; color: number;
  twinklePhase: number; twinkleSpeed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerpColor(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8)  |
     Math.round(ab + (bb - ab) * t)
  );
}

/**
 * Draws caution-tape stripe pattern into `g` in tape-local coordinates.
 * Origin is the tape centre. X = along tape, Y = perpendicular.
 * A mask (rect -TAPE_HW .. TAPE_HW × -hh .. hh) is applied by the caller.
 */
function drawTapeGraphics(g: Graphics, tapeHH: number): void {
  const hw  = TAPE_HW + STRIPE_PERIOD; // draw slightly wider to prevent edge gaps
  const hh  = tapeHH;
  const slant = hh * 2;                // 45° offset = tape full height

  // Yellow body
  g.rect(-hw, -hh, hw * 2, hh * 2).fill({ color: TAPE_YELLOW });

  // Black diagonal stripes across the full tape
  for (let x = -hw - slant; x < hw; x += STRIPE_PERIOD) {
    g.poly([
      x,                   -hh,
      x + STRIPE_BLACK_W,  -hh,
      x + STRIPE_BLACK_W + slant, hh,
      x + slant,            hh,
    ]).fill({ color: TAPE_BLACK });
  }

  // Thin black border lines at top and bottom edges for definition
  g.rect(-hw, -hh,      hw * 2, 2).fill({ color: TAPE_BLACK, alpha: 0.7 });
  g.rect(-hw,  hh - 2,  hw * 2, 2).fill({ color: TAPE_BLACK, alpha: 0.7 });
}

export class ConfidentialScreen extends Container {
  public static assetBundles = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly bgGfx       = new Graphics();
  private readonly netGfx      = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly tapeCont    = new Container();

  private readonly tapes:     TapeObj[]  = [];
  private readonly netDots:   NetDot[]   = [];
  private readonly particles: Particle[] = [];

  private time = 0;
  private w    = 0;
  private h    = 0;

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

    const breathe = 1 + 0.025 * Math.sin(this.time * 0.50);
    this.drawBackground(breathe);
    this.drawNetwork(dt);
    this.drawParticles(dt);
    this.updateTapes(dt);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width  * 0.5;
    this.y = height * 0.5;
  }

  // ── Background subtle haze ─────────────────────────────────────────────────

  private drawBackground(breathe: number): void {
    this.bgGfx.clear();
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const r  = Math.max(hw, hh);

    // Very subtle warm amber glow behind the tape
    this.bgGfx.circle(0, 0, r * 1.8 * breathe).fill({ color: TAPE_YELLOW, alpha: 0.018 });
    this.bgGfx.circle(0, 0, r * 1.0 * breathe).fill({ color: TAPE_YELLOW, alpha: 0.030 });
    this.bgGfx.circle(0, 0, r * 0.5 * breathe).fill({ color: TAPE_YELLOW, alpha: 0.035 });
  }

  // ── Tape creation ──────────────────────────────────────────────────────────

  private createTapes(): void {
    // ── Main tape — centred, roughly horizontal ───────────────────────────────
    this.buildTape({
      cx: 0, cy: 0,
      angle:      (Math.random() - 0.5) * 0.06,  // nearly horizontal ±3°
      height:     95,
      isMain:     true,
      bounceAmp:  22, bounceFreq: 0.38,
      wobbleAmp:  0.012, wobbleFreq: 0.22,
    });

    // ── Small background tapes — scattered at various positions & angles ───────
    const smallDefs = [
      { cx: -0.05, cy: -0.55, angle:  0.38, height: 52 },
      { cx:  0.10, cy:  0.58, angle: -0.28, height: 48 },
      { cx: -0.20, cy: -0.28, angle:  0.72, height: 44 },
      { cx:  0.25, cy:  0.32, angle: -0.55, height: 50 },
      { cx: -0.10, cy:  0.68, angle:  0.18, height: 46 },
      { cx:  0.05, cy: -0.70, angle: -0.42, height: 54 },
      { cx: -0.15, cy:  0.15, angle:  1.10, height: 42 },
      { cx:  0.20, cy: -0.42, angle: -0.88, height: 48 },
    ] as const;

    for (const def of smallDefs) {
      const hw = (this.w > 0 ? this.w : 1920) * 0.5;
      const hh = (this.h > 0 ? this.h : 1080) * 0.5;
      this.buildTape({
        cx: def.cx * hw * 2,
        cy: def.cy * hh * 2,
        angle:     def.angle,
        height:    def.height,
        isMain:    false,
        bounceAmp:  10 + Math.random() * 18,
        bounceFreq: 0.25 + Math.random() * 0.45,
        wobbleAmp:  0.015 + Math.random() * 0.025,
        wobbleFreq: 0.18  + Math.random() * 0.30,
      });
    }
  }

  private buildTape(opts: {
    cx: number; cy: number; angle: number; height: number; isMain: boolean;
    bounceAmp: number; bounceFreq: number; wobbleAmp: number; wobbleFreq: number;
  }): void {
    const { cx, cy, angle, height, isMain, bounceAmp, bounceFreq, wobbleAmp, wobbleFreq } = opts;
    const hh = height * 0.5;

    const container = new Container();
    container.x = cx;
    container.y = cy;
    container.rotation = angle;

    // ── Mask clips stripe overflow in Y (perpendicular to tape) ──────────────
    const mask = new Graphics();
    mask.rect(-TAPE_HW, -hh, TAPE_HW * 2, height).fill({ color: 0xffffff });

    // ── Tape body + stripes ───────────────────────────────────────────────────
    const g = new Graphics();
    drawTapeGraphics(g, hh);
    g.mask = mask;

    container.addChild(mask);
    container.addChild(g);

    // ── Text on tape ──────────────────────────────────────────────────────────
    let mainText: Text | null = null;

    if (isMain) {
      const phraseIdx = Math.floor(Math.random() * MAIN_PHRASES.length);
      const label = new Text({
        text: MAIN_PHRASES[phraseIdx],
        style: new TextStyle({
          fontFamily: "'Rock Salt', cursive",
          fontSize:   38,
          fill:       TAPE_BLACK,
          align:      "center",
          padding:    20,
          letterSpacing: 3,
        }),
      });
      label.anchor.set(0.5);
      container.addChild(label);
      mainText = label;
    } else {
      // Repeating CAUTION text centred on small tape
      const cautionStr = randomFrom(CAUTION_TEXTS);
      const label = new Text({
        text: cautionStr,
        style: new TextStyle({
          fontFamily: "'Silkscreen', monospace",
          fontSize:   height * 0.38,
          fill:       TAPE_BLACK,
          align:      "center",
          padding:    10,
          letterSpacing: 2,
        }),
      });
      label.anchor.set(0.5);
      container.addChild(label);
    }

    this.tapeCont.addChild(container);

    this.tapes.push({
      container,
      mainText,
      baseCX:      cx,
      baseCY:      cy,
      baseAngle:   angle,
      bounceAmp,
      bounceFreq,
      bouncePhase: Math.random() * Math.PI * 2,
      wobbleAmp,
      wobbleFreq,
      wobblePhase: Math.random() * Math.PI * 2,
      isMain,
      phraseTimer: 8.0 + Math.random() * 7.0,
      phraseIdx:   Math.floor(Math.random() * MAIN_PHRASES.length),
    });
  }

  // ── Tape update ────────────────────────────────────────────────────────────

  private updateTapes(dt: number): void {
    for (const tape of this.tapes) {
      tape.bouncePhase += tape.bounceFreq * dt;
      tape.wobblePhase += tape.wobbleFreq * dt;

      // Bounce perpendicular to tape direction
      const offset = Math.sin(tape.bouncePhase) * tape.bounceAmp;
      const perpX  = -Math.sin(tape.baseAngle) * offset;
      const perpY  =  Math.cos(tape.baseAngle) * offset;

      tape.container.x        = tape.baseCX + perpX;
      tape.container.y        = tape.baseCY + perpY;
      tape.container.rotation = tape.baseAngle + Math.sin(tape.wobblePhase) * tape.wobbleAmp;

      // Cycle main phrase
      if (tape.isMain && tape.mainText) {
        tape.phraseTimer -= dt;
        if (tape.phraseTimer <= 0) {
          tape.phraseTimer = 8.0 + Math.random() * 7.0;
          tape.phraseIdx   = (tape.phraseIdx + 1) % MAIN_PHRASES.length;
          tape.mainText.text = MAIN_PHRASES[tape.phraseIdx];
        }

        // Subtle alpha flicker on main tape text
        tape.mainText.alpha = 0.85 + 0.15 * Math.sin(this.time * 2.1);
      }
    }
  }

  // ── Network dots ──────────────────────────────────────────────────────────

  private spawnNetDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < NET_DOT_COUNT; i++) {
      this.netDots.push({
        x:     (Math.random() - 0.5) * hw * 1.8,
        y:     (Math.random() - 0.5) * hh * 1.8,
        vx:    (Math.random() - 0.5) * 18,
        vy:    (Math.random() - 0.5) * 18,
        size:  1.0 + Math.random() * 2.0,
        color: randomFrom(PARTICLE_PALETTE),
        alpha: 0.15 + Math.random() * 0.30,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private drawNetwork(dt: number): void {
    this.netGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5, hh = this.h * 0.5;

    for (const d of this.netDots) {
      d.vx *= 0.985; d.vy *= 0.985;
      d.x  += d.vx * dt; d.y += d.vy * dt;
      if (d.x >  hw - 8) { d.x =  hw - 8; d.vx *= -0.8; }
      if (d.x < -hw + 8) { d.x = -hw + 8; d.vx *= -0.8; }
      if (d.y >  hh - 8) { d.y =  hh - 8; d.vy *= -0.8; }
      if (d.y < -hh + 8) { d.y = -hh + 8; d.vy *= -0.8; }
    }

    for (let i = 0; i < this.netDots.length; i++) {
      const a = this.netDots[i];
      for (let j = i + 1; j < this.netDots.length; j++) {
        const b    = this.netDots[j];
        const dx   = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= NET_MAX_DIST) continue;
        const t   = 1 - dist / NET_MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        this.netGfx.moveTo(a.x, a.y).lineTo(b.x, b.y)
          .stroke({ color: col, alpha: t * t * 0.20, width: 0.4 + t * 0.6, cap: "round" });
      }
    }

    for (const d of this.netDots) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.1 + d.phase);
      const a  = d.alpha * tw;
      this.netGfx.circle(d.x, d.y, d.size * 3.0).fill({ color: d.color, alpha: a * 0.08 });
      this.netGfx.circle(d.x, d.y, d.size).fill({ color: d.color, alpha: Math.min(1, a) });
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x:            (Math.random() - 0.5) * hw * 2,
        y:            (Math.random() - 0.5) * hh * 2,
        vx:           (Math.random() - 0.5) * 18,
        vy:           (Math.random() - 0.5) * 18 - 4,
        size:         0.4 + Math.random() * 2.0,
        alpha:        0.10 + Math.random() * 0.40,
        color:        randomFrom(PARTICLE_PALETTE),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2.0,
      });
    }
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5, hh = this.h * 0.5;

    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x >  hw + 30) p.x = -hw - 30;
      if (p.x < -hw - 30) p.x =  hw + 30;
      if (p.y >  hh + 30) p.y = -hh - 30;
      if (p.y < -hh - 30) p.y =  hh + 30;

      p.twinklePhase += p.twinkleSpeed * dt;
      const tw = 0.30 + 0.70 * Math.abs(Math.sin(p.twinklePhase));
      const a  = p.alpha * tw;

      this.particleGfx.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: Math.min(1, a) });
      if (p.size > 1.0) {
        this.particleGfx.circle(p.x, p.y, p.size * 2.8).fill({ color: p.color, alpha: a * 0.12 });
      }
    }
  }
}
