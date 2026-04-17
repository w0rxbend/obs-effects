import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const TAPE_YELLOW = 0xf9e2af; // Catppuccin Mocha Yellow
const TAPE_BLACK = 0x11111b; // Catppuccin Mocha Crust
const CATT_MAUVE = 0xcba6f7;
const CATT_PINK = 0xf38ba8;
const CATT_PEACH = 0xfab387;
const CATT_SKY = 0x89dceb;
const CATT_YELLOW = 0xf9e2af;
const WHITE = 0xffffff;
// Yellow-family variants for the new effects
const CATT_GOLD = 0xe6c07b;
const CATT_AMBER = 0xd4a04a;
const CATT_LEMON = 0xfff0a0;
const CATT_BUTTER = 0xfde8b0;
const CATT_HONEY = 0xf2c97a;
// Fire ramp: dark core → hot yellow tip
const FIRE_RED = 0xe64553; // Catppuccin Maroon-ish
const FIRE_ORANGE = 0xfe640b; // Catppuccin Flamingo-orange
const FIRE_YELLOW = 0xdf8e1d; // Catppuccin Yellow-orange
const FIRE_TIP = 0xfff0a0; // pale lemon tip

const PARTICLE_PALETTE = [
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_SKY,
  CATT_YELLOW,
  WHITE,
] as const;

const YELLOW_PALETTE = [
  CATT_YELLOW,
  CATT_GOLD,
  CATT_AMBER,
  CATT_LEMON,
  CATT_BUTTER,
  CATT_HONEY,
  CATT_PEACH,
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

const SEPARATORS = [" ★ ", " // ", " >> ", " :: ", " ## ", " ** ", " -- "] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const NET_DOT_COUNT = 45;
const NET_MAX_DIST = 180;
const PARTICLE_COUNT = 140;
const RAIN_COUNT = 90;
const METEOR_COUNT = 6;
const SPARK_COUNT = 60;
const STAIN_COUNT = 12;
const DROP_COUNT = 40;
const YELLOW_DOT_COUNT = 55;
const FIRE_PARTICLE_COUNT = 420;
const MOVING_LINE_COUNT = 28;
const PULSE_DOT_COUNT = 22;
const ORBIT_GROUP_COUNT = 6;
// Local half-width of each tape (must reach screen edges from centre at any rotation)
const TAPE_HW = 1400;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TapeObj {
  container: Container;
  labelA: Text;
  labelB: Text;
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
  // per-label fade state (0 = invisible, 1 = fully visible)
  fadeA: number;
  fadeB: number;
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

interface RainDrop {
  x: number;
  y: number;
  vy: number;
  length: number;
  alpha: number;
  color: number;
  width: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  alpha: number;
  color: number;
  life: number;
  maxLife: number;
  trailAlpha: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  gravity: number;
}

interface StainBlob {
  dx: number; // offset from stain centre
  dy: number;
  r: number; // current radius
  baseR: number; // rest radius
  pulsePhase: number;
  pulseSpeed: number;
  pulseAmp: number; // fraction of baseR
  driftVx: number; // slow drift velocity
  driftVy: number;
  colorB: number; // secondary color for lerp
  colorPhase: number;
  colorSpeed: number;
}

interface Stain {
  x: number;
  y: number;
  alpha: number;
  color: number;
  blobs: StainBlob[];
}

interface Drop {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  splat: number; // 0 = falling, >0 = splatting (radius grows)
  splatMax: number;
}

interface FireParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  baseX: number; // emitter x anchor
  baseY: number; // emitter y anchor
}

interface FireworkShell {
  x: number;
  y: number;
  vy: number; // rising velocity (negative = up)
  life: number;
  maxLife: number;
  burst: boolean; // has it exploded yet
  color: number;
  trailParticles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }>;
}

interface MovingLine {
  x: number; // leading edge x (in screen coords, centre-origin)
  y: number;
  angle: number; // radians
  length: number;
  speed: number; // px/s along angle direction
  alpha: number;
  color: number;
  width: number;
}

interface PulseDot {
  x: number;
  y: number;
  baseR: number;
  pulseAmp: number; // fraction of baseR
  pulsePhase: number;
  pulseSpeed: number;
  alpha: number;
  color: number;
  colorB: number;
  colorPhase: number;
  colorSpeed: number;
  ringAlpha: number; // outer ring opacity multiplier
}

interface OrbitDot {
  angle: number; // current orbital angle
  speed: number; // rad/s
  radius: number; // orbit radius
  size: number;
  trailLen: number; // number of ghost circles in trail
  alpha: number;
  color: number;
}

interface OrbitGroup {
  cx: number;
  cy: number;
  dots: OrbitDot[];
}

interface YellowDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  phase: number;
  speed: number;
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
  public static assetBundles: string[] = [];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly bgGfx = new Graphics();
  private readonly stainGfx = new Graphics();
  private readonly netGfx = new Graphics();
  private readonly rainGfx = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly dropGfx = new Graphics();
  private readonly yellowDotGfx = new Graphics();
  private readonly meteorGfx = new Graphics();
  private readonly sparkGfx = new Graphics();
  private readonly fireGfx = new Graphics();
  private readonly fireworkGfx = new Graphics();
  private readonly lineGfx = new Graphics();
  private readonly pulseDotGfx = new Graphics();
  private readonly orbitGfx = new Graphics();
  private readonly tapeCont = new Container();

  private readonly tapes: TapeObj[] = [];
  private readonly netDots: NetDot[] = [];
  private readonly particles: Particle[] = [];
  private readonly rainDrops: RainDrop[] = [];
  private readonly meteors: Meteor[] = [];
  private readonly sparks: Spark[] = [];
  private readonly stains: Stain[] = [];
  private readonly drops: Drop[] = [];
  private readonly yellowDots: YellowDot[] = [];
  private readonly fireParticles: FireParticle[] = [];
  private readonly fireworks: FireworkShell[] = [];
  private readonly movingLines: MovingLine[] = [];
  private readonly pulseDots: PulseDot[] = [];
  private readonly orbitGroups: OrbitGroup[] = [];
  private fireworkTimer = 0;

  private time = 0;
  private w = 0;
  private h = 0;
  private sparkTimer = 0;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.stainGfx);
    this.addChild(this.netGfx);
    this.addChild(this.rainGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.dropGfx);
    this.addChild(this.yellowDotGfx);
    this.addChild(this.meteorGfx);
    this.addChild(this.sparkGfx);
    this.addChild(this.fireGfx);
    this.addChild(this.fireworkGfx);
    this.addChild(this.lineGfx);
    this.addChild(this.pulseDotGfx);
    this.addChild(this.orbitGfx);
    this.addChild(this.tapeCont);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.spawnNetDots();
    this.spawnParticles();
    this.spawnRain();
    this.spawnMeteors();
    this.spawnYellowDots();
    this.spawnDrops();
    this.buildStains();
    this.spawnFire();
    this.spawnMovingLines();
    this.spawnPulseDots();
    this.spawnOrbitGroups();
    this.createTapes();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    const breathe = 1 + 0.025 * Math.sin(this.time * 0.5);
    this.drawBackground(breathe);
    this.drawStains(dt);
    this.drawNetwork(dt);
    this.drawRain(dt);
    this.drawParticles(dt);
    this.drawDrops(dt);
    this.drawYellowDots(dt);
    this.drawMeteors(dt);
    this.drawSparks(dt);
    this.drawFire(dt);
    this.drawFireworks(dt);
    this.drawMovingLines(dt);
    this.drawPulseDots(dt);
    this.drawOrbitGroups(dt);
    this.updateTapes(dt);

    // Periodically burst new sparks
    this.sparkTimer += dt;
    if (this.sparkTimer > 1.2) {
      this.sparkTimer = 0;
      this.burstSparks();
    }

    // Periodically launch new firework
    this.fireworkTimer += dt;
    if (this.fireworkTimer > 2.5 + Math.random() * 2) {
      this.fireworkTimer = 0;
      this.launchFirework();
    }
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
      {
        cx: 0,
        cy: 0,
        angle: (Math.random() - 0.5) * 0.06,
        height: 160,
        isMain: true,
        bounceAmp: 22,
        bounceFreq: 0.38,
        wobbleAmp: 0.012,
        wobbleFreq: 0.22,
        scrollSpeed: 220,
      },
      // Secondary tapes — scattered, various angles
      {
        cx: -0.05,
        cy: -0.52,
        angle: 0.38,
        height: 110,
        isMain: false,
        bounceAmp: 14,
        bounceFreq: 0.31,
        wobbleAmp: 0.018,
        wobbleFreq: 0.27,
        scrollSpeed: -170,
      },
      {
        cx: 0.08,
        cy: 0.55,
        angle: -0.28,
        height: 100,
        isMain: false,
        bounceAmp: 16,
        bounceFreq: 0.27,
        wobbleAmp: 0.021,
        wobbleFreq: 0.19,
        scrollSpeed: 150,
      },
      {
        cx: -0.18,
        cy: -0.26,
        angle: 0.72,
        height: 115,
        isMain: false,
        bounceAmp: 12,
        bounceFreq: 0.42,
        wobbleAmp: 0.016,
        wobbleFreq: 0.31,
        scrollSpeed: -200,
      },
      {
        cx: 0.22,
        cy: 0.3,
        angle: -0.55,
        height: 105,
        isMain: false,
        bounceAmp: 18,
        bounceFreq: 0.35,
        wobbleAmp: 0.02,
        wobbleFreq: 0.24,
        scrollSpeed: 130,
      },
      {
        cx: -0.08,
        cy: 0.65,
        angle: 0.18,
        height: 120,
        isMain: false,
        bounceAmp: 10,
        bounceFreq: 0.29,
        wobbleAmp: 0.014,
        wobbleFreq: 0.22,
        scrollSpeed: -180,
      },
      {
        cx: 0.04,
        cy: -0.68,
        angle: -0.42,
        height: 108,
        isMain: false,
        bounceAmp: 20,
        bounceFreq: 0.44,
        wobbleAmp: 0.022,
        wobbleFreq: 0.33,
        scrollSpeed: 240,
      },
      {
        cx: -0.14,
        cy: 0.14,
        angle: 1.1,
        height: 100,
        isMain: false,
        bounceAmp: 13,
        bounceFreq: 0.33,
        wobbleAmp: 0.019,
        wobbleFreq: 0.28,
        scrollSpeed: -140,
      },
      {
        cx: 0.18,
        cy: -0.4,
        angle: -0.88,
        height: 112,
        isMain: false,
        bounceAmp: 17,
        bounceFreq: 0.38,
        wobbleAmp: 0.017,
        wobbleFreq: 0.2,
        scrollSpeed: 190,
      },
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
    this.tapeCont.setChildIndex(
      this.tapes[0].container,
      this.tapeCont.children.length - 1,
    );
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
    const {
      cx,
      cy,
      angle,
      height,
      isMain,
      bounceAmp,
      bounceFreq,
      wobbleAmp,
      wobbleFreq,
      scrollSpeed,
    } = opts;
    const hh = height * 0.5;

    const container = new Container();
    container.x = cx;
    container.y = cy;
    container.rotation = angle;

    const g = buildTapeGraphics(hh);
    container.addChild(g);

    const fontSize = isMain ? 52 : Math.round(height * 0.4);
    const phrase = randomFrom(MAIN_PHRASES);

    // Silkscreen monospace: ~0.62em per char. Keep each label to 2 repeats to stay well under
    // the 4096px WebGL texture limit — two labels side-by-side give seamless infinite scroll.
    const charPx = fontSize * 0.62;

    const txtFont = `'Silkscreen', monospace`;
    const sep = randomFrom(SEPARATORS);
    const chunkHtml = phrase + sep;

    // Estimate chunk width: phrase chars + separator chars
    const chunkCharEstimate = phrase.length + sep.length;
    const labelWidth = chunkCharEstimate * charPx * 2;

    const makeLabel = (): Text => {
      const t = new Text({
        text: chunkHtml.repeat(2),
        style: new TextStyle({
          fontFamily: txtFont,
          fontSize,
          fill: TAPE_BLACK,
          align: "left",
          padding: 12,
          letterSpacing: isMain ? 3 : 2,
        }),
      });
      t.anchor.set(0, 0.5);
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
      fadeA: 1,
      fadeB: 1,
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

      // Fade each label in/out based on proximity to the tape edges
      const FADE_ZONE = 320;
      const edgeFade = (lx: number) => {
        const cx = lx + tape.labelWidth * 0.5;
        const dist = TAPE_HW - Math.abs(cx);
        return Math.max(0, Math.min(1, dist / FADE_ZONE));
      };
      tape.fadeA += (edgeFade(tape.labelA.x) - tape.fadeA) * Math.min(1, dt * 8);
      tape.fadeB += (edgeFade(tape.labelB.x) - tape.fadeB) * Math.min(1, dt * 8);

      const breathe = tape.isMain ? 0.85 + 0.15 * Math.sin(this.time * 2.1) : 1;
      tape.labelA.alpha = tape.fadeA * breathe;
      tape.labelB.alpha = tape.fadeB * breathe;
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

  // ── Rain ──────────────────────────────────────────────────────────────────

  private spawnRain(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * hw * 2.2,
        y: (Math.random() - 0.5) * hh * 2,
        vy: 180 + Math.random() * 280,
        length: 8 + Math.random() * 22,
        alpha: 0.08 + Math.random() * 0.18,
        color: randomFrom(YELLOW_PALETTE),
        width: 0.5 + Math.random() * 1.2,
      });
    }
  }

  private drawRain(dt: number): void {
    this.rainGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (const r of this.rainDrops) {
      r.y += r.vy * dt;
      if (r.y - r.length > hh + 20) r.y = -hh - 20;
      this.rainGfx
        .moveTo(r.x, r.y)
        .lineTo(r.x + r.length * 0.18, r.y - r.length)
        .stroke({
          color: r.color,
          alpha: r.alpha,
          width: r.width,
          cap: "round",
        });
    }
    void hw;
  }

  // ── Meteors / comets ──────────────────────────────────────────────────────

  private spawnMeteors(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < METEOR_COUNT; i++) {
      this.meteors.push(this.makeMeteor(hw, hh));
    }
  }

  private makeMeteor(hw: number, hh: number): Meteor {
    const maxLife = 1.2 + Math.random() * 2.0;
    const speed = 400 + Math.random() * 500;
    const angle = Math.PI * 0.18 + Math.random() * 0.22;
    return {
      x: -hw + Math.random() * hw * 2,
      y: -hh + Math.random() * hh * 0.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: 60 + Math.random() * 100,
      alpha: 0.5 + Math.random() * 0.5,
      color: randomFrom(YELLOW_PALETTE),
      life: Math.random() * maxLife,
      maxLife,
      trailAlpha: 0.3 + Math.random() * 0.3,
    };
  }

  private drawMeteors(dt: number): void {
    this.meteorGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (const m of this.meteors) {
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life > m.maxLife || m.x > hw + 200 || m.y > hh + 200) {
        Object.assign(m, this.makeMeteor(hw, hh));
        m.life = 0;
      }
      const prog = m.life / m.maxLife;
      const a = m.alpha * (1 - prog);
      const dx = -m.vx / Math.hypot(m.vx, m.vy);
      const dy = -m.vy / Math.hypot(m.vx, m.vy);
      // Head glow
      this.meteorGfx.circle(m.x, m.y, 3.5).fill({ color: m.color, alpha: a });
      this.meteorGfx
        .circle(m.x, m.y, 7)
        .fill({ color: m.color, alpha: a * 0.3 });
      // Trail
      const tx = m.x + dx * m.length;
      const ty = m.y + dy * m.length;
      this.meteorGfx
        .moveTo(m.x, m.y)
        .lineTo(tx, ty)
        .stroke({
          color: m.color,
          alpha: m.trailAlpha * (1 - prog),
          width: 1.8,
          cap: "round",
        });
    }
  }

  // ── Sparks ────────────────────────────────────────────────────────────────

  private burstSparks(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    const ox = (Math.random() - 0.5) * hw * 1.4;
    const oy = (Math.random() - 0.5) * hh * 1.4;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 220;
      this.sparks.push({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.8,
        size: 0.8 + Math.random() * 2.0,
        color: randomFrom(YELLOW_PALETTE),
        gravity: 80 + Math.random() * 120,
      });
    }
  }

  private drawSparks(dt: number): void {
    this.sparkGfx.clear();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const prog = s.life / s.maxLife;
      const a = (1 - prog) * 0.9;
      this.sparkGfx
        .circle(s.x, s.y, s.size * (1 - prog * 0.5))
        .fill({ color: s.color, alpha: a });
      if (s.size > 1.2)
        this.sparkGfx
          .circle(s.x, s.y, s.size * 2.5)
          .fill({ color: s.color, alpha: a * 0.18 });
    }
  }

  // ── Stains ────────────────────────────────────────────────────────────────

  private buildStains(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < STAIN_COUNT; i++) {
      const spread = 40 + Math.random() * 90;
      const color = randomFrom(YELLOW_PALETTE);
      const blobs: StainBlob[] = [];
      const blobCount = 5 + Math.floor(Math.random() * 7);
      for (let b = 0; b < blobCount; b++) {
        const baseR = spread * (0.25 + Math.random() * 0.55);
        blobs.push({
          dx: (Math.random() - 0.5) * spread * 1.6,
          dy: (Math.random() - 0.5) * spread * 1.0,
          r: baseR,
          baseR,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.3 + Math.random() * 0.8,
          pulseAmp: 0.08 + Math.random() * 0.18,
          driftVx: (Math.random() - 0.5) * 5,
          driftVy: (Math.random() - 0.5) * 3,
          colorB: randomFrom(YELLOW_PALETTE),
          colorPhase: Math.random() * Math.PI * 2,
          colorSpeed: 0.15 + Math.random() * 0.35,
        });
      }
      this.stains.push({
        x: (Math.random() - 0.5) * hw * 1.8,
        y: (Math.random() - 0.5) * hh * 1.8,
        alpha: 0.055 + Math.random() * 0.11,
        color,
        blobs,
      });
    }
  }

  private drawStains(dt: number): void {
    this.stainGfx.clear();
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (const s of this.stains) {
      for (const b of s.blobs) {
        b.pulsePhase += b.pulseSpeed * dt;
        b.colorPhase += b.colorSpeed * dt;
        b.dx += b.driftVx * dt;
        b.dy += b.driftVy * dt;
        // Soft boundary: push blobs back toward centre
        const dist = Math.hypot(b.dx, b.dy);
        const maxDist = hw * 0.55;
        if (dist > maxDist) {
          b.dx *= 0.98;
          b.dy *= 0.98;
          b.driftVx *= -0.5;
          b.driftVy *= -0.5;
        }
        b.r = b.baseR * (1 + Math.sin(b.pulsePhase) * b.pulseAmp);
        const col = lerpColor(
          s.color,
          b.colorB,
          Math.sin(b.colorPhase) * 0.5 + 0.5,
        );
        // Outer soft halo
        this.stainGfx
          .circle(s.x + b.dx, s.y + b.dy, b.r * 1.7)
          .fill({ color: col, alpha: s.alpha * 0.3 });
        // Core blob
        this.stainGfx
          .circle(s.x + b.dx, s.y + b.dy, b.r)
          .fill({ color: col, alpha: s.alpha });
      }
    }
    void hw;
    void hh;
  }

  // ── Drops ─────────────────────────────────────────────────────────────────

  private spawnDrops(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < DROP_COUNT; i++) {
      this.drops.push(this.makeDrop(hw, hh, true));
    }
  }

  private makeDrop(hw: number, hh: number, randomY = false): Drop {
    const splatMax = 6 + Math.random() * 14;
    return {
      x: (Math.random() - 0.5) * hw * 2,
      y: randomY ? (Math.random() - 0.5) * hh * 2 : -hh - 10,
      vy: 200 + Math.random() * 300,
      size: 2 + Math.random() * 4,
      alpha: 0.25 + Math.random() * 0.45,
      color: randomFrom(YELLOW_PALETTE),
      splat: 0,
      splatMax,
    };
  }

  private drawDrops(dt: number): void {
    this.dropGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      if (d.splat > 0) {
        d.splat += dt * 60;
        const a = d.alpha * (1 - d.splat / d.splatMax);
        if (a <= 0) {
          this.drops[i] = this.makeDrop(hw, hh);
          continue;
        }
        this.dropGfx
          .circle(d.x, d.y, d.splat)
          .stroke({ color: d.color, alpha: a, width: 1 });
      } else {
        d.y += d.vy * dt;
        this.dropGfx
          .ellipse(d.x, d.y, d.size * 0.5, d.size)
          .fill({ color: d.color, alpha: d.alpha });
        if (d.y > hh + d.size) d.splat = 1;
      }
    }
  }

  // ── Yellow dots ───────────────────────────────────────────────────────────

  private spawnYellowDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < YELLOW_DOT_COUNT; i++) {
      this.yellowDots.push({
        x: (Math.random() - 0.5) * hw * 2,
        y: (Math.random() - 0.5) * hh * 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        size: 1.5 + Math.random() * 4.5,
        alpha: 0.18 + Math.random() * 0.5,
        color: randomFrom(YELLOW_PALETTE),
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
      });
    }
  }

  private drawYellowDots(dt: number): void {
    this.yellowDotGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (const d of this.yellowDots) {
      d.phase += d.speed * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x > hw + 20) d.x = -hw - 20;
      if (d.x < -hw - 20) d.x = hw + 20;
      if (d.y > hh + 20) d.y = -hh - 20;
      if (d.y < -hh - 20) d.y = hh + 20;
      const pulse = 0.55 + 0.45 * Math.sin(d.phase);
      const a = d.alpha * pulse;
      this.yellowDotGfx
        .circle(d.x, d.y, d.size)
        .fill({ color: d.color, alpha: Math.min(1, a) });
      this.yellowDotGfx
        .circle(d.x, d.y, d.size * 2.6)
        .fill({ color: d.color, alpha: a * 0.1 });
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

  // ── Fire ──────────────────────────────────────────────────────────────────

  private spawnFire(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    // Seven fire columns spread across the full bottom edge
    const emitters = [
      -hw * 0.85,
      -hw * 0.55,
      -hw * 0.25,
      0,
      hw * 0.25,
      hw * 0.55,
      hw * 0.85,
    ];
    for (const bx of emitters) {
      for (let i = 0; i < FIRE_PARTICLE_COUNT / emitters.length; i++) {
        this.fireParticles.push(this.makeFireParticle(bx, hh, true));
      }
    }
  }

  private makeFireParticle(
    baseX: number,
    baseY: number,
    randomY = false,
  ): FireParticle {
    const maxLife = 1.2 + Math.random() * 2.0;
    return {
      baseX,
      baseY,
      x: baseX + (Math.random() - 0.5) * 80,
      y: randomY ? baseY - Math.random() * 420 : baseY,
      vx: (Math.random() - 0.5) * 32,
      vy: -(140 + Math.random() * 260),
      life: randomY ? Math.random() * maxLife : 0,
      maxLife,
      size: 4 + Math.random() * Math.random() * 60,
    };
  }

  private drawFire(dt: number): void {
    this.fireGfx.clear();
    if (this.w === 0) return;
    const hh = this.h * 0.5;

    for (const p of this.fireParticles) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        Object.assign(p, this.makeFireParticle(p.baseX, p.baseY));
        continue;
      }
      p.x += p.vx * dt;
      p.vy -= 20 * dt; // slight upward acceleration
      p.y += p.vy * dt;
      p.vx *= 0.98;

      const prog = p.life / p.maxLife; // 0 = born, 1 = dead
      const size = p.size * (1 - prog * 0.6);

      // Color ramp: red → orange → yellow → tip (white-ish lemon)
      let col: number;
      if (prog < 0.33) {
        col = lerpColor(FIRE_RED, FIRE_ORANGE, prog / 0.33);
      } else if (prog < 0.66) {
        col = lerpColor(FIRE_ORANGE, FIRE_YELLOW, (prog - 0.33) / 0.33);
      } else {
        col = lerpColor(FIRE_YELLOW, FIRE_TIP, (prog - 0.66) / 0.34);
      }

      const a = (1 - prog) * 0.55;
      // Soft outer glow
      this.fireGfx
        .circle(p.x, p.y, size * 1.8)
        .fill({ color: col, alpha: a * 0.2 });
      // Core flame blob
      this.fireGfx.circle(p.x, p.y, size).fill({ color: col, alpha: a });
    }

    void hh;
  }

  // ── Fireworks ─────────────────────────────────────────────────────────────

  private launchFirework(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    this.fireworks.push({
      x: (Math.random() - 0.5) * hw * 1.6,
      y: hh * 0.1 + Math.random() * hh * 0.5, // burst anywhere in upper-mid area
      vy: 0,
      life: 0,
      maxLife: 1.8 + Math.random() * 1.0,
      burst: true, // spawn already burst
      color: randomFrom(YELLOW_PALETTE),
      trailParticles: this.makeBurst(
        (Math.random() - 0.5) * hw * 1.6,
        hh * 0.1 + Math.random() * hh * 0.5,
      ),
    });
  }

  private makeBurst(x: number, y: number): FireworkShell["trailParticles"] {
    const count = 55 + Math.floor(Math.random() * 40);
    const particles: FireworkShell["trailParticles"] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 80 + Math.random() * 220;
      const maxLife = 0.8 + Math.random() * 0.9;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife,
        size: 1.2 + Math.random() * 3.0,
      });
    }
    return particles;
  }

  private drawFireworks(dt: number): void {
    this.fireworkGfx.clear();

    for (let fi = this.fireworks.length - 1; fi >= 0; fi--) {
      const fw = this.fireworks[fi];
      fw.life += dt;

      let allDead = true;
      for (const p of fw.trailParticles) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        allDead = false;
        p.vy += 60 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;

        const prog = p.life / p.maxLife;
        const col = lerpColor(
          fw.color,
          FIRE_TIP,
          prog < 0.5 ? 0 : (prog - 0.5) * 2,
        );
        const a = (1 - prog) * 0.9;
        this.fireworkGfx
          .circle(p.x, p.y, p.size * (1 - prog * 0.5))
          .fill({ color: col, alpha: a });
        if (p.size > 1.8) {
          this.fireworkGfx
            .circle(p.x, p.y, p.size * 2.8)
            .fill({ color: col, alpha: a * 0.15 });
        }
      }

      if (allDead || fw.life > fw.maxLife) {
        this.fireworks.splice(fi, 1);
      }
    }
  }

  // ── Moving lines ──────────────────────────────────────────────────────────

  private spawnMovingLines(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < MOVING_LINE_COUNT; i++) {
      this.movingLines.push(this.makeMovingLine(hw, hh, true));
    }
  }

  private makeMovingLine(hw: number, hh: number, scatter = false): MovingLine {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 160;
    // Start at a random edge position
    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;
    if (scatter) {
      x = (Math.random() - 0.5) * hw * 2.2;
      y = (Math.random() - 0.5) * hh * 2.2;
    } else {
      if (side === 0) {
        x = -hw - 20;
        y = (Math.random() - 0.5) * hh * 2;
      } else if (side === 1) {
        x = hw + 20;
        y = (Math.random() - 0.5) * hh * 2;
      } else if (side === 2) {
        x = (Math.random() - 0.5) * hw * 2;
        y = -hh - 20;
      } else {
        x = (Math.random() - 0.5) * hw * 2;
        y = hh + 20;
      }
    }
    return {
      x,
      y,
      angle,
      length: 60 + Math.random() * 200,
      speed,
      alpha: 0.06 + Math.random() * 0.18,
      color: randomFrom(YELLOW_PALETTE),
      width: 0.5 + Math.random() * 2.0,
    };
  }

  private drawMovingLines(dt: number): void {
    this.lineGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    const pad = 300;
    for (let i = 0; i < this.movingLines.length; i++) {
      const l = this.movingLines[i];
      l.x += Math.cos(l.angle) * l.speed * dt;
      l.y += Math.sin(l.angle) * l.speed * dt;
      if (
        l.x > hw + pad ||
        l.x < -hw - pad ||
        l.y > hh + pad ||
        l.y < -hh - pad
      ) {
        this.movingLines[i] = this.makeMovingLine(hw, hh);
      }
      const tx = l.x - Math.cos(l.angle) * l.length;
      const ty = l.y - Math.sin(l.angle) * l.length;
      // Gradient: bright head fading to transparent tail
      this.lineGfx
        .moveTo(l.x, l.y)
        .lineTo(tx, ty)
        .stroke({
          color: l.color,
          alpha: l.alpha,
          width: l.width,
          cap: "round",
        });
      // Bright head dot
      this.lineGfx
        .circle(l.x, l.y, l.width * 1.8)
        .fill({ color: l.color, alpha: l.alpha * 1.4 });
    }
  }

  // ── Pulsating dots ────────────────────────────────────────────────────────

  private spawnPulseDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PULSE_DOT_COUNT; i++) {
      const color = randomFrom(YELLOW_PALETTE);
      this.pulseDots.push({
        x: (Math.random() - 0.5) * hw * 1.9,
        y: (Math.random() - 0.5) * hh * 1.9,
        baseR: 4 + Math.random() * 18,
        pulseAmp: 0.25 + Math.random() * 0.55,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.5 + Math.random() * 2.5,
        alpha: 0.25 + Math.random() * 0.5,
        color,
        colorB: randomFrom(YELLOW_PALETTE),
        colorPhase: Math.random() * Math.PI * 2,
        colorSpeed: 0.2 + Math.random() * 0.6,
        ringAlpha: 0.3 + Math.random() * 0.5,
      });
    }
  }

  private drawPulseDots(dt: number): void {
    this.pulseDotGfx.clear();
    if (this.w === 0) return;
    for (const d of this.pulseDots) {
      d.pulsePhase += d.pulseSpeed * dt;
      d.colorPhase += d.colorSpeed * dt;
      const pulse = 1 + Math.sin(d.pulsePhase) * d.pulseAmp;
      const r = d.baseR * pulse;
      const col = lerpColor(
        d.color,
        d.colorB,
        Math.sin(d.colorPhase) * 0.5 + 0.5,
      );
      // Outermost soft halo (3 rings)
      this.pulseDotGfx
        .circle(d.x, d.y, r * 3.5)
        .fill({ color: col, alpha: d.alpha * 0.05 });
      this.pulseDotGfx
        .circle(d.x, d.y, r * 2.2)
        .fill({ color: col, alpha: d.alpha * 0.12 });
      // Sharp ring outline that breathes
      this.pulseDotGfx
        .circle(d.x, d.y, r * 1.6)
        .stroke({ color: col, alpha: d.alpha * d.ringAlpha, width: 0.8 });
      // Solid core
      this.pulseDotGfx.circle(d.x, d.y, r).fill({ color: col, alpha: d.alpha });
      // Bright centre highlight
      this.pulseDotGfx
        .circle(d.x, d.y, r * 0.35)
        .fill({ color: 0xffffff, alpha: d.alpha * 0.4 });
    }
  }

  // ── Orbit groups ──────────────────────────────────────────────────────────

  private spawnOrbitGroups(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < ORBIT_GROUP_COUNT; i++) {
      const dotCount = 2 + Math.floor(Math.random() * 4);
      const dots: OrbitDot[] = [];
      for (let d = 0; d < dotCount; d++) {
        dots.push({
          angle: (d / dotCount) * Math.PI * 2,
          speed: (0.4 + Math.random() * 1.2) * (Math.random() < 0.5 ? 1 : -1),
          radius: 30 + Math.random() * 90,
          size: 2 + Math.random() * 5,
          trailLen: 8 + Math.floor(Math.random() * 14),
          alpha: 0.3 + Math.random() * 0.5,
          color: randomFrom(YELLOW_PALETTE),
        });
      }
      this.orbitGroups.push({
        cx: (Math.random() - 0.5) * hw * 1.7,
        cy: (Math.random() - 0.5) * hh * 1.7,
        dots,
      });
    }
  }

  private drawOrbitGroups(dt: number): void {
    this.orbitGfx.clear();
    if (this.w === 0) return;
    for (const g of this.orbitGroups) {
      for (const d of g.dots) {
        d.angle += d.speed * dt;
        const cx = g.cx + Math.cos(d.angle) * d.radius;
        const cy = g.cy + Math.sin(d.angle) * d.radius;
        // Draw faded trail as ghost circles stepping back along the orbit
        for (let t = 1; t <= d.trailLen; t++) {
          const ta = d.angle - d.speed * dt * t * 3;
          const tx = g.cx + Math.cos(ta) * d.radius;
          const ty = g.cy + Math.sin(ta) * d.radius;
          const tf = 1 - t / d.trailLen;
          this.orbitGfx
            .circle(tx, ty, d.size * tf * 0.9)
            .fill({ color: d.color, alpha: d.alpha * tf * 0.4 });
        }
        // Head dot with halo
        this.orbitGfx
          .circle(cx, cy, d.size * 2.4)
          .fill({ color: d.color, alpha: d.alpha * 0.15 });
        this.orbitGfx
          .circle(cx, cy, d.size)
          .fill({ color: d.color, alpha: d.alpha });
      }
    }
  }
}
