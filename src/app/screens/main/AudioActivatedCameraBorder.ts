import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
// Razer signature greens + LoL blues/purples + toxic black-green-violet

const RAZER_GREEN = 0x00ff41;
const LIME_GREEN = 0x44d62c;
const TOXIC_GREEN = 0x39ff14;
const TOXIC_LIME = 0x7fff00;
const LOL_BLUE = 0x0bc4e3;
const LOL_TEAL = 0x00f0d0;
const LOL_VIOLET = 0xc050ff;
const LOL_PURPLE = 0x7b2fbe;
const DEEP_BLUE = 0x1a4adb;
const TOXIC_VIOLET = 0x8b00ff;
const TOXIC_PURPLE = 0x5f00a8;
// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CATT_MAUVE = 0xcba6f7;
const CATT_PINK = 0xf38ba8;
const CATT_PEACH = 0xfab387;
const CATT_YELLOW = 0xf9e2af;
const CATT_SKY = 0x89dceb;
const CATT_SAPPHIRE = 0x74c7ec;
const CATT_LAVENDER = 0xb4befe;
const CATT_TEAL_CAT = 0x94e2d5;
const DARK_CRUST = 0x11111b; // Catppuccin Mocha — deepest near-black
const INK_BLACK = 0x000000;

// Catppuccin-only subset for orbit dots
const CATT_PALETTE = [
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_YELLOW,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
  CATT_TEAL_CAT,
] as const;

type CattColor = (typeof CATT_PALETTE)[number];

function randomCatt(): CattColor {
  return CATT_PALETTE[Math.floor(Math.random() * CATT_PALETTE.length)];
}

const PALETTE = [
  RAZER_GREEN,
  LIME_GREEN,
  TOXIC_GREEN,
  TOXIC_LIME,
  LOL_BLUE,
  LOL_TEAL,
  LOL_VIOLET,
  LOL_PURPLE,
  DEEP_BLUE,
  TOXIC_VIOLET,
  TOXIC_PURPLE,
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_YELLOW,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
  CATT_TEAL_CAT,
] as const;

type PaletteColor = (typeof PALETTE)[number];

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Particle {
  angle: number;
  radiusOffset: number;
  orbitSpeed: number;
  driftAmplitude: number;
  driftSpeed: number;
  driftPhase: number;
  size: number;
  baseAlpha: number;
  alphaSpeed: number;
  color: PaletteColor;
}

interface BrushStroke {
  angle: number;
  arcLength: number;
  width: number;
  alpha: number;
  decay: number;
  color: PaletteColor;
  radialOffset: number;
  bristleOffsets: number[];
  hasDrip: boolean;
  dripLength: number;
}

interface GraffitiTag {
  node: Text;
  baseX: number;
  baseY: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitBase: number; // centre angle in upper arc (–π..0)
  orbitSwing: number; // half-range of back-and-forth (rad)
  oscSpeed: number; // oscillation frequency (rad/s)
  oscPhase: number; // initial phase offset
  baseRot: number;
  alphaMin: number;
  alphaMax: number;
  alphaSpeed: number;
  alphaPhase: number;
  bobAmp: number;
  bobSpeed: number;
  bobPhase: number;
}

interface SurfaceLine {
  x1: number;
  y1: number;
  cpX: number;
  cpY: number; // quadratic control point
  x2: number;
  y2: number;
  width: number;
  alpha: number;
  driftSpeed: number;
  driftPhase: number;
  driftAmp: number;
  life: number; // 0..1 current visibility
  fadeDir: 1 | -1; // +1 fading in, -1 fading out
  fadeSpeed: number; // units per second
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  decay: number;
  rotation: number;
  rotSpeed: number;
  color: PaletteColor;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  trailLen: number;
  color: PaletteColor;
}

interface LightningBolt {
  points: Array<[number, number]>;
  alpha: number;
  decay: number;
  color: number;
  width: number;
}

interface OrbitDot {
  angle: number; // current angular position (radians)
  speed: number; // radians per second, signed (CW or CCW)
  radiusOffset: number; // pixels offset from baseRadius
  size: number; // dot radius in px
  color: CattColor;
  alphaPhase: number; // phase for alpha pulse
  alphaSpeed: number; // Hz of alpha pulse
  glowAlpha: number; // soft halo alpha multiplier (0..1)
}

interface FluidStain {
  // Orbital position
  angle: number; // current angular position around the ring (radians)
  speed: number; // orbital speed rad/s, signed (CW / CCW)
  orbitRadius: number; // distance from origin — near the ring edge
  // Blob self-rotation
  rotation: number; // shape rotation angle (radians)
  rotSpeed: number; // shape rotation speed rad/s
  // Radial drift (float in/out from orbitRadius)
  floatAmp: number; // amplitude px
  floatSpeed: number; // oscillation frequency Hz
  floatPhase: number; // per-stain phase offset
  // Blob geometry
  baseRadius: number; // nominal blob size px
  color: CattColor;
  baseAlpha: number; // 0.05..0.12 — super transparent
  // Smooth Fourier deformation — modes 1, 2, 3 only (no spikes)
  modes: Array<{ amp: number; phase: number; speed: number }>;
}

/**
 * A floating Nerd Font / Unicode symbol that orbits the camera ring,
 * vibrates in scale, and pulses its alpha for a glowing effect.
 */
interface FloatingSymbol {
  node: Text;
  angle: number; // current orbital position (rad)
  orbitSpeed: number; // rad/s, signed (CW / CCW)
  orbitRadius: number; // px from centre — always outside the ring
  vibeAmp: number; // scale oscillation amplitude (0.1 = ±10 %)
  vibeSpeed: number; // rad/s
  vibePhase: number;
  alphaBase: number; // centre alpha value
  alphaAmp: number; // alpha pulse depth
  alphaSpeed: number;
  alphaPhase: number;
  jitterAmp: number; // positional jitter radius px
  jitterPhase: number;
  baseScale: number;
}

interface GlitchBand {
  y: number;
  height: number;
  shiftX: number;
  alpha: number;
}

interface WaveConfig {
  color: number;
  waveCount: number;
  baseAmplitude: number;
  speed: number;
  radiusScale: number;
  phaseOffset: number;
  lineWidth: number; // base core stroke width in px
  breatheMode: "calm" | "bass" | "electric" | "fluid";
}

// wander=random, orbit=circular, bounce=elastic, pulse=scale-oscillate, beat=heartbeat-kick, float=slow-bob, spin=fast-rotate
type AnimStyle =
  | "wander"
  | "orbit"
  | "bounce"
  | "pulse"
  | "beat"
  | "float"
  | "spin";

interface GraffitiOrbitSprite {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  dirTimer: number;
  dirInterval: number;
  rotSpeed: number;
  baseScale: number;
  cellIdx: number; // index into SPRITE_CELLS
  swapTimer: number; // countdown seconds until next swap
  swapInterval: number; // seconds between swaps
  fadeAlpha: number; // 0..1
  fadingOut: boolean; // true = fading out to swap texture
  animStyle: AnimStyle;
  phase: number; // random phase for oscillations
  pulseSpeed: number; // rad/s for pulse/float breathe
  pulseAmp: number; // scale amplitude for pulse
  beatTimer: number; // countdown to next heartbeat kick
  beatInterval: number; // seconds between kicks
  beatScale: number; // current kick multiplier, decays to 1.0
  orbitAngle: number; // current angle for orbit style
  orbitRadius: number; // orbit distance from centre
  orbitSpeed: number; // rad/s, signed — CW or CCW
}

// ── Graffiti splat frame crops (source: 6000 × 2864 px sheet) ────────────────
// Each entry is a [x, y, w, h] rect cropping one element from the spritesheet.

// ── Sprite sheet grid (sprite.png — 2048×2048, 8×8 grid, 256 px per cell) ─────
// Each entry is [col, row] (0-based). Cell size = 256.

const CELL = 256;
const SPRITE_CELLS: [number, number][] = [
  [0, 0], // skull
  [1, 0], // X mark
  [3, 0], // XO tag
  [4, 0], // + cross
  [7, 0], // skull variant
  [0, 1], // XO text
  [1, 1], // laptop
  [5, 1], // ring/circle
  [0, 2], // grunge ring
  [2, 2], // tooth
  [3, 2], // teeth/mouth
  [6, 2], // laptop alt
  [7, 2], // skull side
  [4, 4], // gun
  [0, 5], // skull front
  [2, 5], // X large
  [3, 5], // + large
  [1, 6], // XO spray
  [5, 6], // skull grin
  [6, 6], // gun alt
];

// ── Wave configs — TrapNation neon-tube style ─────────────────────────────────

const WAVE_CONFIGS: WaveConfig[] = [
  // ── Catppuccin structural ring (1 anchor) ────────────────────────────────
  {
    color: CATT_TEAL_CAT,
    waveCount: 2,
    baseAmplitude: 4,
    speed: 0.02,
    radiusScale: 0.87,
    phaseOffset: 0.0,
    lineWidth: 8,
    breatheMode: "bass",
  },
  // ── Colorful rings ────────────────────────────────────────────────────────
  {
    color: CATT_PINK,
    waveCount: 8,
    baseAmplitude: 6,
    speed: -0.36,
    radiusScale: 0.9,
    phaseOffset: 1.6,
    lineWidth: 1.2,
    breatheMode: "electric",
  },
  {
    color: TOXIC_VIOLET,
    waveCount: 12,
    baseAmplitude: 3,
    speed: 0.74,
    radiusScale: 0.93,
    phaseOffset: 1.8,
    lineWidth: 2.0,
    breatheMode: "electric",
  },
  {
    color: LOL_VIOLET,
    waveCount: 9,
    baseAmplitude: 5,
    speed: 0.18,
    radiusScale: 0.96,
    phaseOffset: 2.3,
    lineWidth: 1.5,
    breatheMode: "fluid",
  },
  {
    color: RAZER_GREEN,
    waveCount: 7,
    baseAmplitude: 7,
    speed: 0.4,
    radiusScale: 0.99,
    phaseOffset: 0.0,
    lineWidth: 2.5,
    breatheMode: "bass",
  },
  {
    color: TOXIC_GREEN,
    waveCount: 3,
    baseAmplitude: 14,
    speed: -0.11,
    radiusScale: 1.02,
    phaseOffset: 0.7,
    lineWidth: 3.0,
    breatheMode: "bass",
  },
  {
    color: LOL_BLUE,
    waveCount: 5,
    baseAmplitude: 9,
    speed: -0.26,
    radiusScale: 1.05,
    phaseOffset: 1.1,
    lineWidth: 1.5,
    breatheMode: "calm",
  },
  {
    color: CATT_MAUVE,
    waveCount: 4,
    baseAmplitude: 11,
    speed: 0.22,
    radiusScale: 1.09,
    phaseOffset: 0.4,
    lineWidth: 2.0,
    breatheMode: "fluid",
  },
];

const WAVE_STEPS = 240;

// ── Graffiti tag definitions ──────────────────────────────────────────────────

const GRAFFITI_DEFS: Array<{
  label: string;
  size: number;
  color: PaletteColor;
  angle: number;
  rOffset: number;
  rot: number;
}> = [
  {
    label: "steeze",
    size: 26,
    color: RAZER_GREEN,
    angle: 0.3,
    rOffset: -18,
    rot: -0.15,
  },
  {
    label: "aura",
    size: 20,
    color: TOXIC_VIOLET,
    angle: 3.5,
    rOffset: 22,
    rot: 0.2,
  },
  {
    label: "UP",
    size: 15,
    color: TOXIC_GREEN,
    angle: 1.1,
    rOffset: -12,
    rot: -0.25,
  },
  {
    label: "raw",
    size: 22,
    color: LOL_VIOLET,
    angle: 1.8,
    rOffset: 20,
    rot: 0.05,
  },
  {
    label: "fire",
    size: 30,
    color: TOXIC_LIME,
    angle: 2.5,
    rOffset: -22,
    rot: 0.3,
  },
  {
    label: "cringe",
    size: 34,
    color: RAZER_GREEN,
    angle: 4.1,
    rOffset: 26,
    rot: -0.1,
  },
  {
    label: "tox",
    size: 24,
    color: LOL_BLUE,
    angle: 5.2,
    rOffset: -16,
    rot: 0.18,
  },
  {
    label: "dose",
    size: 18,
    color: TOXIC_VIOLET,
    angle: 0.9,
    rOffset: 28,
    rot: -0.22,
  },
  {
    label: "vex",
    size: 20,
    color: TOXIC_GREEN,
    angle: 3.9,
    rOffset: -24,
    rot: 0.12,
  },
  {
    label: "void",
    size: 14,
    color: LIME_GREEN,
    angle: 5.8,
    rOffset: 16,
    rot: -0.08,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomPalette(): PaletteColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

/** Build a jagged lightning path between two points. */
function jaggedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  segments = 8,
  jaggedness = 22,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [[x1, y1]];
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len,
    py = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const offset = (Math.random() - 0.5) * jaggedness;
    pts.push([x1 + dx * t + px * offset, y1 + dy * t + py * offset]);
  }
  pts.push([x2, y2]);
  return pts;
}

// ── CameraBorder ──────────────────────────────────────────────────────────────

/**
 * Animated OBS-style circular camera-overlay border.
 *
 * Centre is FULLY TRANSPARENT — place this over a camera source in OBS.
 *
 * Layers (bottom → top):
 *   blurRingGfx  — soft toxic glow ring (BlurFilter, static, scale-breathed)
 *   brushGfx     — graffiti arc brush strokes with drips
 *   waveGfx      — 6 TrapNation neon-tube wave rings (beat + breathe)
 *   graffCont    — drawn marks (crosses, dots) + Text tags (XO, crazy, ★ …)
 *   surfaceGfx   — black ink lines draped over the surface
 *   effectGfx    — sparkles ✦, sparks, lightning arcs
 *   particleGfx  — orbiting coloured particles
 *   logoGfx      — logo glow / orbital rings (added on attachLogo)
 *   logoSprite   — worxbend logo badge (top-left corner)
 */
export class AudioActivatedCameraBorder extends Container {
  private readonly baseRadius: number;

  // ── Graphics layers ────────────────────────────────────────────────────────
  private readonly baseRingGfx: Graphics;
  private readonly brushGfx: Graphics;
  private readonly waveGfx: Graphics;
  private readonly graffCont: Container; // holds graffGfx + Text tags
  private readonly graffGfx: Graphics;
  private readonly surfaceGfx: Graphics;
  private readonly effectGfx: Graphics;
  private readonly particleGfx: Graphics;
  private readonly glitchGfx: Graphics; // pixel-glitch chromatic split — above waves
  private readonly splatCont: Container; // orbiting graffiti splat sprites
  private readonly orbitDotGfx: Graphics; // catppuccin dots orbiting the ring
  private readonly stainGfx: Graphics; // catppuccin fluid stains orbiting the ring
  private readonly symbolCont: Container; // floating Nerd Font / Unicode symbols

  // ── Logo ───────────────────────────────────────────────────────────────────
  private logoSprite: Sprite | null = null;
  private logoGfx: Graphics | null = null;
  private logoBaseScale = 1.0;

  // ── Graffiti orbit sprites ─────────────────────────────────────────────────
  private readonly splatSprites: GraffitiOrbitSprite[] = [];
  private splatSheetTexture: Texture | null = null;

  // Top-left corner at ~45° diagonal, distance ≈ 233 px from centre
  private static readonly LOGO_X = -165;
  private static readonly LOGO_Y = -165;
  private static readonly LOGO_SIZE = 96;

  // ── State ──────────────────────────────────────────────────────────────────
  private readonly particles: Particle[] = [];
  private readonly graffitiTags: GraffitiTag[] = [];
  private surfaceLines: SurfaceLine[] = [];
  private brushStrokes: BrushStroke[] = [];
  private sparkles: Sparkle[] = [];
  private sparks: Spark[] = [];
  private lightningBolts: LightningBolt[] = [];
  private readonly orbitDots: OrbitDot[] = [];
  private readonly fluidStains: FluidStain[] = [];
  private readonly floatingSymbols: FloatingSymbol[] = [];

  private time = 0;
  private glitchActive = false;
  private glitchEndTime = 0;
  private glitchNextTime = 2.5;
  private glitchShiftX = 0;
  private glitchBands: GlitchBand[] = [];
  private jitterAmp = 0;
  private brushAccum = 0;
  private sparkleAccum = 0;
  private sparkAccum = 0;
  private lightningAccum = 0;
  private beatAmplitude = 1.0;
  private nextBeatTime = 0.5;

  // ── Living-world state ─────────────────────────────────────────────────────
  // Slow macro envelope (0.4..1.0) — creates natural calm/active cycles
  private activityLevel = 0.7;
  // Per-ring independent drift phases (initialized in constructor)
  private readonly ringSpeedDrift: number[];
  private readonly ringAmpDrift: number[];

  // ── Mic audio ────────────────────────────────────────────────────────────────
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioData: Uint8Array<ArrayBuffer> | null = null;
  private audioVol = 0; // smoothed audio level 0..1

  private static readonly MIC_THRESHOLD = 0.15;

  private static readonly BRUSH_INTERVAL = 0.09;
  private static readonly SPARKLE_INTERVAL = 0.28;
  private static readonly SPARK_INTERVAL = 0.15;
  private static readonly LIGHTNING_INTERVAL = 5.0;
  private static readonly MAX_STROKES = 120;
  private static readonly MAX_SPARKS = 120;
  private static readonly MAX_SPARKLES = 60;
  private static readonly MAX_BOLTS = 8;

  constructor(radius = 200) {
    super();
    this.baseRadius = radius;

    // ── Build layer stack ──────────────────────────────────────────────────
    this.baseRingGfx = new Graphics();
    this.glitchGfx = new Graphics();
    this.brushGfx = new Graphics();
    this.waveGfx = new Graphics();
    this.graffGfx = new Graphics();
    this.graffCont = new Container();
    this.surfaceGfx = new Graphics();
    this.effectGfx = new Graphics();
    this.particleGfx = new Graphics();
    this.orbitDotGfx = new Graphics();
    this.stainGfx = new Graphics();
    this.symbolCont = new Container();
    this.splatCont = new Container();

    this.graffCont.addChild(this.graffGfx);

    this.addChild(this.baseRingGfx); // bottommost — bold solid anchor ring
    this.addChild(this.brushGfx);
    this.addChild(this.waveGfx);
    this.addChild(this.glitchGfx);
    this.addChild(this.graffCont);
    this.addChild(this.surfaceGfx);
    this.addChild(this.effectGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.stainGfx); // fluid stains — above particles, below orbit dots
    this.addChild(this.orbitDotGfx); // catppuccin orbit dots
    this.addChild(this.symbolCont); // floating symbols — topmost non-logo layer
    // splatCont and logo layers are added on attach* calls (topmost)

    // Per-ring independent drift — random starting phases so no two rings are in sync
    this.ringSpeedDrift = WAVE_CONFIGS.map(() => Math.random() * Math.PI * 2);
    this.ringAmpDrift = WAVE_CONFIGS.map(() => Math.random() * Math.PI * 2);

    this.drawBaseRing();
    this.initParticles();
    this.initOrbitDots();
    this.initFluidStains();
    this.initFloatingSymbols();
    this.initSurfaceLines();
    this.initGraffitiTags();

    void this.initAudio();
  }

  // ── Logo API ───────────────────────────────────────────────────────────────

  /**
   * Attach the worxbend logo badge to the top-left corner.
   * Call after the "main" asset bundle has been loaded (from show()).
   *
   * spine-pixi-v8 is installed — swap the Sprite for a SpineSprite once
   * you have exported .skel + .atlas from the Spine editor.
   */
  public attachLogo(texture: Texture): void {
    this.logoGfx = new Graphics();
    this.addChild(this.logoGfx);

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = AudioActivatedCameraBorder.LOGO_SIZE;
    sprite.scale.y = sprite.scale.x;
    sprite.x = AudioActivatedCameraBorder.LOGO_X;
    sprite.y = AudioActivatedCameraBorder.LOGO_Y;
    this.addChild(sprite);

    this.logoBaseScale = sprite.scale.x;
    this.logoSprite = sprite;
  }

  /**
   * Spawn graffiti splat sprites orbiting the border ring.
   * Call after the "main" asset bundle has been loaded (from show()).
   */
  public attachGraffitiSplats(texture: Texture): void {
    this.splatSheetTexture = texture;
    this.addChild(this.splatCont); // inserted below logo layers
    const usedIndices = new Set<number>();

    // 10 sprites distributed across 7 animation personalities
    const STYLES: AnimStyle[] = [
      "orbit",
      "bounce",
      "pulse",
      "beat",
      "float",
      "spin",
      "orbit",
      "bounce",
      "pulse",
      "wander",
    ];
    // Pixel sizes — variety keeps things visually interesting
    const SIZES = [80, 55, 70, 45, 65, 90, 55, 60, 75, 40];

    for (let i = 0; i < STYLES.length; i++) {
      let cellIdx: number;
      do {
        cellIdx = Math.floor(Math.random() * SPRITE_CELLS.length);
      } while (usedIndices.has(cellIdx));
      usedIndices.add(cellIdx);

      const [col, row] = SPRITE_CELLS[cellIdx];
      const frame = new Rectangle(col * CELL, row * CELL, CELL, CELL);
      const cropped = new Texture({ source: texture.source, frame });

      const sprite = new Sprite(cropped);
      sprite.anchor.set(0.5);
      const baseScale = SIZES[i] / CELL;
      sprite.scale.set(baseScale);
      sprite.blendMode = "screen";
      sprite.alpha = 0;

      const style = STYLES[i];
      const phase = Math.random() * Math.PI * 2;
      const startAngle = (i / STYLES.length) * Math.PI * 2;
      const startR = this.baseRadius + 22 + Math.random() * 65;
      sprite.x = Math.cos(startAngle) * startR;
      sprite.y = Math.sin(startAngle) * startR;

      this.splatCont.addChild(sprite);

      const initSpeed =
        style === "float"
          ? 8 + Math.random() * 12
          : style === "bounce"
            ? 60 + Math.random() * 80
            : 25 + Math.random() * 55;
      const ang = Math.random() * Math.PI * 2;
      const beatInterval = 0.8 + Math.random() * 1.2;

      this.splatSprites.push({
        sprite,
        x: sprite.x,
        y: sprite.y,
        vx: Math.cos(ang) * initSpeed,
        vy: Math.sin(ang) * initSpeed,
        targetVx: Math.cos(ang) * initSpeed,
        targetVy: Math.sin(ang) * initSpeed,
        dirTimer: Math.random() * 2.0,
        dirInterval: 1.2 + Math.random() * 2.5,
        rotSpeed:
          style === "spin"
            ? (1.8 + Math.random() * 2.2) * (Math.random() < 0.5 ? 1 : -1)
            : (Math.random() - 0.5) * 0.6,
        baseScale,
        cellIdx,
        swapTimer: 1.5 + i * 0.7 + Math.random() * 2.0,
        swapInterval: 3.5 + Math.random() * 4.5,
        fadeAlpha: 0,
        fadingOut: false,
        animStyle: style,
        phase,
        pulseSpeed: 1.2 + Math.random() * 2.5,
        pulseAmp: 0.25 + Math.random() * 0.35,
        beatTimer: Math.random() * beatInterval,
        beatInterval,
        beatScale: 1.0,
        orbitAngle: startAngle,
        orbitRadius: startR,
        orbitSpeed:
          (0.08 + Math.random() * 0.22) * (Math.random() < 0.5 ? 1 : -1),
      });
    }
  }

  private animateSplatSprites(breathe: number): void {
    const dt = 1 / 60;
    const t = this.time;

    for (const s of this.splatSprites) {
      // ── Orbit — speed scales with audio ───────────────────────────────────
      s.orbitAngle += s.orbitSpeed * dt * (1 + this.audioVol * 3.5);
      const orbitR = s.orbitRadius * breathe;
      s.x = Math.cos(s.orbitAngle) * orbitR;
      s.y = Math.sin(s.orbitAngle) * orbitR;

      // ── Zoom-in / zoom-out: |sin| gives a symmetric expand-contract pulse ──
      // Speed and depth both scale with audio so at silence scaleF ≈ baseScale
      const zoomSpeed = s.pulseSpeed * (1 + this.audioVol * 3.0);
      const zoomDepth = 0.1 + this.audioVol * 1.4;
      const scaleF =
        1 + zoomDepth * Math.abs(Math.sin(t * zoomSpeed + s.phase));

      s.sprite.x = s.x;
      s.sprite.y = s.y;
      s.sprite.rotation += s.rotSpeed * dt * (1 + this.audioVol * 2.0);
      s.sprite.scale.set(s.baseScale * scaleF);

      // ── Swap lifecycle (unchanged) ─────────────────────────────────────────
      if (s.fadingOut) {
        s.fadeAlpha -= dt * 3.0;
        if (s.fadeAlpha <= 0) {
          s.fadeAlpha = 0;
          s.fadingOut = false;
          let newIdx: number;
          do {
            newIdx = Math.floor(Math.random() * SPRITE_CELLS.length);
          } while (newIdx === s.cellIdx);
          s.cellIdx = newIdx;
          if (this.splatSheetTexture) {
            const [col, row] = SPRITE_CELLS[newIdx];
            const frame = new Rectangle(col * CELL, row * CELL, CELL, CELL);
            s.sprite.texture = new Texture({
              source: this.splatSheetTexture.source,
              frame,
            });
          }
          s.swapTimer = s.swapInterval;
        }
      } else {
        s.fadeAlpha = Math.min(1.0, s.fadeAlpha + dt * 3.0);
        if (s.fadeAlpha >= 1.0) {
          s.swapTimer -= dt;
          if (s.swapTimer <= 0) s.fadingOut = true;
        }
      }
      // Gate alpha to mic: invisible when silent, pop in as audio rises
      s.sprite.alpha = s.fadeAlpha * Math.min(1.0, this.audioVol * 4.0);
    }
  }

  // ── Init helpers ───────────────────────────────────────────────────────────

  /** Bold solid anchor ring — Catppuccin Crust, no blur. Drawn once, scaled via breathe. */
  private drawBaseRing(): void {
    this.baseRingGfx
      .circle(0, 0, this.baseRadius)
      .stroke({ color: DARK_CRUST, alpha: 1.0, width: 10 });
  }

  private initParticles(): void {
    const count = 70;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2,
        radiusOffset: (Math.random() - 0.5) * 24,
        orbitSpeed:
          (0.0015 + Math.random() * 0.005) * (Math.random() < 0.5 ? 1 : -1),
        driftAmplitude: 4 + Math.random() * 10,
        driftSpeed: 0.35 + Math.random() * 0.9,
        driftPhase: Math.random() * Math.PI * 2,
        size: 1.5 + Math.random() * 4,
        baseAlpha: 0.5 + Math.random() * 0.5,
        alphaSpeed: 0.5 + Math.random() * 2,
        color: randomPalette(),
      });
    }
  }

  private initOrbitDots(): void {
    // 24 dots spread around the ring — Catppuccin palette only.
    // Mix of sizes (small accent dots + a few larger beacons), CW and CCW speeds.
    const count = 24;
    for (let i = 0; i < count; i++) {
      const startAngle = (i / count) * Math.PI * 2;
      // Alternate direction — every third dot reverses
      const dir = i % 3 === 0 ? -1 : 1;
      // Speed band: slow pack (0.3–0.6 rad/s) and fast outliers (0.9–1.6 rad/s)
      const fast = i % 7 === 0;
      const speed =
        dir * (fast ? 0.9 + Math.random() * 0.7 : 0.25 + Math.random() * 0.35);
      // Hug the ring: small random offset so they spread slightly around the border
      const radiusOffset = (Math.random() - 0.5) * 18;
      // Size variety: most are small dots, a few are medium beacons
      const beacon = i % 5 === 0;
      const size = beacon ? 5 + Math.random() * 3 : 2 + Math.random() * 2.5;

      this.orbitDots.push({
        angle: startAngle,
        speed,
        radiusOffset,
        size,
        color: randomCatt(),
        alphaPhase: Math.random() * Math.PI * 2,
        alphaSpeed: 0.4 + Math.random() * 1.2,
        glowAlpha: beacon ? 0.22 : 0.1,
      });
    }
  }

  private initFluidStains(): void {
    const count = 10;
    const colors: CattColor[] = [
      CATT_PINK,
      CATT_PEACH,
      CATT_MAUVE,
      CATT_TEAL_CAT,
      CATT_SKY,
      CATT_LAVENDER,
      CATT_YELLOW,
      CATT_SAPPHIRE,
    ];

    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const speed = dir * (0.06 + Math.random() * 0.14); // slower than dots

      // Fourier modes 1–3 only → smooth large bumps, never spiky
      const baseR = 14 + Math.random() * 10; // 14–24 px — small accent blobs
      const modes = [
        {
          amp: baseR * (0.28 + Math.random() * 0.18),
          phase: Math.random() * Math.PI * 2,
          speed: 0.07 + Math.random() * 0.09,
        },
        {
          amp: baseR * (0.14 + Math.random() * 0.12),
          phase: Math.random() * Math.PI * 2,
          speed: 0.12 + Math.random() * 0.12,
        },
        {
          amp: baseR * (0.07 + Math.random() * 0.07),
          phase: Math.random() * Math.PI * 2,
          speed: 0.18 + Math.random() * 0.16,
        },
      ];

      // strictly outside the ring: baseRadius + 18..58 px beyond
      const orbitRadius = this.baseRadius + 18 + Math.random() * 40;

      this.fluidStains.push({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.4,
        speed,
        orbitRadius,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.35,
        floatAmp: 4 + Math.random() * 8, // smaller radial drift
        floatSpeed: 0.22 + Math.random() * 0.28,
        floatPhase: Math.random() * Math.PI * 2,
        baseRadius: baseR,
        color: colors[i % colors.length],
        baseAlpha: 0.2 + Math.random() * 0.18,
        modes,
      });
    }
  }

  private createSurfaceLine(): SurfaceLine {
    const r = this.baseRadius;
    const posAngle = Math.random() * Math.PI * 2;
    const rOff = (Math.random() - 0.5) * 52;
    const cx = Math.cos(posAngle) * (r + rOff);
    const cy = Math.sin(posAngle) * (r + rOff);
    const lineAng = Math.random() * Math.PI * 2;
    const halfLen = 14 + Math.random() * 36;
    const perpAng = lineAng + Math.PI * 0.5;
    const curveMag = (Math.random() - 0.5) * 18;
    return {
      x1: cx + Math.cos(lineAng) * halfLen,
      y1: cy + Math.sin(lineAng) * halfLen,
      x2: cx - Math.cos(lineAng) * halfLen,
      y2: cy - Math.sin(lineAng) * halfLen,
      cpX: cx + Math.cos(perpAng) * curveMag,
      cpY: cy + Math.sin(perpAng) * curveMag,
      width: 1.5 + Math.random() * 3.5,
      alpha: 0.5 + Math.random() * 0.5,
      driftSpeed: 0.04 + Math.random() * 0.12,
      driftPhase: Math.random() * Math.PI * 2,
      driftAmp: 3 + Math.random() * 6,
      life: Math.random(),
      fadeDir: Math.random() < 0.5 ? 1 : -1,
      fadeSpeed: 0.07 + Math.random() * 0.2,
    };
  }

  private initSurfaceLines(): void {
    for (let i = 0; i < 14; i++)
      this.surfaceLines.push(this.createSurfaceLine());
  }

  private initGraffitiTags(): void {
    const r = this.baseRadius;
    const graffStyle = (size: number, color: number) =>
      new TextStyle({
        fontFamily: "'Permanent Marker', 'Rock Salt', cursive",
        fontSize: size,
        fill: color,
        stroke: { color: INK_BLACK, width: Math.max(2, size * 0.14) },
      });

    for (let i = 0; i < GRAFFITI_DEFS.length; i++) {
      const def = GRAFFITI_DEFS[i];
      const x = Math.cos(def.angle) * (r + def.rOffset);
      const y = Math.sin(def.angle) * (r + def.rOffset);
      const tag = new Text({
        text: def.label,
        style: graffStyle(def.size, def.color),
      });
      tag.anchor.set(0.5);
      tag.x = x;
      tag.y = y;
      tag.rotation = def.rot;
      tag.alpha = 0;
      this.graffCont.addChild(tag);
      const orbitRadius = r + def.rOffset;
      const orbitBase = -Math.PI + (i / GRAFFITI_DEFS.length) * Math.PI;
      this.graffitiTags.push({
        node: tag,
        baseX: x,
        baseY: y,
        orbitAngle: orbitBase,
        orbitRadius,
        orbitBase,
        orbitSwing: 0.18 + Math.random() * 0.22,
        oscSpeed: 0.18 + Math.random() * 0.22,
        oscPhase: Math.random() * Math.PI * 2,
        baseRot: def.rot,
        alphaMin: 0.25 + Math.random() * 0.2,
        alphaMax: 0.75 + Math.random() * 0.25,
        alphaSpeed: 0.18 + Math.random() * 0.38,
        alphaPhase: Math.random() * Math.PI * 2,
        bobAmp: 3 + Math.random() * 6,
        bobSpeed: 0.25 + Math.random() * 0.5,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ── Mic audio ────────────────────────────────────────────────────────────────

  private async initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.audioContext = new AudioContext();
      const src = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      src.connect(this.analyser);
      this.audioData = new Uint8Array(
        this.analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
    } catch {
      // No mic available — audioVol stays 0
    }
  }

  private readRMS(): number {
    if (!this.analyser || !this.audioData) return 0;
    this.analyser.getByteTimeDomainData(this.audioData);
    let sum = 0;
    for (let i = 0; i < this.audioData.length; i++) {
      const v = (this.audioData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.audioData.length);
  }

  // ── Public update ──────────────────────────────────────────────────────────

  public update(): void {
    const dt = 1 / 60;
    this.time += dt;

    this.tickBeat(dt);

    // Dynamic intervals — scale with activity level
    const dynBrushInterval =
      AudioActivatedCameraBorder.BRUSH_INTERVAL /
      (0.4 + this.activityLevel * 0.8);
    const dynSparkleInterval =
      AudioActivatedCameraBorder.SPARKLE_INTERVAL /
      (0.3 + this.activityLevel * 0.9);
    const dynSparkInterval =
      AudioActivatedCameraBorder.SPARK_INTERVAL /
      (0.4 + this.activityLevel * 0.7);
    const dynLightningInterval =
      AudioActivatedCameraBorder.LIGHTNING_INTERVAL *
      (1.5 - this.activityLevel * 0.7);

    // Brush strokes
    this.brushAccum += dt;
    if (this.brushAccum >= dynBrushInterval) {
      this.brushAccum = 0;
      this.spawnBrushStroke();
    }
    this.brushStrokes = this.brushStrokes.filter((s) => {
      s.alpha -= s.decay * dt;
      return s.alpha > 0;
    });

    // Sparkles
    this.sparkleAccum += dt;
    if (this.sparkleAccum >= dynSparkleInterval) {
      this.sparkleAccum = 0;
      this.spawnSparkle();
    }
    this.sparkles = this.sparkles.filter((s) => {
      s.alpha -= s.decay * dt;
      return s.alpha > 0;
    });

    // Sparks
    this.sparkAccum += dt;
    if (this.sparkAccum >= dynSparkInterval) {
      this.sparkAccum = 0;
      this.spawnSparks();
    }
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);

    // Lightning
    this.lightningAccum += dt;
    if (
      this.lightningAccum >=
      dynLightningInterval * (0.7 + Math.random() * 0.6)
    ) {
      this.lightningAccum = 0;
      this.spawnLightning();
    }
    this.lightningBolts = this.lightningBolts.filter((b) => {
      b.alpha -= b.decay * dt;
      return b.alpha > 0;
    });

    // Particles
    const particleBoost = 1 + this.audioVol * 3.0;
    for (const p of this.particles) {
      p.angle += p.orbitSpeed * particleBoost;
    }

    // Fluid stains — advance orbit + self-rotation + Fourier mode phases
    const stainBoost = 1 + this.audioVol * 3.5;
    for (const stain of this.fluidStains) {
      stain.angle += stain.speed * dt * stainBoost;
      stain.rotation += stain.rotSpeed * dt * (1 + this.audioVol * 2.5);
      for (const m of stain.modes) m.phase += m.speed * dt * stainBoost;
    }

    // Floating symbols — orbital + vibration phases advance each frame
    const symBoost = 1 + this.audioVol * 2.5;
    for (const s of this.floatingSymbols) {
      s.angle += s.orbitSpeed * dt * symBoost;
      s.vibePhase += s.vibeSpeed * dt * (1 + this.audioVol * 3.5);
      s.alphaPhase += s.alphaSpeed * dt;
      s.jitterPhase += 1.7 * dt * symBoost;
    }

    this.drawFrame(dt);
  }

  // ── Audio-driven beat ─────────────────────────────────────────────────────

  private tickBeat(dt: number): void {
    const rms = this.readRMS() * 4;
    const threshold = AudioActivatedCameraBorder.MIC_THRESHOLD;
    const raw = rms < threshold ? 0 : (rms - threshold) / (1 - threshold);
    const vol = Math.max(0, Math.min(1, raw));

    // Smooth audioVol towards current reading
    this.audioVol += (vol - this.audioVol) * Math.min(1, dt * 8);

    // activityLevel: ambient floor at 0.3, driven up by audio
    this.activityLevel = 0.3 + this.audioVol * 0.7;

    // beatAmplitude tracks audio level with smooth interpolation
    const targetBeat = 1.0 + this.audioVol * 2.8;
    this.beatAmplitude +=
      (targetBeat - this.beatAmplitude) * Math.min(1, dt * 6);

    // jitterAmp scales with audio
    this.jitterAmp = this.audioVol * 0.7;

    // Beat-triggered events — fire periodically, intensity gated by audio
    if (this.time >= this.nextBeatTime) {
      const restStretch = 1 + (1 - this.activityLevel) * 1.3;
      const baseInterval = (0.4 + Math.random() * 0.4) * restStretch;
      this.nextBeatTime = this.time + baseInterval;

      if (this.audioVol > 0.25) {
        this.spawnSparks(true);
        if (Math.random() < 0.4 * this.audioVol) this.spawnLightning();
      }

      // Glitch: only during loud audio
      if (
        !this.glitchActive &&
        this.time >= this.glitchNextTime &&
        Math.random() < 0.1 * this.audioVol
      ) {
        this.glitchActive = true;
        this.glitchEndTime = this.time + 0.05 + Math.random() * 0.1;
        this.glitchNextTime = this.time + 4.0 + Math.random() * 5.0;
        this.glitchShiftX = 5 + Math.random() * 14;
        this.glitchBands = [];
        const bandCount = 2 + Math.floor(Math.random() * 4);
        for (let b = 0; b < bandCount; b++) {
          const angle = Math.random() * Math.PI * 2;
          const r = this.baseRadius + (Math.random() - 0.5) * 60;
          this.glitchBands.push({
            y: Math.sin(angle) * r,
            height: 2 + Math.random() * 8,
            shiftX: (Math.random() - 0.5) * this.glitchShiftX * 2,
            alpha: 0.4 + Math.random() * 0.5,
          });
        }
      }
    }
  }

  // ── Spawners ───────────────────────────────────────────────────────────────

  private spawnBrushStroke(): void {
    const color = randomPalette();
    const w = 3 + Math.random() * 10;
    this.brushStrokes.push({
      angle: Math.random() * Math.PI * 2,
      arcLength: 0.08 + Math.random() * 0.35,
      width: w,
      alpha: 0.55 + Math.random() * 0.45,
      decay: 0.1 + Math.random() * 0.28,
      color,
      radialOffset: (Math.random() - 0.5) * 44,
      bristleOffsets: [
        (Math.random() - 0.5) * w * 0.7,
        (Math.random() - 0.5) * w * 0.7,
        (Math.random() - 0.5) * w * 0.7,
      ],
      hasDrip: Math.random() < 0.3,
      dripLength: 12 + Math.random() * 28,
    });
    if (this.brushStrokes.length > AudioActivatedCameraBorder.MAX_STROKES) {
      this.brushStrokes.splice(
        0,
        this.brushStrokes.length - AudioActivatedCameraBorder.MAX_STROKES,
      );
    }
  }

  private spawnSparkle(): void {
    const angle = Math.random() * Math.PI * 2;
    const rOff = (Math.random() - 0.5) * 50;
    const r = this.baseRadius + rOff;
    this.sparkles.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      size: 4 + Math.random() * 12,
      alpha: 0.8 + Math.random() * 0.2,
      decay: 0.35 + Math.random() * 0.55,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 3,
      color: randomPalette(),
    });
    if (this.sparkles.length > AudioActivatedCameraBorder.MAX_SPARKLES) {
      this.sparkles.splice(
        0,
        this.sparkles.length - AudioActivatedCameraBorder.MAX_SPARKLES,
      );
    }
  }

  private spawnSparks(burst = false): void {
    const count = burst
      ? 6 + Math.floor(Math.random() * 8)
      : 3 + Math.floor(Math.random() * 4);
    const originAng = Math.random() * Math.PI * 2;
    const r = this.baseRadius + (Math.random() - 0.5) * 20;
    const ox = Math.cos(originAng) * r;
    const oy = Math.sin(originAng) * r;
    const color = randomPalette();
    for (let i = 0; i < count; i++) {
      const ang = originAng + (Math.random() - 0.5) * Math.PI * 0.7;
      const speed = 80 + Math.random() * 150;
      this.sparks.push({
        x: ox,
        y: oy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 1.0,
        decay: 1.4 + Math.random() * 2.0,
        trailLen: 5 + Math.random() * 12,
        color,
      });
    }
    if (this.sparks.length > AudioActivatedCameraBorder.MAX_SPARKS) {
      this.sparks.splice(
        0,
        this.sparks.length - AudioActivatedCameraBorder.MAX_SPARKS,
      );
    }
  }

  private spawnLightning(): void {
    const a1 = Math.random() * Math.PI * 2;
    const a2 = a1 + Math.PI * (0.25 + Math.random() * 0.9);
    const r = this.baseRadius + (Math.random() - 0.5) * 15;
    const x1 = Math.cos(a1) * r,
      y1 = Math.sin(a1) * r;
    const x2 = Math.cos(a2) * r,
      y2 = Math.sin(a2) * r;
    const col =
      Math.random() < 0.5
        ? RAZER_GREEN
        : Math.random() < 0.5
          ? 0xffffff
          : LOL_BLUE;
    const w = 1.0 + Math.random() * 1.5;
    this.lightningBolts.push({
      points: jaggedPath(x1, y1, x2, y2, 10, 22),
      alpha: 1.0,
      decay: 2.2 + Math.random() * 1.8,
      color: col,
      width: w,
    });
    // 40 % chance of a branch from the midpoint
    if (
      Math.random() < 0.4 &&
      this.lightningBolts.length < AudioActivatedCameraBorder.MAX_BOLTS
    ) {
      const mid = this.lightningBolts[this.lightningBolts.length - 1].points[5];
      const bAng = Math.random() * Math.PI * 2;
      const bLen = 22 + Math.random() * 38;
      this.lightningBolts.push({
        points: jaggedPath(
          mid[0],
          mid[1],
          mid[0] + Math.cos(bAng) * bLen,
          mid[1] + Math.sin(bAng) * bLen,
          5,
          12,
        ),
        alpha: 0.7,
        decay: 3.0 + Math.random() * 2.5,
        color: col,
        width: w * 0.6,
      });
    }
  }

  // ── Main draw ──────────────────────────────────────────────────────────────

  private drawFrame(dt: number): void {
    const breathe = 1.0;

    this.baseRingGfx.scale.set(1);

    // ── Brush strokes ────────────────────────────────────────────────────────
    this.brushGfx.clear();
    for (const s of this.brushStrokes) this.drawBrushStroke(s, breathe);

    // ── Floating symbols ──────────────────────────────────────────────────────
    this.updateFloatingSymbols(breathe);

    // ── TrapNation wave rings ─────────────────────────────────────────────────
    this.waveGfx.clear();
    for (let ci = 0; ci < WAVE_CONFIGS.length; ci++) {
      const cfg = WAVE_CONFIGS[ci];
      // Per-ring drift — audio accelerates each ring's phase wander
      const driftBoost = 1 + this.audioVol * 4.0;
      this.ringSpeedDrift[ci] +=
        dt * (0.008 + ci * 0.0005) * (ci % 2 === 0 ? 1 : -1) * driftBoost;
      this.ringAmpDrift[ci] += dt * (0.019 + ci * 0.002) * driftBoost;
      const speedMod = 1 + 0.28 * Math.sin(this.ringSpeedDrift[ci]);
      const ampEnv = 0.45 + 0.55 * Math.abs(Math.sin(this.ringAmpDrift[ci]));
      const phase =
        this.time * cfg.speed * speedMod * (1 + this.audioVol * 2.0) +
        cfg.phaseOffset;
      const amplitude = cfg.baseAmplitude * this.beatAmplitude * ampEnv;
      this.drawGlowWaveRing(
        this.baseRadius * breathe * cfg.radiusScale,
        cfg.color,
        cfg.waveCount,
        amplitude,
        phase,
        cfg.lineWidth,
        cfg.breatheMode,
      );
    }

    if (this.glitchActive && this.time >= this.glitchEndTime) {
      this.glitchActive = false;
      this.glitchBands = [];
    }
    this.glitchGfx.clear();
    if (this.glitchActive) this.drawGlitchEffect(breathe);

    // ── Graffiti marks + tags ─────────────────────────────────────────────────
    this.graffGfx.clear();
    this.drawGraffMarks(breathe);
    this.updateGraffitiTags(breathe);

    // ── Surface black lines ───────────────────────────────────────────────────
    this.surfaceGfx.clear();
    this.drawSurfaceLines();

    // ── Effects: sparkles, sparks, lightning ──────────────────────────────────
    this.effectGfx.clear();
    this.drawSparkles();
    this.drawSparks();
    this.drawLightning();

    // ── Orbiting particles ────────────────────────────────────────────────────
    this.particleGfx.clear();
    for (const p of this.particles) {
      const drift =
        Math.sin(this.time * p.driftSpeed + p.driftPhase) * p.driftAmplitude;
      const rp = (this.baseRadius + p.radiusOffset + drift) * breathe;
      const x = Math.cos(p.angle) * rp;
      const y = Math.sin(p.angle) * rp;
      const a =
        p.baseAlpha *
        (0.5 + 0.5 * Math.sin(this.time * p.alphaSpeed + p.driftPhase));
      this.particleGfx
        .circle(x, y, p.size * 2.5)
        .fill({ color: p.color, alpha: a * 0.12 });
      this.particleGfx.circle(x, y, p.size).fill({ color: p.color, alpha: a });
    }

    // ── Catppuccin orbit dots ─────────────────────────────────────────────────
    this.drawOrbitDots(dt, breathe);

    // ── Fluid stains ──────────────────────────────────────────────────────────
    this.drawFluidStains(breathe);

    // ── Logo badge ────────────────────────────────────────────────────────────
    if (this.logoSprite && this.logoGfx) this.animateLogo();

    // ── Graffiti orbit sprites ────────────────────────────────────────────────
    if (this.splatSprites.length > 0) this.animateSplatSprites(breathe);
  }

  // ── Brush stroke ───────────────────────────────────────────────────────────

  private drawBrushStroke(s: BrushStroke, breathe: number): void {
    const r = (this.baseRadius + s.radialOffset) * breathe;
    const start = s.angle - s.arcLength * 0.5;
    const end = s.angle + s.arcLength * 0.5;
    const sx = Math.cos(start) * r,
      sy = Math.sin(start) * r;

    // Fuzz halo
    this.brushGfx
      .moveTo(sx, sy)
      .arc(0, 0, r, start, end)
      .stroke({
        color: s.color,
        alpha: s.alpha * 0.12,
        width: s.width * 3,
        cap: "round",
      });
    // Bristle sub-arcs
    for (const bo of s.bristleOffsets) {
      const rb = r + bo;
      this.brushGfx
        .moveTo(Math.cos(start) * rb, Math.sin(start) * rb)
        .arc(0, 0, rb, start, end)
        .stroke({
          color: s.color,
          alpha: s.alpha * 0.35,
          width: 1,
          cap: "round",
        });
    }
    // Core stroke
    this.brushGfx
      .moveTo(sx, sy)
      .arc(0, 0, r, start, end)
      .stroke({ color: s.color, alpha: s.alpha, width: s.width, cap: "round" });
    // Drip
    if (s.hasDrip) {
      const mx = Math.cos(s.angle) * r,
        my = Math.sin(s.angle) * r;
      const tx = Math.cos(s.angle) * (r - s.dripLength);
      const ty = Math.sin(s.angle) * (r - s.dripLength);
      this.brushGfx
        .moveTo(mx, my)
        .lineTo(tx, ty)
        .stroke({
          color: s.color,
          alpha: s.alpha * 0.7,
          width: 2,
          cap: "round",
        });
      this.brushGfx
        .circle(tx, ty, 2)
        .fill({ color: s.color, alpha: s.alpha * 0.55 });
    }
  }

  // ── Graffiti drawn marks ───────────────────────────────────────────────────

  /**
   * Per-frame drawn decorations: cross (+), diagonal-cross (×), and dot clusters.
   * These supplement the Text-based tags with purely graphic marks.
   */
  private drawGraffMarks(breathe: number): void {
    const r = this.baseRadius * breathe;
    const gfx = this.graffGfx;

    // 8 static cross marks at fixed angular positions
    const markSpinRate = 0.008 + this.audioVol * 0.07;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + this.time * markSpinRate;
      const rOff = (i % 2 === 0 ? 1 : -1) * 28;
      const cx = Math.cos(ang) * (r + rOff);
      const cy = Math.sin(ang) * (r + rOff);
      const sz =
        (5 + 2 * Math.sin(this.time * 0.35 + i)) * (1 + this.audioVol * 2.0);
      const col =
        i % 3 === 0 ? TOXIC_GREEN : i % 3 === 1 ? TOXIC_VIOLET : RAZER_GREEN;
      const alpha =
        (0.4 + 0.3 * Math.sin(this.time * 0.25 + i * 0.9)) *
        (1 + this.audioVol * 0.7);

      if (i % 2 === 0) {
        // Regular cross +
        gfx
          .moveTo(cx - sz, cy)
          .lineTo(cx + sz, cy)
          .stroke({ color: col, alpha, width: 1.5, cap: "round" });
        gfx
          .moveTo(cx, cy - sz)
          .lineTo(cx, cy + sz)
          .stroke({ color: col, alpha, width: 1.5, cap: "round" });
      } else {
        // Diagonal cross ×
        gfx
          .moveTo(cx - sz, cy - sz)
          .lineTo(cx + sz, cy + sz)
          .stroke({ color: col, alpha, width: 1.5, cap: "round" });
        gfx
          .moveTo(cx + sz, cy - sz)
          .lineTo(cx - sz, cy + sz)
          .stroke({ color: col, alpha, width: 1.5, cap: "round" });
      }
    }

    // Scattered dot clusters
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + 0.4;
      const rOff2 = Math.sin(i * 1.7) * 35;
      const dx = Math.cos(ang) * (r + rOff2);
      const dy = Math.sin(ang) * (r + rOff2);
      const a = 0.3 + 0.25 * Math.sin(this.time * 0.45 + i * 1.3);
      const col = i % 2 === 0 ? INK_BLACK : TOXIC_GREEN;
      gfx
        .circle(dx, dy, 1.5 + Math.sin(this.time + i) * 0.8)
        .fill({ color: col, alpha: a });
    }
  }

  private updateGraffitiTags(breathe: number): void {
    const dt = 1 / 60;
    const swingBoost = 1 + this.audioVol * 2.5;
    for (const tag of this.graffitiTags) {
      tag.oscPhase += tag.oscSpeed * dt * swingBoost;
      const swingAmp = tag.orbitSwing * (1 + this.audioVol * 1.8);
      tag.orbitAngle = tag.orbitBase + Math.sin(tag.oscPhase) * swingAmp;
      const r = tag.orbitRadius * breathe;
      const bob =
        Math.sin(this.time * tag.bobSpeed + tag.bobPhase) *
        tag.bobAmp *
        (1 + this.audioVol * 3.0);
      tag.node.x = Math.cos(tag.orbitAngle) * r;
      tag.node.y = Math.sin(tag.orbitAngle) * r + bob;
      tag.node.rotation = tag.orbitAngle + Math.PI / 2 + tag.baseRot;
      // Scale: small when silent (0.55×), grows to 1.6× at full volume
      tag.node.scale.set(0.55 + this.audioVol * 1.05);
      // Alpha: fully transparent at silence, fully opaque when mic activates
      tag.node.alpha = Math.min(1.0, this.audioVol * 3.0);
    }
  }

  // ── Surface black lines ────────────────────────────────────────────────────

  private drawSurfaceLines(): void {
    const dt = 1 / 60;
    for (let i = this.surfaceLines.length - 1; i >= 0; i--) {
      const ln = this.surfaceLines[i];
      ln.life += ln.fadeDir * ln.fadeSpeed * dt * (1 + this.audioVol * 2.5);

      if (ln.life >= 1.0) {
        ln.life = 1.0;
        ln.fadeDir = -1;
      } else if (ln.life <= 0) {
        const fresh = this.createSurfaceLine();
        fresh.life = 0;
        fresh.fadeDir = 1;
        this.surfaceLines[i] = fresh;
        continue;
      }

      const dx =
        Math.sin(this.time * ln.driftSpeed + ln.driftPhase) * ln.driftAmp;
      const dy =
        Math.cos(this.time * ln.driftSpeed + ln.driftPhase) * ln.driftAmp;
      this.surfaceGfx
        .moveTo(ln.x1, ln.y1)
        .quadraticCurveTo(ln.cpX + dx, ln.cpY + dy, ln.x2, ln.y2)
        .stroke({
          color: INK_BLACK,
          alpha: ln.alpha * ln.life,
          width: ln.width * (1 + this.audioVol * 2.0),
          cap: "round",
        });
    }
  }

  // ── Effects: sparkles, sparks, lightning ──────────────────────────────────

  private drawSparkles(): void {
    for (const sp of this.sparkles) {
      sp.rotation += sp.rotSpeed / 60;
      const { x, y, size, alpha, rotation, color } = sp;
      const gfx = this.effectGfx;

      // 4 long cardinal rays
      for (let i = 0; i < 4; i++) {
        const a = rotation + (i / 4) * Math.PI * 2;
        gfx
          .moveTo(x, y)
          .lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size)
          .stroke({ color, alpha, width: 1.5, cap: "round" });
      }
      // 4 short diagonal rays
      for (let i = 0; i < 4; i++) {
        const a = rotation + Math.PI / 4 + (i / 4) * Math.PI * 2;
        gfx
          .moveTo(x, y)
          .lineTo(x + Math.cos(a) * size * 0.5, y + Math.sin(a) * size * 0.5)
          .stroke({ color, alpha: alpha * 0.55, width: 1.0, cap: "round" });
      }
      // Bright centre dot
      gfx.circle(x, y, 1.5).fill({ color, alpha });
      // Soft glow halo
      gfx.circle(x, y, size * 0.7).fill({ color, alpha: alpha * 0.08 });
    }
  }

  private drawSparks(): void {
    for (const sp of this.sparks) {
      const speed = Math.sqrt(sp.vx * sp.vx + sp.vy * sp.vy) || 1;
      const tx = sp.x - (sp.vx / speed) * sp.trailLen;
      const ty = sp.y - (sp.vy / speed) * sp.trailLen;
      this.effectGfx
        .moveTo(tx, ty)
        .lineTo(sp.x, sp.y)
        .stroke({ color: sp.color, alpha: sp.life, width: 1.5, cap: "round" });
      // Bright spark tip
      this.effectGfx
        .circle(sp.x, sp.y, 1.5)
        .fill({ color: sp.color, alpha: sp.life });
    }
  }

  private drawLightning(): void {
    for (const bolt of this.lightningBolts) {
      const pts = bolt.points;

      // Outer glow pass
      this.effectGfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++)
        this.effectGfx.lineTo(pts[i][0], pts[i][1]);
      this.effectGfx.stroke({
        color: bolt.color,
        alpha: bolt.alpha * 0.12,
        width: bolt.width * 7,
        cap: "round",
        join: "round",
      });

      // Mid glow pass
      this.effectGfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++)
        this.effectGfx.lineTo(pts[i][0], pts[i][1]);
      this.effectGfx.stroke({
        color: bolt.color,
        alpha: bolt.alpha * 0.35,
        width: bolt.width * 3,
        cap: "round",
        join: "round",
      });

      // Core bright line
      this.effectGfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++)
        this.effectGfx.lineTo(pts[i][0], pts[i][1]);
      this.effectGfx.stroke({
        color: bolt.color,
        alpha: bolt.alpha,
        width: bolt.width,
        cap: "round",
        join: "round",
      });
    }
  }

  // ── TrapNation glow wave ring ──────────────────────────────────────────────

  private drawGlowWaveRing(
    radius: number,
    color: number,
    waveCount: number,
    amplitude: number,
    phase: number,
    lineWidth: number,
    breatheMode: "calm" | "bass" | "electric" | "fluid",
  ): void {
    if (breatheMode === "calm") {
      const w = lineWidth * (1 + (this.beatAmplitude - 1) * 0.07);
      this.buildWavePath(radius, waveCount, amplitude, phase);
      this.waveGfx.stroke({ color, alpha: 0.04, width: w * 8 });
      this.buildWavePath(radius, waveCount, amplitude, phase);
      this.waveGfx.stroke({ color, alpha: 0.18, width: w * 3 });
      this.buildWavePath(radius, waveCount, amplitude, phase);
      this.waveGfx.stroke({ color, alpha: 0.88, width: w });
    } else if (breatheMode === "bass") {
      const beatFactor = 1 + (this.beatAmplitude - 1) * 0.85;
      const w = lineWidth * beatFactor;
      this.buildWavePath(radius, waveCount, amplitude, phase);
      this.waveGfx.stroke({ color, alpha: 0.05, width: w * 9 });
      this.buildWavePath(radius, waveCount, amplitude, phase);
      this.waveGfx.stroke({ color, alpha: 0.22, width: w * 3.5 });
      this.buildWavePath(radius, waveCount, amplitude, phase);
      this.waveGfx.stroke({ color, alpha: 0.92, width: w });
    } else if (breatheMode === "electric") {
      // Per-beat jitter spikes + random width flicker
      const beatFactor = 1 + (this.beatAmplitude - 1) * 0.7;
      const w = lineWidth * beatFactor;
      const eJitter = amplitude * 0.55 * (this.beatAmplitude - 1);
      // Dim outer corona
      this.buildWavePath(radius, waveCount, amplitude, phase, eJitter * 0.5);
      this.waveGfx.stroke({ color, alpha: 0.08, width: w * 11 });
      // Jittered mid line
      this.buildWavePath(radius, waveCount, amplitude, phase, eJitter);
      this.waveGfx.stroke({ color, alpha: 0.35, width: w * 2.5 });
      // Sharp core — extra jitter for electric look
      this.buildWavePath(radius, waveCount, amplitude, phase, eJitter * 1.5);
      this.waveGfx.stroke({ color, alpha: 0.95, width: w });
    } else {
      // fluid — no extra jitter, very soft glow, barely reacts to beat
      const w = lineWidth * (1 + (this.beatAmplitude - 1) * 0.12);
      this.buildWavePath(radius, waveCount, amplitude, phase, 0);
      this.waveGfx.stroke({ color, alpha: 0.03, width: w * 12 });
      this.buildWavePath(radius, waveCount, amplitude, phase, 0);
      this.waveGfx.stroke({ color, alpha: 0.14, width: w * 5 });
      this.buildWavePath(radius, waveCount, amplitude, phase, 0);
      this.waveGfx.stroke({ color, alpha: 0.82, width: w });
    }
  }

  private buildWavePath(
    radius: number,
    waveCount: number,
    amplitude: number,
    phase: number,
    extraJitter = 0,
  ): void {
    for (let i = 0; i <= WAVE_STEPS; i++) {
      const angle = (i / WAVE_STEPS) * Math.PI * 2;
      const jitter =
        this.jitterAmp > 0 ? (Math.random() - 0.5) * this.jitterAmp * 7 : 0;
      const eJitter = extraJitter > 0 ? (Math.random() - 0.5) * extraJitter : 0;
      const r =
        radius +
        Math.sin(angle * waveCount + phase) * amplitude +
        jitter +
        eJitter;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) this.waveGfx.moveTo(x, y);
      else this.waveGfx.lineTo(x, y);
    }
    this.waveGfx.closePath();
  }

  // ── Glitch chromatic-split effect ─────────────────────────────────────────

  private drawGlitchEffect(breathe: number): void {
    const r = this.baseRadius * breathe;
    const sx = this.glitchShiftX;
    for (const band of this.glitchBands) {
      const y = band.y * breathe;
      this.glitchGfx
        .rect(
          band.shiftX - r - 10,
          y - band.height * 0.5,
          (r + 10) * 2,
          band.height,
        )
        .fill({ color: INK_BLACK, alpha: band.alpha * 0.6 });
      this.glitchGfx
        .rect(band.shiftX - r - 10, y - 1, (r + 10) * 2, 1)
        .fill({ color: CATT_SKY, alpha: band.alpha * 0.8 });
    }
    const phase =
      this.time * WAVE_CONFIGS[0].speed + WAVE_CONFIGS[0].phaseOffset;
    const amp = WAVE_CONFIGS[0].baseAmplitude * this.beatAmplitude;
    for (let i = 0; i <= WAVE_STEPS; i++) {
      const angle = (i / WAVE_STEPS) * Math.PI * 2;
      const rv = r + Math.sin(angle * WAVE_CONFIGS[0].waveCount + phase) * amp;
      const x = Math.cos(angle) * rv + sx;
      const y = Math.sin(angle) * rv;
      if (i === 0) this.glitchGfx.moveTo(x, y);
      else this.glitchGfx.lineTo(x, y);
    }
    this.glitchGfx.closePath();
    this.glitchGfx.stroke({
      color: 0xff2244,
      alpha: 0.55,
      width: 1.5,
      cap: "round",
    });
    for (let i = 0; i <= WAVE_STEPS; i++) {
      const angle = (i / WAVE_STEPS) * Math.PI * 2;
      const rv = r + Math.sin(angle * WAVE_CONFIGS[0].waveCount + phase) * amp;
      const x = Math.cos(angle) * rv - sx;
      const y = Math.sin(angle) * rv;
      if (i === 0) this.glitchGfx.moveTo(x, y);
      else this.glitchGfx.lineTo(x, y);
    }
    this.glitchGfx.closePath();
    this.glitchGfx.stroke({
      color: 0x00ffee,
      alpha: 0.55,
      width: 1.5,
      cap: "round",
    });
    const blockCount = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < blockCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = r + (Math.random() - 0.5) * 50;
      const bx = Math.cos(ang) * dist + (Math.random() - 0.5) * sx * 2;
      const by = Math.sin(ang) * dist;
      const bw = 4 + Math.random() * 20;
      const bh = 2 + Math.random() * 6;
      const col =
        Math.random() < 0.5
          ? CATT_SKY
          : Math.random() < 0.5
            ? CATT_MAUVE
            : 0xffffff;
      this.glitchGfx
        .rect(bx, by, bw, bh)
        .fill({ color: col, alpha: 0.6 + Math.random() * 0.4 });
    }
  }

  // ── Catppuccin orbit dots ─────────────────────────────────────────────────

  private drawOrbitDots(dt: number, breathe: number): void {
    this.orbitDotGfx.clear();

    for (const dot of this.orbitDots) {
      // Advance angle — beat + audio makes dots surge
      const beatBoost = dot.speed > 0 ? this.beatAmplitude * 0.18 : 1.0;
      dot.angle +=
        dot.speed * dt * (1 + beatBoost * 0.15) * (1 + this.audioVol * 3.5);

      const r = (this.baseRadius + dot.radiusOffset) * breathe;
      const x = Math.cos(dot.angle) * r;
      const y = Math.sin(dot.angle) * r;

      // Alpha pulses gently; beat + audio give brightness kick
      const baseAlpha =
        0.55 + 0.45 * Math.sin(this.time * dot.alphaSpeed + dot.alphaPhase);
      const kickAlpha = Math.min(
        1.0,
        baseAlpha + (this.beatAmplitude - 1.0) * 0.35 + this.audioVol * 0.4,
      );
      const size =
        dot.size * (1 + (this.beatAmplitude - 1) * 0.25 + this.audioVol * 1.0);

      // Soft glow halo
      this.orbitDotGfx
        .circle(x, y, size * 3.5)
        .fill({ color: dot.color, alpha: dot.glowAlpha * kickAlpha });

      // Mid bloom
      this.orbitDotGfx
        .circle(x, y, size * 1.8)
        .fill({ color: dot.color, alpha: kickAlpha * 0.45 });

      // Bright core
      this.orbitDotGfx
        .circle(x, y, size)
        .fill({ color: dot.color, alpha: kickAlpha });
    }
  }

  // ── Floating symbols ─────────────────────────────────────────────────────

  private initFloatingSymbols(): void {
    // Nerd Font tech/dev/IT codepoints only (SymbolsNF font required)
    const ALL_SYMS = [
      "\uF121", // </>  code
      "\uF126", // git-branch
      "\uF09B", // github octocat
      "\uF120", // terminal / bash prompt
      "\uF013", // cog / settings
      "\uF135", // rocket deploy
      "\uF0E7", // bolt / lightning
      "\uF259", // atom (React)
      "\uF292", // shield / security
      "\uF188", // bug
      "\uF1C0", // database
      "\uF233", // server
      "\uF109", // laptop
      "\uF11C", // keyboard
      "\uF17C", // linux tux
      "\uF179", // apple
      "\uF0AD", // wrench / tool
      "\uF0C3", // flask / science
      "\uF1EB", // wifi
      "\uF108", // desktop monitor
      "\uF200", // pie-chart
      "\uF201", // line-chart / analytics
      "\uF11B", // gamepad / controller
      "\uF1B2", // cube / package
      "\uF1C9", // code file
      "\uF023", // lock
      "\uF09C", // lock-open
      "\uF0DB", // columns / layout
      "\uF304", // pen / edit
      "\uE0B0", // powerline solid arrow
      "\uE0B2", // powerline solid arrow left
      "\uF296", // percent
      "\uF0C9", // hamburger menu / bars
      "\uF1D0", // circle-o-notch / spinner
      "\uF245", // mouse pointer
      "\uF0E4", // dashboard / speedometer
      "\uF07C", // folder open
      "\uF07B", // folder
      "\uF015", // home
    ];

    // All symbols use SymbolsNF; same style factory for every glyph
    const makeStyle = (color: number): TextStyle =>
      new TextStyle({
        fontFamily: "'SymbolsNF', monospace",
        fontSize: 20 + Math.floor(Math.random() * 14), // 20–34 px
        fill: color,
        padding: 20, // prevents drop-shadow glow from being cropped on all sides
        dropShadow: { color, blur: 14, distance: 0, alpha: 0.9, angle: 0 },
      });

    const count = ALL_SYMS.length;
    for (let i = 0; i < count; i++) {
      const sym = ALL_SYMS[i];
      const color = CATT_PALETTE[i % CATT_PALETTE.length];
      const dir = i % 2 === 0 ? 1 : -1;

      const node = new Text({ text: sym, style: makeStyle(color) });
      node.anchor.set(0.5);
      node.alpha = 0;
      this.symbolCont.addChild(node);

      this.floatingSymbols.push({
        node,
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.3,
        orbitSpeed: dir * (0.08 + Math.random() * 0.22),
        orbitRadius: this.baseRadius + 22 + Math.random() * 65, // strictly outside ring
        vibeAmp: 0.12 + Math.random() * 0.22, // ±12–34 % scale oscillation
        vibeSpeed: 8 + Math.random() * 18, // 8–26 rad/s → 1.3–4 Hz
        vibePhase: Math.random() * Math.PI * 2,
        alphaBase: 0.55 + Math.random() * 0.35,
        alphaAmp: 0.3 + Math.random() * 0.25,
        alphaSpeed: 0.8 + Math.random() * 1.8,
        alphaPhase: Math.random() * Math.PI * 2,
        jitterAmp: 2 + Math.random() * 5,
        jitterPhase: Math.random() * Math.PI * 2,
        baseScale: 1.0,
      });
    }
  }

  private updateFloatingSymbols(breathe: number): void {
    // Gate: symbols only appear when mic is active
    const audioGate = Math.min(1.0, this.audioVol * 3.0);
    const beatBoost = 1 + (this.beatAmplitude - 1) * 0.4 + this.audioVol * 1.4;

    for (const s of this.floatingSymbols) {
      const jitterMul = 1 + this.audioVol * 3.0;
      const r = s.orbitRadius * breathe;
      const jx = Math.sin(s.jitterPhase * 1.3) * s.jitterAmp * jitterMul;
      const jy = Math.cos(s.jitterPhase * 0.9) * s.jitterAmp * jitterMul;

      s.node.x = Math.cos(s.angle) * r + jx;
      s.node.y = Math.sin(s.angle) * r + jy;
      s.node.rotation = s.angle + Math.PI / 2;

      const vibeScale = 1 + s.vibeAmp * Math.sin(s.vibePhase) * beatBoost;
      s.node.scale.set(s.baseScale * vibeScale);

      const baseA = s.alphaBase + s.alphaAmp * Math.sin(s.alphaPhase);
      const beatA = Math.min(
        1.0,
        baseA + (this.beatAmplitude - 1) * 0.25 + this.audioVol * 0.35,
      );
      // Fully invisible when silent, smoothly revealed as audio rises
      s.node.alpha = Math.max(0, beatA) * audioGate;
    }
  }

  // ── Fluid stains ──────────────────────────────────────────────────────────

  /**
   * Catppuccin fluid blobs that orbit the camera ring.
   *
   * Each blob shape is defined by Fourier modes 1–3 applied to a base circle,
   * so the boundary is always smooth (large organic bumps, no spikes).
   * Three concentric fill passes (wide dim → mid → bright core) give watercolour
   * depth without any blur filter.
   * A secondary smaller offset blob adds paint-splash asymmetry.
   * Everything is super-transparent (5–12 %) so it never obscures the camera.
   */
  private drawFluidStains(breathe: number): void {
    this.stainGfx.clear();

    const VERTS = 64; // enough for silky smooth outline

    for (const stain of this.fluidStains) {
      // ── Orbital position ─────────────────────────────────────────────────
      const float =
        Math.sin(this.time * stain.floatSpeed + stain.floatPhase) *
        stain.floatAmp;
      const r = (stain.orbitRadius + float) * breathe;
      const cx = Math.cos(stain.angle) * r;
      const cy = Math.sin(stain.angle) * r;

      // ── Alpha pulse — gentle, slightly faster than orbit ─────────────────
      const alphaPulse =
        0.5 + 0.5 * Math.sin(this.time * 0.55 + stain.floatPhase);
      const beatSwell = 1 + (this.beatAmplitude - 1) * 0.08;
      const alpha = stain.baseAlpha * alphaPulse;

      // ── Build smooth Fourier polygon at (bx, by) with radius scale ────────
      const buildPts = (bx: number, by: number, rScale: number): number[] => {
        const pts: number[] = [];
        for (let i = 0; i <= VERTS; i++) {
          const theta = (i / VERTS) * Math.PI * 2;
          let rad = stain.baseRadius * rScale * beatSwell;
          for (let mi = 0; mi < stain.modes.length; mi++) {
            rad +=
              stain.modes[mi].amp *
              rScale *
              Math.sin((mi + 1) * theta + stain.modes[mi].phase);
          }
          pts.push(
            bx + Math.cos(theta + stain.rotation) * rad,
            by + Math.sin(theta + stain.rotation) * rad,
          );
        }
        return pts;
      };

      // ── Primary blob — 3 concentric passes: wide dim → mid → core ────────
      this.stainGfx
        .poly(buildPts(cx, cy, 1.55))
        .fill({ color: stain.color, alpha: alpha * 0.45 });
      this.stainGfx
        .poly(buildPts(cx, cy, 1.0))
        .fill({ color: stain.color, alpha: alpha * 0.7 });
      this.stainGfx
        .poly(buildPts(cx, cy, 0.58))
        .fill({ color: stain.color, alpha: alpha * 1.0 });

      // ── Secondary offset blob — paint-splash asymmetry ────────────────────
      const ox = cx + Math.cos(stain.rotation + 0.9) * stain.baseRadius * 0.45;
      const oy = cy + Math.sin(stain.rotation + 0.9) * stain.baseRadius * 0.45;
      this.stainGfx
        .poly(buildPts(ox, oy, 0.72))
        .fill({ color: stain.color, alpha: alpha * 0.45 });
      this.stainGfx
        .poly(buildPts(ox, oy, 0.42))
        .fill({ color: stain.color, alpha: alpha * 0.65 });
    }
  }

  // ── Logo badge animation ───────────────────────────────────────────────────

  private animateLogo(): void {
    const sprite = this.logoSprite!;
    const gfx = this.logoGfx!;
    const x = AudioActivatedCameraBorder.LOGO_X;
    const baseY = AudioActivatedCameraBorder.LOGO_Y;
    const float = Math.sin(this.time * 0.5) * (7 + this.audioVol * 18);
    const y = baseY + float;

    // Slow breathe + persistent high-freq tremor + audio size boost
    const breathe =
      1 + 0.055 * Math.sin(this.time * 0.6) + this.audioVol * 0.55;
    const tremorAmp = 1 + this.audioVol * 3.0;
    const tremor =
      1 +
      0.013 * tremorAmp * Math.sin(this.time * 19.4) +
      0.009 * tremorAmp * Math.sin(this.time * 27.1) +
      0.006 * tremorAmp * Math.sin(this.time * 41.7);
    sprite.scale.set(this.logoBaseScale * breathe * tremor);

    // Micro position quake — amplified by audio
    const quakeMul = 1 + this.audioVol * 3.5;
    const qx =
      Math.sin(this.time * 17.3) * 1.8 * quakeMul +
      Math.sin(this.time * 31.1) * 1.0 * quakeMul;
    const qy =
      Math.cos(this.time * 23.7) * 1.4 * quakeMul +
      Math.cos(this.time * 37.9) * 0.8 * quakeMul;
    sprite.x = AudioActivatedCameraBorder.LOGO_X + qx;
    sprite.y = y + qy;
    sprite.alpha = Math.min(
      1.0,
      0.9 + Math.sin(this.time * 0.75) * 0.1 + this.audioVol * 0.1,
    );

    const aura = 32 + 4 * Math.sin(this.time * 0.5) + this.audioVol * 28;
    const auraAlphaMul = 1 + this.audioVol * 3.5;

    gfx.clear();
    gfx
      .circle(x, y, aura * 2.2)
      .fill({ color: RAZER_GREEN, alpha: 0.05 * auraAlphaMul });
    gfx
      .circle(x, y, aura * 1.4)
      .fill({ color: RAZER_GREEN, alpha: 0.1 * auraAlphaMul });
    gfx
      .circle(x, y, aura * 0.9)
      .fill({ color: LOL_VIOLET, alpha: 0.07 * auraAlphaMul });

    const ringSpeed = 1 + this.audioVol * 4.0;
    const r0 = aura + 4,
      a0 = this.time * 0.75 * ringSpeed;
    gfx
      .moveTo(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0)
      .arc(x, y, r0, a0, a0 + Math.PI * 1.4)
      .stroke({
        color: RAZER_GREEN,
        alpha: Math.min(1.0, 0.9 + this.audioVol * 0.1),
        width: 1.5 + this.audioVol * 2.5,
        cap: "round",
      });

    const r1 = r0 - 5,
      a1 = -this.time * 0.48 * ringSpeed + Math.PI * 0.5;
    gfx
      .moveTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1)
      .arc(x, y, r1, a1, a1 + Math.PI * 0.8)
      .stroke({
        color: LOL_VIOLET,
        alpha: Math.min(1.0, 0.65 + this.audioVol * 0.35),
        width: 1.0 + this.audioVol * 2.0,
        cap: "round",
      });
  }
}
