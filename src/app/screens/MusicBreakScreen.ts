import type { LineCap, Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const CRUST = 0x11111b;
const TOXIC_GREEN = 0x39ff14;
const LOL_VIOLET = 0xc050ff;
const CATT_MAUVE = 0xcba6f7;
const CATT_SKY = 0x89dceb;
const CATT_PEACH = 0xfab387;
const CATT_PINK = 0xf38ba8;
const WHITE = 0xffffff;

// ── Visualizer constants ──────────────────────────────────────────────────────
const BAR_COUNT = 180;
const BASE_RADIUS = 190;
const BAR_MAX_OUT = 150;
const BAR_MAX_IN = 60;
const BAR_W = 1.8;

// ── Beat timing (primary: ~120–240 BPM range) ─────────────────────────────────
const BEAT_MIN = 0.25;
const BEAT_MAX = 0.5;

// ── Particles ─────────────────────────────────────────────────────────────────
const PARTICLE_COUNT = 260;

// ── Rain ──────────────────────────────────────────────────────────────────────
const RAIN_COUNT = 110;

// ── Background network ────────────────────────────────────────────────────────
const NET_DOT_COUNT = 60;
const NET_MAX_DIST = 180; // px — max distance to draw a connection line

// ── Fluid stains ──────────────────────────────────────────────────────────────
const STAIN_COUNT = 7;
const STAIN_VERTS = 80; // enough for silky smooth curves
const STAIN_PASSES = 5; // 3 concentric primary fills + 2 secondary-blob fills

// ── Ring geometry ─────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const RING_STEPS = 120; // vertices of the fluid-background blobs and glitch ring

/**
 * Fixed simulation step, in seconds. This screen is deliberately frame-rate
 * locked: its motion is tuned to a 60 fps step, so reading the real ticker
 * delta would change the tuned timing.
 */
const FIXED_STEP_SECONDS = 1 / 60;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FreqBin {
  value: number;
  target: number;
}

interface DustParticle {
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

interface Ripple {
  radius: number;
  alpha: number;
  color: number;
  speed: number; // expansion speed px/s
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: number;
  size: number;
}

interface GlitchBand {
  y: number;
  height: number;
  shiftX: number;
  alpha: number;
}

interface RainDrop {
  x: number;
  y: number; // current head position (world-space, origin = screen centre)
  vy: number; // fall speed px/s
  vx: number; // horizontal drift px/s (slight wind angle)
  length: number; // trail length px
  width: number; // core stroke width
  color: number; // Catppuccin hue
  alpha: number; // base opacity
  phase: number; // per-drop twinkle offset
}

interface ScratchLine {
  x: number;
  y: number; // start point
  angle: number;
  length: number;
  width: number; // core stroke width — varied boldness
  color: number;
  life: number; // 0..1, starts at 1, decays to 0
  decay: number; // life units lost per second
  fadeIn: number; // 0..1, rises fast then holds
}

interface NetDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  phase: number; // for individual twinkle
}

interface FluidStain {
  cx: number;
  cy: number; // centre position
  vcx: number;
  vcy: number; // slow drift velocity
  baseRadius: number;
  color: number;
  alpha: number; // very low — 0.04..0.10
  // Low-mode Fourier deformation — modes 1, 2, 3 only (smooth blobs)
  modes: Array<{ amp: number; phase: number; speed: number }>;
  // Secondary offset blob (same colour, slight translation) for paint-splash depth
  ox: number;
  oy: number; // offset of secondary centre
  vox: number;
  voy: number; // slow drift of the offset
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Tabulated `sin(k · angle)` / `cos(k · angle)` for one ring of fixed angles. */
interface Harmonic {
  sin: Float64Array;
  cos: Float64Array;
}

/**
 * Build a harmonic lookup table for `count` angles spaced `1 / steps` of a turn
 * apart, starting at `offset`.
 *
 * Every ring in this screen samples the same angles on every frame and only the
 * phase moves, so `sin(k · angle + phase)` is expanded with the angle-sum
 * identity `sin(A + B) = sinA·cosB + cosA·sinB`. The phase's own sine/cosine is
 * then computed once per ring and each vertex costs two table lookups and two
 * multiplies instead of a `Math.sin` call.
 */
function harmonicLut(
  count: number,
  steps: number,
  k: number,
  offset = 0,
): Harmonic {
  const sin = new Float64Array(count);
  const cos = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = k * ((i / steps) * TAU + offset);
    sin[i] = Math.sin(a);
    cos[i] = Math.cos(a);
  }
  return { sin, cos };
}

// Closed rings (last vertex repeats the first) — fluid background + glitch ring
const RING_H1 = harmonicLut(RING_STEPS + 1, RING_STEPS, 1);
const RING_H2 = harmonicLut(RING_STEPS + 1, RING_STEPS, 2);
const RING_H3 = harmonicLut(RING_STEPS + 1, RING_STEPS, 3);
const RING_H4 = harmonicLut(RING_STEPS + 1, RING_STEPS, 4);
const RING_H5 = harmonicLut(RING_STEPS + 1, RING_STEPS, 5);
const RING_H9 = harmonicLut(RING_STEPS + 1, RING_STEPS, 9);
const RING_H11 = harmonicLut(RING_STEPS + 1, RING_STEPS, 11);
const RING_H17 = harmonicLut(RING_STEPS + 1, RING_STEPS, 17);

// Stain outlines — one entry per Fourier mode built in `createStains()`
const STAIN_H: readonly Harmonic[] = [1, 2, 3].map((k) =>
  harmonicLut(STAIN_VERTS + 1, STAIN_VERTS, k),
);

// Visualizer bars — open ring of BAR_COUNT angles starting at -90°
const BAR_OFFSET = -Math.PI / 2;
const BAR_ANGLE = new Float64Array(BAR_COUNT);
for (let i = 0; i < BAR_COUNT; i++) {
  BAR_ANGLE[i] = (i / BAR_COUNT) * TAU + BAR_OFFSET;
}
const BAR_H1 = harmonicLut(BAR_COUNT, BAR_COUNT, 1, BAR_OFFSET);
const BAR_H4 = harmonicLut(BAR_COUNT, BAR_COUNT, 4, BAR_OFFSET);
const BAR_H9 = harmonicLut(BAR_COUNT, BAR_COUNT, 9, BAR_OFFSET);
const BAR_H17 = harmonicLut(BAR_COUNT, BAR_COUNT, 17, BAR_OFFSET);
const BAR_H31 = harmonicLut(BAR_COUNT, BAR_COUNT, 31, BAR_OFFSET);

/**
 * Reusable draw-style records.
 *
 * Pixi copies whatever object is handed to `fill()` / `stroke()` into a fresh
 * internal style before storing it, so the object passed in is never retained.
 * Mutating one shared record per style kind — instead of writing a new object
 * literal at each of the ~2 800 draw calls this screen makes per frame — keeps
 * that many short-lived objects out of every frame.
 */
const FILL_STYLE = { color: WHITE, alpha: 1 };
const STROKE_STYLE: {
  color: number;
  alpha: number;
  width: number;
  cap: LineCap;
} = { color: WHITE, alpha: 1, width: 1, cap: "butt" };

function fillStyle(color: number, alpha: number) {
  FILL_STYLE.color = color;
  FILL_STYLE.alpha = alpha;
  return FILL_STYLE;
}

/** `cap` is always explicit — the record is shared, so it never resets itself. */
function strokeStyle(
  color: number,
  alpha: number,
  width: number,
  cap: LineCap,
) {
  STROKE_STYLE.color = color;
  STROKE_STYLE.alpha = alpha;
  STROKE_STYLE.width = width;
  STROKE_STYLE.cap = cap;
  return STROKE_STYLE;
}

// Full Catppuccin Mocha palette for normal bar colours
const CATT_ALL = [
  0xcba6f7, // mauve
  0xf38ba8, // pink
  0xfab387, // peach
  0xf9e2af, // yellow
  0xa6e3a1, // green
  0x94e2d5, // teal
  0x89dceb, // sky
  0x74c7ec, // sapphire
  0x89b4fa, // blue
  0xb4befe, // lavender
] as const;

// Toxic spike colours (replace normal colour at high amplitude)
const TOXIC_SPIKE = [
  0x39ff14, // toxic green
  0x00ff41, // razer green
  0xffffff, // white flash
  0xc050ff, // violet
  0x7fff00, // chartreuse
] as const;

// Palettes picked from on every beat / glitch frame — hoisted so the pick does
// not rebuild the array each time
const SPARK_COLORS = [
  TOXIC_GREEN,
  LOL_VIOLET,
  CATT_MAUVE,
  WHITE,
  CATT_PINK,
] as const;
const GLITCH_BLOCK_COLORS = [CATT_SKY, CATT_MAUVE, WHITE, CATT_PINK] as const;

/**
 * Returns a bar colour that:
 *   – cycles slowly through the Catppuccin palette per angular position
 *   – shifts the whole palette hue over time (`t` = global time)
 *   – at v > 0.65 starts lerping toward a toxic spike colour
 *   – at v > 0.88 is fully toxic / white
 */
function barColor(v: number, barAngle: number, t: number): number {
  // Slowly rotate which palette entry is dominant (one full cycle ~30 s)
  const hueShift = t * 0.033;
  const palIdx = Math.abs(barAngle / (Math.PI * 2) + hueShift) % 1;
  const baseIdx = palIdx * CATT_ALL.length;
  const lo = CATT_ALL[Math.floor(baseIdx) % CATT_ALL.length];
  const hi = CATT_ALL[Math.ceil(baseIdx) % CATT_ALL.length];
  const base = lerpColor(lo, hi, baseIdx % 1);

  if (v > 0.88) {
    // Full spike — snap to toxic colour indexed by angle
    const toxIdx =
      Math.floor(Math.abs(barAngle / (Math.PI * 2)) * TOXIC_SPIKE.length) %
      TOXIC_SPIKE.length;
    return lerpColor(TOXIC_SPIKE[toxIdx], WHITE, (v - 0.88) / 0.12);
  }
  if (v > 0.65) {
    // Lerp from palette colour toward the nearest toxic spike
    const toxIdx =
      Math.floor(Math.abs(barAngle / (Math.PI * 2)) * TOXIC_SPIKE.length) %
      TOXIC_SPIKE.length;
    return lerpColor(base, TOXIC_SPIKE[toxIdx], (v - 0.65) / 0.23);
  }
  // Low amplitude — fade to near-black
  return lerpColor(0x0a0a1a, base, v / 0.65);
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * TrapNation-style circular visualizer — intense edition.
 *
 * Layer stack (bottom → top):
 *   stainGfx    — fluid ink-stain blobs (bottommost, very subtle)
 *   networkGfx  — moving dots connected by proximity lines
 *   fluidBgGfx  — animated Crust blob behind the logo
 *   atmGfx      — radial atmosphere + beat flash ripples
 *   vizGfx      — 180-bar circular spectrum (butterfly)
 *   particleGfx — 260 floating dust particles
 *   sparkGfx    — beat-ejected sparks
 *   glitchGfx   — chromatic-split glitch tears
 *   logoGfx     — logo aura + orbiting arcs
 *   logoSprite  — centre logo (added in show())
 *
 * Beat system:
 *   Primary beat  → scale punch, shake, ripple, potential glitch/sparks
 *   Sub-beat      → mid-strength pulse at half the primary interval
 *   Mega beat     → every 4–8 primary beats: ring squish, large glitch,
 *                   spark burst, container zoom kick
 */
export class MusicBreakScreen extends Container {
  public static assetBundles = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly stainGfx: Graphics;
  private readonly networkGfx: Graphics;
  private readonly fluidBgGfx: Graphics;
  private readonly atmGfx: Graphics;
  private readonly rainGfx: Graphics;
  private readonly vizGfx: Graphics;
  private readonly particleGfx: Graphics;
  private readonly sparkGfx: Graphics;
  private readonly scratchGfx: Graphics;
  private readonly glitchGfx: Graphics;
  private readonly logoGfx: Graphics;
  private logoSprite: Sprite | null = null;
  private logoBaseScale = 1.0;
  private graffitiText: Text | null = null;
  private graffitiRed: Text | null = null; // chromatic split — red channel
  private graffitiCyan: Text | null = null; // chromatic split — cyan channel
  private graffitiColorIdx = 0;
  private graffitiColorTimer = 0;

  // ── Dimensions ─────────────────────────────────────────────────────────────
  private w = 0;
  private h = 0;

  // ── Time ───────────────────────────────────────────────────────────────────
  private time = 0;

  // ── Frequency simulation ───────────────────────────────────────────────────
  private readonly bins: FreqBin[];

  private readonly bassOsc = [
    { f: 0.9, p: 0.0, a: 0.9 },
    { f: 1.4, p: 1.8, a: 0.65 },
    { f: 0.5, p: 3.3, a: 0.55 },
  ].map((o) => ({ ...o, p: o.p + Math.random() * Math.PI * 2 }));

  private readonly midOsc = [
    { f: 3.2, p: 0.0, a: 0.65 },
    { f: 5.7, p: 1.2, a: 0.5 },
    { f: 2.1, p: 2.5, a: 0.55 },
    { f: 7.9, p: 0.7, a: 0.35 },
  ].map((o) => ({ ...o, p: o.p + Math.random() * Math.PI * 2 }));

  private readonly highOsc = [
    { f: 12.5, p: 0.0, a: 0.4 },
    { f: 19.8, p: 2.1, a: 0.25 },
    { f: 8.3, p: 1.5, a: 0.35 },
  ].map((o) => ({ ...o, p: o.p + Math.random() * Math.PI * 2 }));

  private dropTimer = 1.5 + Math.random() * 2.5;
  private dropDecay = 0;
  private dropActive = false;

  // ── Beat clock ─────────────────────────────────────────────────────────────
  private beatDecay = 0;
  private beatAmplitude = 1.0;
  private nextBeatTime = 0.3;
  private activityLevel = 0.7;
  private activityPhase = Math.random() * Math.PI * 2;

  // Sub-beat — fires once between primary beats
  private subBeatDecay = 0;
  private nextSubBeatTime = 0.15;

  // Mega-beat — every 4–8 primary beats
  private megaBeatDecay = 0;
  private megaBeatCounter = 0;
  private megaBeatEvery = 4 + Math.floor(Math.random() * 5);

  // ── Ring dynamics ──────────────────────────────────────────────────────────
  private ringRotation = 0; // radians, slow constant rotation
  private ringScalePulse = 1.0; // pops > 1 on beat, decays to 1
  private squishX = 1.0; // horizontal squish on mega-beat
  private squishY = 1.0; // vertical squish on mega-beat

  // ── Screen shake ───────────────────────────────────────────────────────────
  private shakeX = 0;
  private shakeY = 0;
  private shakeDecay = 0;

  // ── Ripples ────────────────────────────────────────────────────────────────
  private readonly ripples: Ripple[] = [];

  // ── Sparks ─────────────────────────────────────────────────────────────────
  private readonly sparks: Spark[] = [];

  // ── Scratch lines ──────────────────────────────────────────────────────────
  private readonly scratches: ScratchLine[] = [];
  private scratchTimer = 0;

  // ── Glitch ─────────────────────────────────────────────────────────────────
  private glitchActive = false;
  private glitchDecay = 0;
  private glitchNextTime = 1.0 + Math.random() * 1.5;
  private glitchShiftX = 0;
  private glitchBands: GlitchBand[] = [];

  // ── Particles ──────────────────────────────────────────────────────────────
  private readonly particles: DustParticle[];

  // ── Rain ───────────────────────────────────────────────────────────────────
  private readonly rainDrops: RainDrop[];
  private rainWindPhase = 0; // slow global wind oscillation

  // ── Background network ─────────────────────────────────────────────────────
  private readonly netDots: NetDot[];

  // ── Fluid stains ───────────────────────────────────────────────────────────
  private readonly stains: FluidStain[];

  // ── Pre-allocated buffers — avoid per-frame allocations ────────────────────
  /** One point buffer per polygon drawn in a frame (see the constructor). */
  private readonly fluidPts: number[][] = [];
  private readonly stainPts: number[][] = [];

  /** Fluid-background layer parameters, rewritten in place every frame. */
  private readonly fluidLayers = [
    { scale: 1, alpha: 0 },
    { scale: 1, alpha: 0 },
    { scale: 1, alpha: 0 },
  ];

  /** Amplitude-scaled sine/cosine of one stain's Fourier phases. */
  private readonly stainModeSin = new Float64Array(STAIN_H.length);
  private readonly stainModeCos = new Float64Array(STAIN_H.length);

  /** Blended colour of every network-dot pair — dot colours never change. */
  private readonly netPairColor = new Int32Array(NET_DOT_COUNT * NET_DOT_COUNT);

  constructor() {
    super();

    this.bins = Array.from({ length: BAR_COUNT }, () => ({
      value: 0,
      target: 0,
    }));

    this.stainGfx = new Graphics();
    this.networkGfx = new Graphics();
    this.fluidBgGfx = new Graphics();
    this.atmGfx = new Graphics();
    this.rainGfx = new Graphics();
    this.vizGfx = new Graphics();
    this.particleGfx = new Graphics();
    this.sparkGfx = new Graphics();
    this.scratchGfx = new Graphics();
    this.glitchGfx = new Graphics();
    this.logoGfx = new Graphics();

    this.addChild(this.stainGfx);
    this.addChild(this.networkGfx);
    this.addChild(this.fluidBgGfx);
    this.addChild(this.atmGfx);
    this.addChild(this.rainGfx);
    this.addChild(this.vizGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.sparkGfx);
    this.addChild(this.scratchGfx);
    this.addChild(this.glitchGfx);
    this.addChild(this.logoGfx);

    this.particles = this.createParticles();
    this.netDots = this.createNetDots();
    this.stains = this.createStains();
    this.rainDrops = this.createRainDrops();

    // `poly()` keeps a reference to the array it is handed until the next
    // `clear()`, so every polygon drawn within one frame needs its own buffer.
    for (let i = 0; i < this.fluidLayers.length; i++) {
      this.fluidPts.push(new Array<number>((RING_STEPS + 1) * 2).fill(0));
    }
    for (let i = 0; i < STAIN_COUNT * STAIN_PASSES; i++) {
      this.stainPts.push(new Array<number>((STAIN_VERTS + 1) * 2).fill(0));
    }

    for (let i = 0; i < NET_DOT_COUNT; i++) {
      for (let j = 0; j < NET_DOT_COUNT; j++) {
        this.netPairColor[i * NET_DOT_COUNT + j] = lerpColor(
          this.netDots[i].color,
          this.netDots[j].color,
          0.5,
        );
      }
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    const tex = Texture.from("music-logo.png");
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = 180;
    sprite.scale.y = sprite.scale.x;
    this.logoBaseScale = sprite.scale.x;
    this.addChild(sprite);
    this.logoSprite = sprite;

    const graffitiStyle = new TextStyle({
      fontFamily: "'Rock Salt', cursive",
      fontSize: 46,
      fill: TOXIC_GREEN,
      stroke: { color: 0x000000, width: 9 },
      align: "center",
      padding: 24,
      dropShadow: {
        color: TOXIC_GREEN,
        blur: 18,
        distance: 0,
        alpha: 0.7,
      },
    });
    const gt = new Text({ text: "Music Break", style: graffitiStyle });
    gt.anchor.set(0.5);
    gt.y = 138; // below the 180-px logo
    this.addChild(gt);
    this.graffitiText = gt;

    // Chromatic-split ghost layers — normally invisible, shown on glitch
    const makeGhost = (tint: number) => {
      const ghost = new Text({
        text: "Music Break",
        style: new TextStyle({
          fontFamily: "'Rock Salt', cursive",
          fontSize: 46,
          fill: tint,
          padding: 24,
          align: "center",
        }),
      });
      ghost.anchor.set(0.5);
      ghost.y = 138;
      ghost.alpha = 0;
      this.addChild(ghost);
      return ghost;
    };
    this.graffitiRed = makeGhost(0xff2244);
    this.graffitiCyan = makeGhost(0x00ffee);
  }

  public update(_ticker: Ticker): void {
    const dt = FIXED_STEP_SECONDS;
    this.time += dt;

    this.tickActivity(dt);
    this.tickBeat(dt);
    this.tickSubBeat(dt);
    this.updateFreqData(dt);
    this.tickRingDynamics(dt);

    const breathe = 1 + 0.028 * Math.sin(this.time * 0.6);

    this.drawStains(dt);
    this.drawNetwork(dt);
    this.drawFluidBackground(breathe);
    this.drawAtmosphere(breathe);
    this.drawRain(dt);
    this.drawVisualizer(breathe);
    this.drawParticles(dt);
    this.drawSparks(dt);
    this.drawScratches(dt);
    this.drawGlitch(breathe);
    this.animateLogo(breathe);
    this.applyShake();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width * 0.5;
    this.y = height * 0.5;
  }

  // ── Simulation ─────────────────────────────────────────────────────────────

  private tickActivity(dt: number): void {
    // Faster activity cycle for more energy variation
    this.activityPhase += dt * 0.035;
    this.activityLevel = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(this.activityPhase));
  }

  private tickBeat(dt: number): void {
    if (this.time >= this.nextBeatTime) {
      const interval = BEAT_MIN + Math.random() * (BEAT_MAX - BEAT_MIN);

      if (Math.random() < 0.05) {
        // Ghost beat — barely a blip
        this.nextBeatTime = this.time + interval + 0.3;
        this.beatAmplitude = 1.08;
      } else {
        this.nextBeatTime = this.time + interval;
        this.beatAmplitude =
          1.8 + this.activityLevel * 2.0 + Math.random() * 0.6;
        this.beatDecay = 1.0;
        this.ringScalePulse = 1.12 + this.activityLevel * 0.1;

        // Schedule sub-beat at ~40–60% into the next interval
        this.nextSubBeatTime =
          this.time + interval * (0.4 + Math.random() * 0.2);

        // Shake
        const str = (this.beatAmplitude - 1.0) * 5.5;
        this.shakeX = (Math.random() - 0.5) * str;
        this.shakeY = (Math.random() - 0.5) * str;
        this.shakeDecay = 1.0;

        // Ripple
        this.spawnRipple(BASE_RADIUS, TOXIC_GREEN, 320 + this.beatDecay * 80);

        // Sparks on strong beats
        if (this.activityLevel > 0.5)
          this.spawnSparks(8 + Math.floor(this.activityLevel * 10));

        // Kick network dots away from centre on beat
        this.kickNetDots(this.beatAmplitude * 18);

        // Glitch — 30% chance on regular beat, always on glitchNextTime crossing
        if (
          this.time >= this.glitchNextTime ||
          Math.random() < 0.3 * this.activityLevel
        ) {
          this.triggerGlitch();
        }

        // Mega beat counter
        this.megaBeatCounter++;
        if (this.megaBeatCounter >= this.megaBeatEvery) {
          this.megaBeatCounter = 0;
          this.megaBeatEvery = 4 + Math.floor(Math.random() * 5);
          this.triggerMegaBeat();
        }
      }
    }

    this.beatAmplitude = Math.max(1.0, this.beatAmplitude - dt * 5.5);
    this.beatDecay = Math.max(0, this.beatDecay - dt * 7.0);
    this.megaBeatDecay = Math.max(0, this.megaBeatDecay - dt * 3.5);
  }

  private tickSubBeat(dt: number): void {
    if (this.time >= this.nextSubBeatTime && this.subBeatDecay <= 0) {
      this.subBeatDecay = 1.0;
      this.beatAmplitude = Math.max(
        this.beatAmplitude,
        1.35 + this.activityLevel * 0.9,
      );
      this.ringScalePulse = Math.max(this.ringScalePulse, 1.06);
      // Smaller ripple in a complementary colour
      this.spawnRipple(BASE_RADIUS * 0.95, LOL_VIOLET, 240);
      if (Math.random() < 0.4)
        this.spawnSparks(4 + Math.floor(Math.random() * 5));
    }
    this.subBeatDecay = Math.max(0, this.subBeatDecay - dt * 9.0);
  }

  private tickRingDynamics(dt: number): void {
    // Continuous slow rotation + jerk on mega-beat
    this.ringRotation += dt * (0.12 + this.megaBeatDecay * 0.8);

    // Scale pulse decays to 1
    this.ringScalePulse =
      1.0 + Math.max(0, this.ringScalePulse - 1.0 - dt * 8.0);

    // Squish: on mega-beat vizGfx scale snaps then decays back to 1
    const squishTarget = 1.0;
    this.squishX += (squishTarget - this.squishX) * dt * 7.0;
    this.squishY += (squishTarget - this.squishY) * dt * 7.0;
    this.vizGfx.scale.set(this.squishX, this.squishY);
    this.vizGfx.rotation = this.ringRotation;

    // Decay ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += r.speed * dt;
      r.alpha -= dt * 3.5;
      if (r.alpha <= 0) this.ripples.splice(i, 1);
    }

    // Glitch decay
    if (this.glitchActive) {
      this.glitchDecay -= dt * 12.0;
      if (this.glitchDecay <= 0) {
        this.glitchActive = false;
        this.glitchBands = [];
        this.glitchNextTime = this.time + 0.6 + Math.random() * 1.8;
      }
    }
  }

  // ── Spawners ───────────────────────────────────────────────────────────────

  private spawnRipple(radius: number, color: number, speed: number): void {
    this.ripples.push({ radius, alpha: 0.9, color, speed });
    if (this.ripples.length > 12)
      this.ripples.splice(0, this.ripples.length - 12);
  }

  private spawnSparks(count: number): void {
    const originAngle = Math.random() * Math.PI * 2;
    const r = BASE_RADIUS + (Math.random() - 0.5) * 30;
    const ox = Math.cos(originAngle) * r;
    const oy = Math.sin(originAngle) * r;
    const col = randomFrom(SPARK_COLORS);

    for (let i = 0; i < count; i++) {
      const ang = originAngle + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 120 + Math.random() * 200;
      this.sparks.push({
        x: ox,
        y: oy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 1.0,
        decay: 2.0 + Math.random() * 2.5,
        color: col,
        size: 1.2 + Math.random() * 2.5,
      });
    }
    if (this.sparks.length > 200)
      this.sparks.splice(0, this.sparks.length - 200);
  }

  private triggerGlitch(): void {
    this.glitchActive = true;
    this.glitchDecay = 1.0;
    this.glitchShiftX = 6 + Math.random() * 18;
    this.glitchBands = [];
    const bandCount = 2 + Math.floor(Math.random() * 5);
    for (let b = 0; b < bandCount; b++) {
      const ang = Math.random() * Math.PI * 2;
      const r = BASE_RADIUS + (Math.random() - 0.5) * 80;
      this.glitchBands.push({
        y: Math.sin(ang) * r,
        height: 2 + Math.random() * 10,
        shiftX: (Math.random() - 0.5) * this.glitchShiftX * 2,
        alpha: 0.5 + Math.random() * 0.5,
      });
    }
  }

  private triggerMegaBeat(): void {
    this.megaBeatDecay = 1.0;
    this.beatAmplitude = Math.max(this.beatAmplitude, 3.5);
    this.beatDecay = 1.0;
    this.ringScalePulse = 1.25;

    // Squish the ring into an ellipse briefly
    this.squishX = 1.3;
    this.squishY = 0.78;

    // Big shake
    this.shakeX = (Math.random() - 0.5) * 22;
    this.shakeY = (Math.random() - 0.5) * 22;
    this.shakeDecay = 1.0;

    // Burst of sparks from multiple points
    for (let i = 0; i < 3; i++)
      this.spawnSparks(15 + Math.floor(Math.random() * 10));

    // Big ripple
    this.spawnRipple(BASE_RADIUS, WHITE, 500);
    this.spawnRipple(BASE_RADIUS * 0.8, LOL_VIOLET, 380);

    // Scratch burst on mega
    for (let i = 0; i < 6 + Math.floor(Math.random() * 6); i++)
      this.spawnScratch(true);

    // Always glitch on mega
    this.triggerGlitch();
    this.glitchShiftX *= 1.8; // bigger shift on mega
  }

  // ── Frequency data ─────────────────────────────────────────────────────────

  private updateFreqData(dt: number): void {
    this.dropTimer -= dt;
    if (!this.dropActive && this.dropTimer <= 0) {
      this.dropActive = true;
      this.dropDecay = 1.0;
      this.dropTimer = 2.5 + Math.random() * 4.0;
      this.beatAmplitude = Math.max(this.beatAmplitude, 3.2);
      this.beatDecay = 1.0;
    }
    if (this.dropActive) {
      this.dropDecay -= dt * 0.65;
      if (this.dropDecay <= 0) {
        this.dropDecay = 0;
        this.dropActive = false;
      }
    }

    const bassExtra =
      this.dropDecay * 0.7 + this.beatDecay * 0.3 + this.subBeatDecay * 0.15;

    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / BAR_COUNT;
      let v = 0;

      if (t < 0.22) {
        const bt = t / 0.22;
        for (const o of this.bassOsc)
          v += o.a * (0.5 + 0.5 * Math.sin(this.time * o.f + o.p + bt * 4.0));
        v += bassExtra * 2.2;
        v *= 1.0 - bt * 0.22;
      } else if (t < 0.68) {
        const mt = (t - 0.22) / 0.46;
        for (const o of this.midOsc)
          v += o.a * (0.5 + 0.5 * Math.sin(this.time * o.f + o.p + mt * 7.0));
        v += bassExtra * 0.35 * (1 - mt);
      } else {
        const ht = (t - 0.68) / 0.32;
        for (const o of this.highOsc)
          v += o.a * (0.5 + 0.5 * Math.sin(this.time * o.f + o.p + ht * 11.0));
        v *= 0.6;
      }

      v += (Math.random() - 0.5) * 0.08;
      v *= 0.35 + this.activityLevel * 0.85;

      const bin = this.bins[i];
      bin.target = Math.max(0, Math.min(1, v / 3.0));

      const ease = bin.target > bin.value ? 0.45 : 0.1;
      bin.value += (bin.target - bin.value) * ease;
    }

    // Butterfly symmetry
    for (let i = 0; i < BAR_COUNT >> 1; i++) {
      const j = BAR_COUNT - 1 - i;
      this.bins[j].value = this.bins[i].value * (0.86 + Math.random() * 0.28);
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  private drawFluidBackground(breathe: number): void {
    this.fluidBgGfx.clear();

    const baseR = BASE_RADIUS * breathe * this.ringScalePulse * 0.7;

    // Mega-beat inflates the fluid blob visually
    const megaScale = 1 + this.megaBeatDecay * 0.12;

    const layers = this.fluidLayers;
    layers[0].scale = 1.0 * megaScale;
    layers[0].alpha = 0.22 + this.beatDecay * 0.1 + this.megaBeatDecay * 0.08;
    layers[1].scale = 0.88 * megaScale;
    layers[1].alpha = 0.36 + this.megaBeatDecay * 0.06;
    layers[2].scale = 0.74 * megaScale;
    layers[2].alpha = 0.52;

    // Beat swell — same phase on every layer, so resolved once per frame
    const p2 = this.time * 1.8;
    const swell = this.beatDecay * 6;
    const s2 = Math.sin(p2) * swell;
    const c2 = Math.cos(p2) * swell;

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const r = baseR * layer.scale;
      const pts = this.fluidPts[li];

      // Each harmonic's phase and amplitude fold into one sine/cosine pair,
      // hoisted out of the vertex loop (see `harmonicLut`).
      const p3 = this.time * 0.42 + layer.scale * 2.1;
      const s3 = Math.sin(p3) * 8;
      const c3 = Math.cos(p3) * 8;
      const p5 = -this.time * 0.6 + layer.scale * 1.3;
      const s5 = Math.sin(p5) * 5;
      const c5 = Math.cos(p5) * 5;
      const p11 = this.time * 0.25 + layer.scale * 3.7;
      const s11 = Math.sin(p11) * 3;
      const c11 = Math.cos(p11) * 3;
      const p17 = -this.time * 0.2 + layer.scale * 0.9;
      const s17 = Math.sin(p17) * 1.5;
      const c17 = Math.cos(p17) * 1.5;

      for (let i = 0; i <= RING_STEPS; i++) {
        const disp =
          RING_H3.sin[i] * c3 +
          RING_H3.cos[i] * s3 +
          RING_H5.sin[i] * c5 +
          RING_H5.cos[i] * s5 +
          RING_H11.sin[i] * c11 +
          RING_H11.cos[i] * s11 +
          RING_H17.sin[i] * c17 +
          RING_H17.cos[i] * s17 +
          // Beat adds extra organic swell
          RING_H2.sin[i] * c2 +
          RING_H2.cos[i] * s2;

        const rr = r + disp;
        pts[i * 2] = RING_H1.cos[i] * rr;
        pts[i * 2 + 1] = RING_H1.sin[i] * rr;
      }

      this.fluidBgGfx.poly(pts).fill(fillStyle(CRUST, layer.alpha));
    }
  }

  private drawAtmosphere(breathe: number): void {
    this.atmGfx.clear();
    const r = BASE_RADIUS * breathe * this.ringScalePulse;
    const act = this.activityLevel;
    const bd = this.beatDecay;
    const md = this.megaBeatDecay;

    // Base radial glows
    this.atmGfx
      .circle(0, 0, r * 2.4)
      .fill(fillStyle(TOXIC_GREEN, 0.02 * act + md * 0.025));
    this.atmGfx
      .circle(0, 0, r * 1.6)
      .fill(fillStyle(TOXIC_GREEN, 0.042 * act + md * 0.04));
    this.atmGfx
      .circle(0, 0, r * 1.1)
      .fill(fillStyle(LOL_VIOLET, 0.05 * act + md * 0.05));

    // Beat flash
    if (bd > 0) {
      this.atmGfx
        .circle(0, 0, r * (1.0 + bd * 0.6))
        .fill(fillStyle(WHITE, bd * 0.06));
      this.atmGfx
        .circle(0, 0, r * (1.0 + bd * 0.2))
        .fill(fillStyle(TOXIC_GREEN, bd * 0.12));
    }

    // Mega-beat white flash
    if (md > 0) {
      this.atmGfx.circle(0, 0, r * 1.8).fill(fillStyle(WHITE, md * 0.1));
    }

    // Ripple rings
    for (const rip of this.ripples) {
      const w = 2.5 * rip.alpha;
      this.atmGfx
        .circle(0, 0, rip.radius)
        .stroke(strokeStyle(rip.color, rip.alpha * 0.85, w, "butt"));
      this.atmGfx
        .circle(0, 0, rip.radius)
        .stroke(strokeStyle(rip.color, rip.alpha * 0.2, w * 6, "butt"));
    }
  }

  private drawVisualizer(breathe: number): void {
    this.vizGfx.clear();

    const rsp = this.ringScalePulse;

    // Turbulence — more aggressive amplitude, mega-beat adds extra warp.
    // Amplitudes and phases are the same for every bar, so they fold into one
    // sine/cosine pair per harmonic ahead of the loop (see `harmonicLut`).
    const megaWarp = this.megaBeatDecay * 14;
    const a4 = 4.0 + megaWarp;
    const a9 = 2.0 + megaWarp * 0.5;
    const p4 = this.time * 1.1;
    const s4 = Math.sin(p4) * a4;
    const c4 = Math.cos(p4) * a4;
    const p9 = -this.time * 1.9;
    const s9 = Math.sin(p9) * a9;
    const c9 = Math.cos(p9) * a9;
    const p17 = this.time * 2.7;
    const s17 = Math.sin(p17);
    const c17 = Math.cos(p17);
    const p31 = -this.time * 3.5;
    const s31 = Math.sin(p31) * 0.5;
    const c31 = Math.cos(p31) * 0.5;

    // Inward butterfly — colour shifts with sub-beat
    const innerCol = this.subBeatDecay > 0.3 ? CATT_PINK : LOL_VIOLET;
    const innerFade = 0.4 + this.subBeatDecay * 0.25;

    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = BAR_ANGLE[i];
      const cos = BAR_H1.cos[i];
      const sin = BAR_H1.sin[i];
      const bin = this.bins[i];
      const v = bin.value;

      const turb =
        BAR_H4.sin[i] * c4 +
        BAR_H4.cos[i] * s4 +
        BAR_H9.sin[i] * c9 +
        BAR_H9.cos[i] * s9 +
        BAR_H17.sin[i] * c17 +
        BAR_H17.cos[i] * s17 +
        BAR_H31.sin[i] * c31 +
        BAR_H31.cos[i] * s31;

      const baseR = (BASE_RADIUS + turb) * breathe * rsp;

      const hOut = (2 + v * BAR_MAX_OUT) * (0.5 + this.beatAmplitude * 0.5);
      const hIn = (2 + v * BAR_MAX_IN) * (0.45 + this.beatAmplitude * 0.4);

      const color = barColor(v, angle, this.time);
      const alpha = 0.18 + v * 0.82;

      const ox = cos * baseR,
        oy = sin * baseR;
      const ex = cos * (baseR + hOut),
        ey = sin * (baseR + hOut);
      const ix = cos * (baseR - hIn),
        iy = sin * (baseR - hIn);

      // Outward — 3-pass glow
      this.vizGfx
        .moveTo(ox, oy)
        .lineTo(ex, ey)
        .stroke(strokeStyle(color, alpha * 0.1, BAR_W * 8, "butt"));
      this.vizGfx
        .moveTo(ox, oy)
        .lineTo(ex, ey)
        .stroke(strokeStyle(color, alpha * 0.3, BAR_W * 2.8, "butt"));
      this.vizGfx
        .moveTo(ox, oy)
        .lineTo(ex, ey)
        .stroke(strokeStyle(color, alpha, BAR_W, "butt"));

      // Bright tip
      if (v > 0.5) {
        this.vizGfx
          .circle(ex, ey, BAR_W * 2.0)
          .fill(fillStyle(color, alpha * 0.95));
      }

      this.vizGfx
        .moveTo(ox, oy)
        .lineTo(ix, iy)
        .stroke(strokeStyle(innerCol, alpha * innerFade, BAR_W * 0.8, "butt"));
    }

    // Base ring — flickers on glitch
    const ringAlpha = this.glitchActive
      ? Math.random() < 0.5
        ? 0
        : 0.8
      : 0.2 + this.beatDecay * 0.4;
    this.vizGfx
      .circle(0, 0, BASE_RADIUS * breathe * rsp)
      .stroke(strokeStyle(TOXIC_GREEN, ringAlpha, 1.5, "butt"));
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const speedBoost = 1 + this.beatDecay * 2.2 + this.megaBeatDecay * 3.0;

    for (const p of this.particles) {
      p.x += p.vx * dt * speedBoost;
      p.y += p.vy * dt * speedBoost;

      if (p.x > hw + 60) p.x = -hw - 60;
      if (p.x < -hw - 60) p.x = hw + 60;
      if (p.y > hh + 60) p.y = -hh - 60;
      if (p.y < -hh - 60) p.y = hh + 60;

      const twinkle =
        0.4 + 0.6 * Math.sin(this.time * p.twinkleSpeed + p.twinklePhase);
      const a = p.alpha * twinkle * (1 + this.megaBeatDecay * 0.5);

      this.particleGfx
        .circle(p.x, p.y, p.size)
        .fill(fillStyle(p.color, Math.min(1, a)));
      if (p.size > 1.5) {
        this.particleGfx
          .circle(p.x, p.y, p.size * 3.0)
          .fill(fillStyle(p.color, a * 0.18));
      }
    }
  }

  private drawSparks(dt: number): void {
    this.sparkGfx.clear();

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }

      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
      const trailLen = s.size * 6 * s.life;
      const tx = s.x - (s.vx / speed) * trailLen;
      const ty = s.y - (s.vy / speed) * trailLen;

      this.sparkGfx
        .moveTo(tx, ty)
        .lineTo(s.x, s.y)
        .stroke(strokeStyle(s.color, s.life, s.size, "round"));
      this.sparkGfx
        .circle(s.x, s.y, s.size * 1.4)
        .fill(fillStyle(s.color, s.life * 0.9));
    }
  }

  /**
   * Chromatic-split glitch:
   *   – Horizontal scan-line tears (dark bands + colour shift lines)
   *   – Ring contour drawn twice, offset ±shiftX in red / cyan
   *   – Random pixel blocks scattered near the ring
   */
  private drawGlitch(breathe: number): void {
    this.glitchGfx.clear();
    if (!this.glitchActive) return;

    const r = BASE_RADIUS * breathe * this.ringScalePulse;
    const sx = this.glitchShiftX * this.glitchDecay;
    const gd = this.glitchDecay;

    // Scan-line tears
    for (const band of this.glitchBands) {
      const y = band.y * breathe;
      this.glitchGfx
        .rect(
          band.shiftX - r - 20,
          y - band.height * 0.5,
          (r + 20) * 2,
          band.height,
        )
        .fill(fillStyle(0x000000, band.alpha * 0.65 * gd));
      this.glitchGfx
        .rect(band.shiftX - r - 20, y - 1, (r + 20) * 2, 1.5)
        .fill(fillStyle(CATT_SKY, band.alpha * gd));
    }

    // Red channel — offset right
    this.buildRingPath(r, sx);
    this.glitchGfx.stroke(strokeStyle(0xff2244, 0.55 * gd, 1.8, "round"));

    // Cyan channel — offset left
    this.buildRingPath(r, -sx);
    this.glitchGfx.stroke(strokeStyle(0x00ffee, 0.55 * gd, 1.8, "round"));

    // Pixel blocks
    const blockCount = 4 + Math.floor(Math.random() * 7);
    for (let i = 0; i < blockCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = r + (Math.random() - 0.5) * 60;
      const bx = Math.cos(ang) * dist + (Math.random() - 0.5) * sx * 2;
      const by = Math.sin(ang) * dist;
      const bw = 4 + Math.random() * 24;
      const bh = 2 + Math.random() * 8;
      const col = randomFrom(GLITCH_BLOCK_COLORS);
      this.glitchGfx
        .rect(bx, by, bw, bh)
        .fill(fillStyle(col, (0.5 + Math.random() * 0.5) * gd));
    }
  }

  /** Trace the displaced ring path for glitch chromatic split. */
  private buildRingPath(r: number, offsetX: number): void {
    // Both turbulence harmonics share one phase per frame (see `harmonicLut`)
    const p4 = this.time * 1.1;
    const s4 = Math.sin(p4) * 4;
    const c4 = Math.cos(p4) * 4;
    const p9 = -this.time * 1.9;
    const s9 = Math.sin(p9) * 2;
    const c9 = Math.cos(p9) * 2;

    for (let i = 0; i <= RING_STEPS; i++) {
      const turb =
        RING_H4.sin[i] * c4 +
        RING_H4.cos[i] * s4 +
        RING_H9.sin[i] * c9 +
        RING_H9.cos[i] * s9;
      const rr = r + turb;
      const x = RING_H1.cos[i] * rr + offsetX;
      const y = RING_H1.sin[i] * rr;
      if (i === 0) this.glitchGfx.moveTo(x, y);
      else this.glitchGfx.lineTo(x, y);
    }
    this.glitchGfx.closePath();
  }

  private animateLogo(breathe: number): void {
    const float = Math.sin(this.time * 0.45) * 8;
    const beatPunch = 1 + 0.28 * this.beatDecay + 0.35 * this.megaBeatDecay;

    if (this.logoSprite) {
      const tremor =
        1 +
        0.013 * Math.sin(this.time * 18.5) +
        0.008 * Math.sin(this.time * 26.8) +
        0.005 * Math.sin(this.time * 39.3);
      this.logoSprite.scale.set(
        this.logoBaseScale * breathe * tremor * beatPunch,
      );
      this.logoSprite.x = (Math.random() - 0.5) * 3.0 * this.beatDecay;
      this.logoSprite.y = float + (Math.random() - 0.5) * 2.5 * this.beatDecay;
      this.logoSprite.alpha = 0.85 + 0.15 * Math.sin(this.time * 0.55);

      // Glitch flicker — logo briefly vanishes
      if (this.glitchActive && Math.random() < 0.25 * this.glitchDecay) {
        this.logoSprite.alpha = 0.1 + Math.random() * 0.3;
      }
    }

    if (this.graffitiText) {
      const gt = this.graffitiText;
      const dt = FIXED_STEP_SECONDS;

      // ── Colour cycling — advances on every beat, smooth lerp between steps ──
      this.graffitiColorTimer -=
        dt * (1.8 + this.beatDecay * 4.0 + this.megaBeatDecay * 6.0);
      if (this.graffitiColorTimer <= 0) {
        this.graffitiColorTimer = 1.0;
        this.graffitiColorIdx = (this.graffitiColorIdx + 1) % CATT_ALL.length;
      }
      const ci0 = this.graffitiColorIdx;
      const ci1 = (ci0 + 1) % CATT_ALL.length;
      const lerpt = 1 - this.graffitiColorTimer;
      let col = lerpColor(CATT_ALL[ci0], CATT_ALL[ci1], lerpt);
      // On mega-beat slam to toxic green
      if (this.megaBeatDecay > 0)
        col = lerpColor(col, TOXIC_GREEN, this.megaBeatDecay);
      (gt.style as TextStyle).fill = col;
      (gt.style as TextStyle).dropShadow = {
        color: col,
        blur: 20 + this.beatDecay * 14,
        distance: 0,
        alpha: 0.75,
        angle: 0,
      };

      // ── Float / position ─────────────────────────────────────────────────────
      const baseY = 138 + float;
      gt.y = baseY;
      gt.rotation = 0.04 * Math.sin(this.time * 0.33);

      // ── Scale punch ──────────────────────────────────────────────────────────
      const gScale = 1 + 0.1 * this.beatDecay + 0.18 * this.megaBeatDecay;
      gt.scale.set(gScale);

      // ── Alpha pulse ──────────────────────────────────────────────────────────
      gt.alpha = Math.min(
        1,
        (0.72 + 0.2 * Math.sin(this.time * 0.8 + 1.2)) *
          (1 + 0.15 * this.beatDecay + 0.25 * this.megaBeatDecay),
      );

      // ── Glitch — chromatic split + jitter + flicker ──────────────────────────
      const red = this.graffitiRed;
      const cyan = this.graffitiCyan;

      if (this.glitchActive && red && cyan) {
        const gd = this.glitchDecay;
        const sx = this.glitchShiftX * gd * 0.7;

        // Main text jitters horizontally and occasionally vanishes
        gt.x = (Math.random() - 0.5) * sx * 1.2;
        if (Math.random() < 0.18 * gd) gt.alpha *= 0.08 + Math.random() * 0.25;

        // Red ghost — shifted right
        red.visible = true;
        red.x = sx + (Math.random() - 0.5) * 3;
        red.y = baseY + (Math.random() - 0.5) * gd * 4;
        red.alpha = gd * (0.4 + Math.random() * 0.4);
        red.scale.copyFrom(gt.scale);
        red.rotation = gt.rotation;
        (red.style as TextStyle).fill = lerpColor(0xff2244, col, 0.35);

        // Cyan ghost — shifted left
        cyan.visible = true;
        cyan.x = -sx + (Math.random() - 0.5) * 3;
        cyan.y = baseY + (Math.random() - 0.5) * gd * 4;
        cyan.alpha = gd * (0.4 + Math.random() * 0.4);
        cyan.scale.copyFrom(gt.scale);
        cyan.rotation = gt.rotation;
        (cyan.style as TextStyle).fill = lerpColor(0x00ffee, col, 0.35);
      } else {
        gt.x = 0;
        if (red) {
          red.visible = false;
          red.alpha = 0;
        }
        if (cyan) {
          cyan.visible = false;
          cyan.alpha = 0;
        }
      }
    }

    const aura =
      65 +
      14 * Math.sin(this.time * 0.5) +
      this.beatDecay * 28 +
      this.megaBeatDecay * 40;
    const cy = float;

    this.logoGfx.clear();
    this.logoGfx
      .circle(0, cy, aura * 2.8)
      .fill(
        fillStyle(
          TOXIC_GREEN,
          0.022 + this.beatDecay * 0.04 + this.megaBeatDecay * 0.06,
        ),
      );
    this.logoGfx
      .circle(0, cy, aura * 1.8)
      .fill(fillStyle(TOXIC_GREEN, 0.055 + this.beatDecay * 0.065));
    this.logoGfx
      .circle(0, cy, aura * 1.0)
      .fill(fillStyle(LOL_VIOLET, 0.048 + this.beatDecay * 0.055));

    const r0 = aura + 6,
      a0 = this.time * 0.72 + this.ringRotation * 0.3;
    this.logoGfx
      .moveTo(Math.cos(a0) * r0, cy + Math.sin(a0) * r0)
      .arc(0, cy, r0, a0, a0 + Math.PI * 1.35)
      .stroke(strokeStyle(TOXIC_GREEN, 0.88, 1.5, "round"));

    const r1 = r0 - 7,
      a1 = -this.time * 0.46 + Math.PI * 0.55;
    this.logoGfx
      .moveTo(Math.cos(a1) * r1, cy + Math.sin(a1) * r1)
      .arc(0, cy, r1, a1, a1 + Math.PI * 0.75)
      .stroke(strokeStyle(LOL_VIOLET, 0.62, 1.0, "round"));

    // Extra arc on mega-beat
    if (this.megaBeatDecay > 0) {
      const r2 = r0 + 12,
        a2 = this.time * 1.1;
      this.logoGfx
        .moveTo(Math.cos(a2) * r2, cy + Math.sin(a2) * r2)
        .arc(0, cy, r2, a2, a2 + Math.PI * 0.9)
        .stroke(strokeStyle(WHITE, this.megaBeatDecay * 0.7, 1.2, "round"));
    }
  }

  private applyShake(): void {
    this.shakeDecay = Math.max(0, this.shakeDecay - FIXED_STEP_SECONDS * 10.0);
    this.x = this.w * 0.5 + this.shakeX * this.shakeDecay;
    this.y = this.h * 0.5 + this.shakeY * this.shakeDecay;
  }

  // ── Scratch lines ─────────────────────────────────────────────────────────

  private spawnScratch(bold = false): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const col = randomFrom(CATT_ALL);
    this.scratches.push({
      x: (Math.random() - 0.5) * hw * 2,
      y: (Math.random() - 0.5) * hh * 2,
      angle: Math.random() * Math.PI,
      length: bold ? 60 + Math.random() * 120 : 15 + Math.random() * 70,
      width: bold ? 1.5 + Math.random() * 4.0 : 0.4 + Math.random() * 2.5,
      color: col,
      life: 1.0,
      decay: bold ? 0.8 + Math.random() * 1.2 : 1.4 + Math.random() * 2.5,
      fadeIn: 0,
    });
    if (this.scratches.length > 120)
      this.scratches.splice(0, this.scratches.length - 120);
  }

  /**
   * Short random lines with multi-pass glow — same 3-pass recipe as sparks/bars.
   * Ambient spawning every 0.04–0.10 s; burst on beat and mega-beat.
   */
  private drawScratches(dt: number): void {
    this.scratchGfx.clear();

    // Ambient spawn timer
    this.scratchTimer -= dt;
    if (this.scratchTimer <= 0) {
      const count = 1 + Math.floor(this.activityLevel * 2);
      for (let i = 0; i < count; i++) this.spawnScratch();
      if (this.beatDecay > 0.4) this.spawnScratch(Math.random() < 0.4);
      this.scratchTimer = 0.04 + Math.random() * 0.06;
    }

    for (let i = this.scratches.length - 1; i >= 0; i--) {
      const s = this.scratches[i];

      s.fadeIn = Math.min(1, s.fadeIn + dt * 12);
      s.life -= s.decay * dt;
      if (s.life <= 0) {
        this.scratches.splice(i, 1);
        continue;
      }

      const visible = s.fadeIn * s.life;
      if (visible < 0.01) continue;

      const cos = Math.cos(s.angle);
      const sin = Math.sin(s.angle);
      const hx = cos * s.length * 0.5;
      const hy = sin * s.length * 0.5;
      const x1 = s.x - hx,
        y1 = s.y - hy;
      const x2 = s.x + hx,
        y2 = s.y + hy;

      // 3-pass glow
      this.scratchGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke(strokeStyle(s.color, visible * 0.1, s.width * 7, "round"));
      this.scratchGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke(strokeStyle(s.color, visible * 0.28, s.width * 2.5, "round"));
      this.scratchGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke(strokeStyle(s.color, visible, s.width, "round"));

      // Bright endpoint dots
      this.scratchGfx
        .circle(x1, y1, s.width * 1.4)
        .fill(fillStyle(s.color, visible * 0.8));
      this.scratchGfx
        .circle(x2, y2, s.width * 1.4)
        .fill(fillStyle(s.color, visible * 0.8));
    }
  }

  // ── Background network ─────────────────────────────────────────────────────

  /** Kick all network dots radially outward from origin — called on beat. */
  private kickNetDots(strength: number): void {
    for (const d of this.netDots) {
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
      d.vx += (d.x / dist) * strength * (0.6 + Math.random() * 0.8);
      d.vy += (d.y / dist) * strength * (0.6 + Math.random() * 0.8);
    }
  }

  private drawNetwork(dt: number): void {
    this.networkGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const maxSpd = 55;
    const drag = 0.96;

    // ── Update positions ───────────────────────────────────────────────────
    for (const d of this.netDots) {
      d.vx *= drag;
      d.vy *= drag;
      // Clamp speed
      const spd = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
      if (spd > maxSpd) {
        d.vx = (d.vx / spd) * maxSpd;
        d.vy = (d.vy / spd) * maxSpd;
      }

      d.x += d.vx * dt;
      d.y += d.vy * dt;

      // Soft bounce off screen edges
      if (d.x > hw - 10) {
        d.x = hw - 10;
        d.vx *= -0.7;
      }
      if (d.x < -hw + 10) {
        d.x = -hw + 10;
        d.vx *= -0.7;
      }
      if (d.y > hh - 10) {
        d.y = hh - 10;
        d.vy *= -0.7;
      }
      if (d.y < -hh + 10) {
        d.y = -hh + 10;
        d.vy *= -0.7;
      }
    }

    // ── Draw connections ───────────────────────────────────────────────────
    // Rejecting on squared distance keeps the sqrt off the pairs that are out
    // of range, and the blended pair colours were resolved in the constructor.
    const maxDistSq = NET_MAX_DIST * NET_MAX_DIST;
    for (let i = 0; i < this.netDots.length; i++) {
      const a = this.netDots[i];
      const row = i * NET_DOT_COUNT;
      for (let j = i + 1; j < this.netDots.length; j++) {
        const b = this.netDots[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= maxDistSq) continue;

        const t = 1 - Math.sqrt(distSq) / NET_MAX_DIST; // 1 = close, 0 = limit
        const alpha = t * t * 0.3; // quadratic fade

        this.networkGfx
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke(
            strokeStyle(
              this.netPairColor[row + j],
              alpha,
              0.6 + t * 0.8,
              "round",
            ),
          );
      }
    }

    // ── Draw dots ──────────────────────────────────────────────────────────
    for (const d of this.netDots) {
      const twinkle = 0.5 + 0.5 * Math.sin(this.time * 1.1 + d.phase);
      const a = d.alpha * twinkle * (1 + this.beatDecay * 0.5);

      // Glow halo
      this.networkGfx
        .circle(d.x, d.y, d.size * 3.5)
        .fill(fillStyle(d.color, a * 0.12));
      // Core
      this.networkGfx
        .circle(d.x, d.y, d.size)
        .fill(fillStyle(d.color, Math.min(1, a)));
    }
  }

  // ── Fluid stains ───────────────────────────────────────────────────────────

  /**
   * Fluid ink-stain blobs.
   *
   * Each stain uses only Fourier modes 1–3 for radial deformation:
   *   mode 1 = slow elongation (egg shape)
   *   mode 2 = figure-8 / pinch
   *   mode 3 = trefoil wobble
   * Low modes → large smooth bumps, no spikes.
   *
   * Three concentric fills (outer wide dim → inner bright) create
   * a watercolour / ink-bleed depth. A secondary offset blob of the
   * same colour adds the paint-splash asymmetry.
   */
  private drawStains(dt: number): void {
    this.stainGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5;
    const hh = this.h * 0.5;

    // ── Stain separation — push overlapping stains apart ──────────────────────
    for (let i = 0; i < this.stains.length; i++) {
      for (let j = i + 1; j < this.stains.length; j++) {
        const a = this.stains[i];
        const b = this.stains[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const distSq = dx * dx + dy * dy;
        const minDist = a.baseRadius * 1.1 + b.baseRadius * 1.1;
        // Squared compare first — only overlapping pairs need the sqrt
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          // Repulsion force — stronger the more they overlap
          const overlap = (minDist - dist) / minDist;
          const force = overlap * 280; // px/s² push
          const nx = dx / dist;
          const ny = dy / dist;
          a.vcx -= nx * force * dt;
          a.vcy -= ny * force * dt;
          b.vcx += nx * force * dt;
          b.vcy += ny * force * dt;
        }
      }
    }

    // ── Speed cap to prevent runaway after mega-beat kicks ─────────────────
    const MAX_SPD = 90;
    for (const s of this.stains) {
      const spd = Math.sqrt(s.vcx * s.vcx + s.vcy * s.vcy);
      if (spd > MAX_SPD) {
        s.vcx = (s.vcx / spd) * MAX_SPD;
        s.vcy = (s.vcy / spd) * MAX_SPD;
      }
    }

    for (let si = 0; si < this.stains.length; si++) {
      const s = this.stains[si];

      // Drift main centre
      s.cx += s.vcx * dt;
      s.cy += s.vcy * dt;
      if (s.cx > hw + s.baseRadius * 1.5) s.cx = -hw - s.baseRadius * 1.5;
      if (s.cx < -hw - s.baseRadius * 1.5) s.cx = hw + s.baseRadius * 1.5;
      if (s.cy > hh + s.baseRadius * 1.5) s.cy = -hh - s.baseRadius * 1.5;
      if (s.cy < -hh - s.baseRadius * 1.5) s.cy = hh + s.baseRadius * 1.5;

      // Drift secondary offset (wanders independently)
      s.ox += s.vox * dt;
      s.oy += s.voy * dt;
      // Keep secondary offset within ±baseRadius
      const oMag = Math.sqrt(s.ox * s.ox + s.oy * s.oy);
      if (oMag > s.baseRadius * 0.55) {
        s.vox *= -1;
        s.voy *= -1;
      }

      // Advance Fourier mode phases
      for (const m of s.modes) m.phase += m.speed * dt;

      const beatSwell = 1 + this.megaBeatDecay * 0.12 + this.beatDecay * 0.06;

      const a = s.alpha;
      const pass = si * STAIN_PASSES; // this stain's slice of `stainPts`

      // ── Primary blob — 3 concentric passes: wide dim → mid → core ──────────
      this.stainGfx
        .poly(this.buildStainPts(pass, s, s.cx, s.cy, 1.4, beatSwell))
        .fill(fillStyle(s.color, a * 0.3));
      this.stainGfx
        .poly(this.buildStainPts(pass + 1, s, s.cx, s.cy, 1.0, beatSwell))
        .fill(fillStyle(s.color, a * 0.55));
      this.stainGfx
        .poly(this.buildStainPts(pass + 2, s, s.cx, s.cy, 0.6, beatSwell))
        .fill(fillStyle(s.color, a * 0.9));

      // ── Secondary offset blob — lighter, adds asymmetric paint-splash feel ──
      const sx2 = s.cx + s.ox;
      const sy2 = s.cy + s.oy;
      this.stainGfx
        .poly(this.buildStainPts(pass + 3, s, sx2, sy2, 0.85, beatSwell))
        .fill(fillStyle(s.color, a * 0.35));
      this.stainGfx
        .poly(this.buildStainPts(pass + 4, s, sx2, sy2, 0.5, beatSwell))
        .fill(fillStyle(s.color, a * 0.55));
    }
  }

  /**
   * Build one smooth stain polygon at (cx, cy) into the pre-allocated buffer
   * `stainPts[slot]` and return it.
   *
   * Each Fourier mode's amplitude and phase collapse into a single sine/cosine
   * pair before the vertex loop, so the loop itself is table lookups and
   * multiply-adds with no `Math.sin` calls and no array growth.
   */
  private buildStainPts(
    slot: number,
    s: FluidStain,
    cx: number,
    cy: number,
    rScale: number,
    beatSwell: number,
  ): number[] {
    const pts = this.stainPts[slot];
    const modeCount = s.modes.length;

    for (let mi = 0; mi < modeCount; mi++) {
      const m = s.modes[mi];
      const amp = m.amp * rScale;
      this.stainModeSin[mi] = amp * Math.sin(m.phase);
      this.stainModeCos[mi] = amp * Math.cos(m.phase);
    }

    const base = STAIN_H[0];
    const baseR = s.baseRadius * rScale * beatSwell;

    for (let i = 0; i <= STAIN_VERTS; i++) {
      let r = baseR;
      for (let mi = 0; mi < modeCount; mi++) {
        const h = STAIN_H[mi];
        r +=
          h.sin[i] * this.stainModeCos[mi] + h.cos[i] * this.stainModeSin[mi];
      }
      pts[i * 2] = cx + base.cos[i] * r;
      pts[i * 2 + 1] = cy + base.sin[i] * r;
    }

    return pts;
  }

  // ── Rain ───────────────────────────────────────────────────────────────────

  private createRainDrops(): RainDrop[] {
    return Array.from({ length: RAIN_COUNT }, () =>
      this.resetRainDrop(
        {
          x: 0,
          y: 0,
          vy: 0,
          vx: 0,
          length: 0,
          width: 0,
          color: 0,
          alpha: 0,
          phase: 0,
        },
        true,
      ),
    );
  }

  /**
   * Randomise a raindrop in place. `scattered` = true means random Y across the
   * full screen height. Recycling the existing drop keeps the wrap-around in
   * `drawRain()` from allocating a replacement object every time one exits.
   */
  private resetRainDrop(d: RainDrop, scattered: boolean): RainDrop {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    d.vy = 280 + Math.random() * 420; // px/s
    d.x = (Math.random() - 0.5) * hw * 2.4;
    // Not scattered → spawn just above the top edge
    d.y = scattered
      ? (Math.random() - 0.5) * hh * 2
      : -hh - Math.random() * 200;
    d.vx = (Math.random() - 0.5) * 40; // slight lateral drift
    d.length = 28 + Math.random() * 80;
    d.width = 0.4 + Math.random() * 1.2;
    d.color = randomFrom(CATT_ALL);
    d.alpha = 0.12 + Math.random() * 0.3;
    d.phase = Math.random() * Math.PI * 2;
    return d;
  }

  /**
   * Rain effect — angled streaks with 3-pass gradient:
   *   pass 1 (wide, dim)  — outer glow / bloom
   *   pass 2 (mid)        — soft body
   *   pass 3 (thin, full) — sharp core
   *
   * Each drop's tail fades toward the top and has a bright "leading-edge" dot
   * at the bottom tip, simulating a raindrop head.
   *
   * Beat: drops accelerate on primary beat; mega-beat briefly doubles the
   * population with a burst of new drops from the top.
   */
  private drawRain(dt: number): void {
    this.rainGfx.clear();
    if (this.w === 0) return;

    // Slow oscillating wind — shifts all drops' horizontal drift together
    this.rainWindPhase += dt * 0.18;
    const wind = Math.sin(this.rainWindPhase) * 22; // ±22 px/s lateral gust

    const speedBoost =
      1 +
      this.beatDecay * 1.6 +
      this.megaBeatDecay * 3.0 +
      this.dropDecay * 1.2;

    const hh = this.h * 0.5;

    for (const d of this.rainDrops) {
      // ── Move ──────────────────────────────────────────────────────────────
      d.y += d.vy * dt * speedBoost;
      d.x += (d.vx + wind) * dt;

      // Wrap — when the head passes below the bottom edge, re-spawn at top
      if (d.y - d.length > hh + 20) {
        this.resetRainDrop(d, false);
        continue;
      }

      // ── Compute draw coords ───────────────────────────────────────────────
      // Slight wind-angle tilt — head at (hx, hy), tail at (tx, ty)
      const angle = Math.atan2(d.vy, d.vx + wind);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hx = d.x;
      const hy = d.y;
      const tx = d.x - cos * d.length;
      const ty = d.y - sin * d.length;

      // Beat twinkle — alpha flickers slightly per-drop using individual phase
      const twinkle = 0.75 + 0.25 * Math.sin(this.time * 3.5 + d.phase);
      const a = d.alpha * twinkle * (1 + this.beatDecay * 0.4);

      // ── 3-pass glow drawing ───────────────────────────────────────────────
      // Pass 1 — wide outer bloom (very transparent)
      this.rainGfx
        .moveTo(tx, ty)
        .lineTo(hx, hy)
        .stroke(strokeStyle(d.color, a * 0.08, d.width * 6, "round"));
      // Pass 2 — medium soft body
      this.rainGfx
        .moveTo(tx, ty)
        .lineTo(hx, hy)
        .stroke(strokeStyle(d.color, a * 0.28, d.width * 2.2, "round"));
      // Pass 3 — sharp core
      this.rainGfx
        .moveTo(tx, ty)
        .lineTo(hx, hy)
        .stroke(strokeStyle(d.color, a, d.width, "round"));

      // ── Simulate gradient: secondary short segment near head is brighter ──
      const gradLen = d.length * 0.3;
      const gx = d.x - cos * gradLen;
      const gy = d.y - sin * gradLen;
      this.rainGfx
        .moveTo(gx, gy)
        .lineTo(hx, hy)
        .stroke(strokeStyle(0xffffff, a * 0.22, d.width * 1.5, "round"));

      // ── Leading-edge head dot — bright tip ───────────────────────────────
      const headR = d.width * 1.8;
      this.rainGfx
        .circle(hx, hy, headR * 3.0)
        .fill(fillStyle(d.color, a * 0.12)); // outer bloom
      this.rainGfx.circle(hx, hy, headR).fill(fillStyle(0xffffff, a * 0.55)); // white core

      // ── Splash dot on beat when near the "floor" (lower 15% of screen) ──
      if (hy > hh * 0.7 && this.beatDecay > 0.3 && Math.random() < 0.04) {
        const splashR = 1.5 + Math.random() * 3;
        this.rainGfx
          .circle(hx, hy, splashR * 2.5)
          .fill(fillStyle(d.color, a * 0.18));
        this.rainGfx.circle(hx, hy, splashR).fill(fillStyle(0xffffff, a * 0.4));
      }
    }
  }

  // ── Init helpers ───────────────────────────────────────────────────────────

  private createNetDots(): NetDot[] {
    return Array.from({ length: NET_DOT_COUNT }, () => {
      const ang = Math.random() * Math.PI * 2;
      // Distribute across full screen area
      const rx = 100 + Math.random() * 800;
      const ry = 100 + Math.random() * 500;
      return {
        x: Math.cos(ang) * rx,
        y: Math.sin(ang) * ry,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18,
        size: 1.2 + Math.random() * 2.0,
        color: randomFrom(CATT_ALL),
        alpha: 0.25 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
      };
    });
  }

  private createStains(): FluidStain[] {
    // Bright Catppuccin Mocha — vivid hues, very low alpha
    const stainColors = [
      0xf38ba8, // pink
      0xfab387, // peach / orange
      0xa6e3a1, // green
      0x94e2d5, // teal
      0x89b4fa, // blue
      0xcba6f7, // mauve
      0xf9e2af, // yellow
    ];

    return Array.from({ length: STAIN_COUNT }, (_, i) => {
      const ang = (i / STAIN_COUNT) * Math.PI * 2 + Math.random() * 1.5;
      const dist = 180 + Math.random() * 600;

      // 3 low Fourier modes — only smooth bumps, no spikes
      const modes = [
        // mode 1 — overall elongation, very slow drift
        {
          amp: 0.3 + Math.random() * 0.25,
          phase: Math.random() * Math.PI * 2,
          speed: 0.08 + Math.random() * 0.1,
        },
        // mode 2 — figure-8 / pinch
        {
          amp: 0.18 + Math.random() * 0.15,
          phase: Math.random() * Math.PI * 2,
          speed: 0.13 + Math.random() * 0.14,
        },
        // mode 3 — trefoil wobble
        {
          amp: 0.1 + Math.random() * 0.1,
          phase: Math.random() * Math.PI * 2,
          speed: 0.2 + Math.random() * 0.18,
        },
      ].map((m) => ({ ...m, amp: m.amp * (90 + Math.random() * 80) })); // scale amp to px

      return {
        cx: Math.cos(ang) * dist,
        cy: Math.sin(ang) * dist,
        vcx: (Math.random() - 0.5) * 55,
        vcy: (Math.random() - 0.5) * 55,
        baseRadius: 90 + Math.random() * 130,
        color: stainColors[i % stainColors.length],
        alpha: 0.04 + Math.random() * 0.05, // 4–9 % — super transparent
        modes,
        ox: (Math.random() - 0.5) * 40,
        oy: (Math.random() - 0.5) * 40,
        vox: (Math.random() - 0.5) * 8,
        voy: (Math.random() - 0.5) * 8,
      };
    });
  }

  private createParticles(): DustParticle[] {
    const colors = [
      WHITE,
      CATT_MAUVE,
      CATT_SKY,
      CATT_PEACH,
      TOXIC_GREEN,
      CATT_PINK,
    ];
    return Array.from({ length: PARTICLE_COUNT }, () => {
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 700;
      return {
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        vx: (Math.random() - 0.5) * 28,
        vy: (Math.random() - 0.5) * 28 - 7,
        size: 0.6 + Math.random() * 2.6,
        alpha: 0.15 + Math.random() * 0.55,
        color: colors[Math.floor(Math.random() * colors.length)],
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2.5,
      };
    });
  }
}
