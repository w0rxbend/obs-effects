import { Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  CATT_LAVENDER,
  CATT_MAUVE,
  CATT_PEACH,
  CATT_PINK,
  CATT_SAPPHIRE,
  CATT_SKY,
  CATT_TEAL_CAT,
  CATT_YELLOW,
  DARK_CRUST,
  INK_BLACK,
  LOL_BLUE,
  LOL_VIOLET,
  RAZER_GREEN,
  TOXIC_GREEN,
  TOXIC_VIOLET,
  WAVE_CONFIGS,
  WAVE_STEPS,
  jaggedPath,
  randomCatt,
  randomPalette,
  type CattColor,
  type PaletteColor,
} from "./razerPalette";

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

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: PaletteColor;
}

interface ElectricSpike {
  points: Array<[number, number]>;
  alpha: number;
  decay: number;
  color: PaletteColor;
  width: number;
}

interface SplashDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: PaletteColor;
}

interface AsteroidBody {
  cont: Container;
  orbitAngle: number;
  orbitSpeed: number;
  semiMajor: number; // ellipse semi-major axis (px)
  semiMinor: number; // ellipse semi-minor axis (px)
  orbitTilt: number; // current rotation of the ellipse (rad)
  precessionSpeed: number; // orbit rotation speed (rad/s)
  selfRotSpeed: number;
  alpha: number;
  dying: boolean;
  dyingTimer: number;
}

interface DebrisParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: number;
  life: number;
  maxLife: number;
}

interface NaturalSatellite {
  cont: Container;
  orbitAngle: number;
  orbitSpeed: number; // rad/s, signed
  orbitRadius: number;
  selfRotSpeed: number; // slow self-rotation of surface features
  kind: number; // 0=moon 1=europa 2=io
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

interface GlitchBand {
  y: number;
  height: number;
  shiftX: number;
  alpha: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Asteroid paint ────────────────────────────────────────────────────────────
// Called once per asteroid during init — Math.random() gives each a unique shape.

function paintAsteroid(g: Graphics, r: number): void {
  const sides = 7 + Math.floor(Math.random() * 5); // 7-11 vertices
  const baseColor = [
    0x5a5a62, 0x636258, 0x524a48, 0x5e5252, 0x585662, 0x4e5258,
  ][Math.floor(Math.random() * 6)];

  // Irregular outline — angular jitter per vertex
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a =
      (i / sides) * Math.PI * 2 +
      (Math.random() - 0.5) * (Math.PI / sides) * 0.65;
    const rr = r * (0.6 + Math.random() * 0.55);
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.poly(pts, true).fill({ color: baseColor, alpha: 1.0 });

  // Shadow side — dark overlay bottom-right
  g.circle(r * 0.2, r * 0.2, r * 0.74).fill({ color: 0x14141c, alpha: 0.5 });

  // Lit side — soft highlight upper-left
  g.circle(-r * 0.18, -r * 0.18, r * 0.6).fill({ color: 0x9898a0, alpha: 0.3 });
  g.circle(-r * 0.26, -r * 0.26, r * 0.3).fill({ color: 0xbabac0, alpha: 0.2 });

  // Impact craters (only on bodies large enough to show them)
  if (r >= 7) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const ca = Math.random() * Math.PI * 2;
      const cd = r * (0.1 + Math.random() * 0.3);
      const cx = Math.cos(ca) * cd,
        cy = Math.sin(ca) * cd;
      const cr = r * (0.11 + Math.random() * 0.15);
      g.circle(cx, cy, cr).fill({ color: 0x242430, alpha: 0.7 });
      g.circle(cx - cr * 0.18, cy - cr * 0.18, cr * 0.55).fill({
        color: 0x3c3c46,
        alpha: 0.35,
      });
      g.circle(cx, cy, cr).stroke({ color: 0x888890, alpha: 0.18, width: 0.5 });
    }
  }

  // Specular limb — faint bright outline on lit side
  g.poly(pts, true).stroke({ color: 0xc0c0c8, alpha: 0.2, width: 0.7 });
}

// ── Natural satellite paint functions ─────────────────────────────────────────
// Drawn in local space, centred at origin. Lit from upper-left (−1, −1 direction).
// r = body radius in pixels.

function paintNatSatellite(g: Graphics, kind: number, r: number): void {
  switch (kind) {
    case 0:
      paintMoonBody(g, r);
      break;
    case 1:
      paintEuropaBody(g, r);
      break;
    default:
      paintIoBody(g, r);
      break;
  }
}

/**
 * Moon — ancient, cratered, lit from upper-left.
 * Grey regolith, dark mare basins, nested impact craters with bright rims.
 */
function paintMoonBody(g: Graphics, r: number): void {
  // ── Deep space glow halo ────────────────────────────────────────────────────
  g.circle(0, 0, r * 1.55).fill({ color: 0xd8d4cc, alpha: 0.04 });
  g.circle(0, 0, r * 1.22).fill({ color: 0xd8d4cc, alpha: 0.07 });

  // ── Base sphere — shadowed mid-grey ────────────────────────────────────────
  g.circle(0, 0, r).fill({ color: 0x6a6a72, alpha: 1.0 });

  // ── Lit hemisphere — layered offset circles simulate sphere gradient ────────
  g.circle(-r * 0.18, -r * 0.18, r * 0.97).fill({
    color: 0xbcb8b0,
    alpha: 0.52,
  });
  g.circle(-r * 0.24, -r * 0.24, r * 0.72).fill({
    color: 0xccc8c0,
    alpha: 0.38,
  });
  g.circle(-r * 0.3, -r * 0.3, r * 0.44).fill({ color: 0xd8d4cc, alpha: 0.26 });
  // Specular highlight
  g.circle(-r * 0.38, -r * 0.38, r * 0.13).fill({
    color: 0xf0ece4,
    alpha: 0.22,
  });

  // ── Dark mare basins (ancient volcanic plains) ─────────────────────────────
  g.circle(-r * 0.08, -r * 0.22, r * 0.3).fill({ color: 0x3e3e48, alpha: 0.6 }); // Mare Imbrium
  g.circle(r * 0.26, -r * 0.06, r * 0.19).fill({
    color: 0x424250,
    alpha: 0.52,
  }); // Mare Serenitatis
  g.circle(-r * 0.3, r * 0.28, r * 0.14).fill({ color: 0x444450, alpha: 0.44 }); // Mare Humorum
  g.circle(r * 0.1, r * 0.32, r * 0.11).fill({ color: 0x464656, alpha: 0.38 }); // Mare Nubium

  // ── Impact craters — shadow floor + bright ejecta rim ─────────────────────
  const craters = [
    { cx: 0.14, cy: 0.3, cr: 0.2 }, // large — centre-south
    { cx: -0.32, cy: 0.18, cr: 0.13 }, // mid — west
    { cx: 0.36, cy: -0.3, cr: 0.11 }, // mid — north-east
    { cx: -0.12, cy: -0.36, cr: 0.09 }, // small — north
    { cx: 0.44, cy: 0.22, cr: 0.08 }, // small — east edge
    { cx: -0.38, cy: -0.14, cr: 0.07 }, // small — west
    { cx: 0.22, cy: 0.46, cr: 0.07 }, // small — south
    { cx: -0.2, cy: 0.44, cr: 0.06 }, // tiny — south-west
    { cx: 0.02, cy: -0.5, cr: 0.05 }, // tiny — far north
    { cx: 0.5, cy: -0.06, cr: 0.05 }, // tiny — far east
  ];
  for (const c of craters) {
    const cx = c.cx * r,
      cy = c.cy * r,
      cr = c.cr * r;
    // Shadow floor
    g.circle(cx, cy, cr).fill({ color: 0x2e2e36, alpha: 0.65 });
    // Interior — slight lighter centre (central peak)
    g.circle(cx - cr * 0.15, cy - cr * 0.15, cr * 0.55).fill({
      color: 0x585860,
      alpha: 0.3,
    });
    // Bright ejecta rim
    g.circle(cx, cy, cr).stroke({
      color: 0xc8c4bc,
      alpha: 0.5,
      width: r * 0.022,
    });
    // Shadow crescent on rim (southeast)
    g.circle(cx + cr * 0.28, cy + cr * 0.28, cr * 0.22).fill({
      color: 0x222228,
      alpha: 0.45,
    });
  }

  // ── Terminator edge — soft shadow on right side ────────────────────────────
  g.circle(r * 0.12, 0, r * 0.92).fill({ color: 0x1a1a22, alpha: 0.28 });

  // ── Thin atmosphere limb glow ──────────────────────────────────────────────
  g.circle(0, 0, r).stroke({ color: 0xe0dcd4, alpha: 0.18, width: r * 0.04 });
}

/**
 * Europa — Jupiter's icy moon. Alabaster surface crisscrossed by reddish-brown
 * lineae (tidal crack networks) overlying a subsurface ocean. Alien, unsettling.
 */
function paintEuropaBody(g: Graphics, r: number): void {
  // ── Deep glow — cold blue ──────────────────────────────────────────────────
  g.circle(0, 0, r * 1.5).fill({ color: 0x88ccff, alpha: 0.05 });
  g.circle(0, 0, r * 1.18).fill({ color: 0xaaddff, alpha: 0.08 });

  // ── Base sphere — icy blue-white ───────────────────────────────────────────
  g.circle(0, 0, r).fill({ color: 0x9fc8e8, alpha: 1.0 });

  // ── Lit hemisphere gradient ────────────────────────────────────────────────
  g.circle(-r * 0.16, -r * 0.16, r * 0.96).fill({
    color: 0xd8eef8,
    alpha: 0.55,
  });
  g.circle(-r * 0.22, -r * 0.22, r * 0.7).fill({
    color: 0xe8f6ff,
    alpha: 0.38,
  });
  g.circle(-r * 0.28, -r * 0.28, r * 0.42).fill({
    color: 0xf4faff,
    alpha: 0.25,
  });
  g.circle(-r * 0.36, -r * 0.36, r * 0.12).fill({
    color: 0xffffff,
    alpha: 0.22,
  });

  // ── Subsurface warm glow (hint of the ocean beneath the ice) ───────────────
  g.circle(r * 0.08, r * 0.08, r * 0.65).fill({ color: 0x2244aa, alpha: 0.1 });

  // ── Chaos terrain patches — older disrupted ice regions ───────────────────
  const patches = [
    { cx: 0.18, cy: 0.24, rx: 0.22, ry: 0.14 },
    { cx: -0.25, cy: -0.28, rx: 0.18, ry: 0.11 },
    { cx: 0.3, cy: -0.18, rx: 0.15, ry: 0.1 },
  ];
  for (const p of patches) {
    // Use a circle as approximation of the elliptical patch
    g.circle(p.cx * r, p.cy * r, (p.rx + p.ry) * 0.5 * r).fill({
      color: 0x7898b8,
      alpha: 0.22,
    });
  }

  // ── Lineae — the iconic reddish-brown crack network ────────────────────────
  // Major tidal cracks crossing the globe
  const lineae: Array<[number, number, number, number]> = [
    [-0.7, -0.28, 0.65, 0.4], // Thera Macula diagonal
    [0.2, -0.72, -0.3, 0.68], // cross-equatorial ridge
    [-0.55, 0.55, 0.7, -0.42], // Minos Linea
    [0.6, 0.55, -0.58, -0.3], // Cadmus Linea
    [-0.1, -0.68, 0.15, 0.72], // Conamara region
    [0.68, -0.2, -0.62, 0.35], // Astypalaea Linea
  ];
  for (const [x1, y1, x2, y2] of lineae) {
    const lx1 = x1 * r,
      ly1 = y1 * r,
      lx2 = x2 * r,
      ly2 = y2 * r;
    // Outer warm glow — reddish-brown
    g.moveTo(lx1, ly1)
      .lineTo(lx2, ly2)
      .stroke({ color: 0x8b3a1a, alpha: 0.25, width: r * 0.065, cap: "round" });
    // Core crack line
    g.moveTo(lx1, ly1)
      .lineTo(lx2, ly2)
      .stroke({ color: 0xb85a2a, alpha: 0.55, width: r * 0.025, cap: "round" });
    // Bright frost along crack edge
    g.moveTo(lx1, ly1)
      .lineTo(lx2, ly2)
      .stroke({ color: 0xddeeff, alpha: 0.18, width: r * 0.008, cap: "round" });
  }
  // Finer secondary cracks
  const fineLineae: Array<[number, number, number, number]> = [
    [-0.4, 0.1, 0.45, -0.35],
    [0.1, 0.55, -0.5, -0.1],
    [0.55, 0.15, 0.1, 0.6],
    [-0.22, -0.5, 0.5, 0.22],
  ];
  for (const [x1, y1, x2, y2] of fineLineae) {
    g.moveTo(x1 * r, y1 * r)
      .lineTo(x2 * r, y2 * r)
      .stroke({ color: 0x7a3318, alpha: 0.32, width: r * 0.016, cap: "round" });
  }

  // ── Terminator shadow ──────────────────────────────────────────────────────
  g.circle(r * 0.12, 0, r * 0.92).fill({ color: 0x0a1828, alpha: 0.24 });

  // ── Icy limb glow ──────────────────────────────────────────────────────────
  g.circle(0, 0, r).stroke({ color: 0xcceeff, alpha: 0.22, width: r * 0.05 });
}

/**
 * Io — Jupiter's hellish volcanic moon. Sulfur plains of yellow-orange,
 * dark volcanic calderas, lava flows, and active plume halos. Genuinely terrifying.
 */
function paintIoBody(g: Graphics, r: number): void {
  // ── Volcanic heat glow ──────────────────────────────────────────────────────
  g.circle(0, 0, r * 1.55).fill({ color: 0xff6600, alpha: 0.04 });
  g.circle(0, 0, r * 1.22).fill({ color: 0xff8800, alpha: 0.07 });

  // ── Base sphere — sulfur yellow ────────────────────────────────────────────
  g.circle(0, 0, r).fill({ color: 0xd4aa18, alpha: 1.0 });

  // ── Lit hemisphere ─────────────────────────────────────────────────────────
  g.circle(-r * 0.17, -r * 0.17, r * 0.96).fill({
    color: 0xeec830,
    alpha: 0.52,
  });
  g.circle(-r * 0.24, -r * 0.24, r * 0.7).fill({
    color: 0xf8dc50,
    alpha: 0.35,
  });
  g.circle(-r * 0.3, -r * 0.3, r * 0.4).fill({ color: 0xfcec78, alpha: 0.22 });
  g.circle(-r * 0.37, -r * 0.37, r * 0.12).fill({
    color: 0xfffc9a,
    alpha: 0.2,
  });

  // ── Sulfur dioxide frost patches — bright white-yellow regions ─────────────
  g.circle(-r * 0.2, -r * 0.32, r * 0.24).fill({
    color: 0xf8f4dc,
    alpha: 0.45,
  });
  g.circle(r * 0.28, r * 0.26, r * 0.2).fill({ color: 0xf0ecd0, alpha: 0.38 });
  g.circle(-r * 0.1, r * 0.4, r * 0.15).fill({ color: 0xece8c8, alpha: 0.32 });

  // ── Red & orange sulphur flows ─────────────────────────────────────────────
  g.circle(r * 0.22, r * 0.08, r * 0.28).fill({ color: 0xc84400, alpha: 0.4 });
  g.circle(-r * 0.32, r * 0.14, r * 0.2).fill({ color: 0xd05800, alpha: 0.35 });
  g.circle(r * 0.1, -r * 0.3, r * 0.16).fill({ color: 0xe06000, alpha: 0.3 });

  // ── Volcanic calderas — dark pits ─────────────────────────────────────────
  const calderas = [
    { cx: 0.16, cy: 0.1, cr: 0.14 }, // Pele — giant caldera
    { cx: -0.24, cy: 0.28, cr: 0.1 }, // Loki Patera
    { cx: 0.38, cy: -0.22, cr: 0.08 }, // Tvashtar
    { cx: -0.1, cy: -0.36, cr: 0.07 }, // Prometheus
    { cx: 0.44, cy: 0.3, cr: 0.06 }, // Ra Patera
    { cx: -0.36, cy: -0.22, cr: 0.05 },
  ];
  for (const c of calderas) {
    const cx = c.cx * r,
      cy = c.cy * r,
      cr = c.cr * r;
    // Outer lava field — dark reddish ring
    g.circle(cx, cy, cr * 1.5).fill({ color: 0x5a1a00, alpha: 0.35 });
    // Caldera floor — black/dark brown
    g.circle(cx, cy, cr).fill({ color: 0x1a0800, alpha: 0.88 });
    // Active lava lake glow — orange hotspot
    g.circle(cx, cy, cr * 0.55).fill({ color: 0xff4400, alpha: 0.55 });
    g.circle(cx, cy, cr * 0.28).fill({ color: 0xff8c00, alpha: 0.7 });
    g.circle(cx, cy, cr * 0.1).fill({ color: 0xffee00, alpha: 0.6 }); // white-hot centre
    // Ejecta ring — bright sulphur around rim
    g.circle(cx, cy, cr).stroke({
      color: 0xf0c020,
      alpha: 0.4,
      width: r * 0.02,
    });
  }

  // ── Pele plume halo — enormous SO₂ deposit ring around the biggest volcano ─
  g.circle(0.16 * r, 0.1 * r, r * 0.62).stroke({
    color: 0xe84400,
    alpha: 0.16,
    width: r * 0.05,
  });
  g.circle(0.16 * r, 0.1 * r, r * 0.55).stroke({
    color: 0xff8800,
    alpha: 0.1,
    width: r * 0.03,
  });

  // ── Terminator shadow ──────────────────────────────────────────────────────
  g.circle(r * 0.12, 0, r * 0.92).fill({ color: 0x1a0800, alpha: 0.3 });

  // ── Sulphur limb glow — eerie orange atmosphere ────────────────────────────
  g.circle(0, 0, r).stroke({ color: 0xff6600, alpha: 0.2, width: r * 0.05 });
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
export class CameraBorder3 extends Container {
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
  private readonly orbitDotGfx: Graphics; // catppuccin dots orbiting the ring
  private readonly stainGfx: Graphics; // catppuccin fluid stains orbiting the ring
  private readonly beltCont: Container; // asteroid bodies
  private readonly beltEffectGfx: Graphics; // debris particles from destruction
  private readonly natSatCont: Container; // natural satellite sprites

  // ── Logo ───────────────────────────────────────────────────────────────────
  private logoSprite: Sprite | null = null;
  private logoGfx: Graphics | null = null;
  private logoBaseScale = 1.0;

  private static readonly LOGO_SIZE = 96;
  private static readonly LOGO_ORBIT_RADIUS = 233; // px from centre
  private static readonly LOGO_ORBIT_SPEED = 0.12; // rad/s

  private logoOrbitAngle = -Math.PI * 0.75; // start at top-left (~225°)

  // ── State ──────────────────────────────────────────────────────────────────
  private readonly particles: Particle[] = [];
  private surfaceLines: SurfaceLine[] = [];
  private brushStrokes: BrushStroke[] = [];
  private sparkles: Sparkle[] = [];
  private sparks: Spark[] = [];
  private lightningBolts: LightningBolt[] = [];
  private readonly orbitDots: OrbitDot[] = [];
  private readonly fluidStains: FluidStain[] = [];
  private fireworkParticles: FireworkParticle[] = [];
  private electricSpikes: ElectricSpike[] = [];
  private splashDroplets: SplashDroplet[] = [];
  private asteroidBelt: AsteroidBody[] = [];
  private debrisParticles: DebrisParticle[] = [];
  private beltSpawnTimer = 0;
  private naturalSatellites: NaturalSatellite[] = [];

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
  private fireworkAccum = 0;
  private spikeAccum = 0;
  private splashAccum = 0;
  private beatAmplitude = 1.0;
  private nextBeatTime = 0.5;

  // ── Living-world state ─────────────────────────────────────────────────────
  // Slow macro envelope (0.4..1.0) — creates natural calm/active cycles
  private activityLevel = 0.7;
  private activityPhase = Math.random() * Math.PI * 2;
  // Per-ring independent drift phases (initialized in constructor)
  private readonly ringSpeedDrift: number[];
  private readonly ringAmpDrift: number[];

  private static readonly BRUSH_INTERVAL = 0.07;
  private static readonly SPARKLE_INTERVAL = 0.09;
  private static readonly SPARK_INTERVAL = 0.1;
  private static readonly LIGHTNING_INTERVAL = 4.0;
  private static readonly FIREWORK_INTERVAL = 3.5;
  private static readonly SPIKE_INTERVAL = 0.65;
  private static readonly SPLASH_INTERVAL = 1.4;
  private static readonly MAX_STROKES = 150;
  private static readonly MAX_SPARKS = 180;
  private static readonly MAX_SPARKLES = 160;
  private static readonly MAX_BOLTS = 10;
  private static readonly MAX_FIREWORK_PARTICLES = 300;
  private static readonly MAX_SPIKES = 90;
  private static readonly MAX_SPLASH_DROPLETS = 180;
  private static readonly MAX_ASTEROIDS = 200;
  private static readonly ASTEROID_SPAWN_INTERVAL = 1.2; // seconds between spawn bursts
  private static readonly ASTEROID_DEATH_CHANCE = 0.0012; // per asteroid per second
  private static readonly ASTEROID_DEATH_DURATION = 0.55; // seconds for death animation

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
    this.beltCont = new Container();
    this.beltEffectGfx = new Graphics();
    this.natSatCont = new Container();

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
    this.addChild(this.beltCont); // asteroid bodies
    this.addChild(this.beltEffectGfx); // destruction debris
    this.addChild(this.natSatCont); // natural satellites — above ring, below logo
    // logo layer is added on attachLogo call (topmost)

    // Per-ring independent drift — random starting phases so no two rings are in sync
    this.ringSpeedDrift = WAVE_CONFIGS.map(() => Math.random() * Math.PI * 2);
    this.ringAmpDrift = WAVE_CONFIGS.map(() => Math.random() * Math.PI * 2);

    this.drawBaseRing();
    this.initParticles();
    this.initOrbitDots();
    this.initFluidStains();
    this.initSurfaceLines();
    this.initAsteroidBelt();
    this.initNaturalSatellites();
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
    sprite.width = CameraBorder3.LOGO_SIZE;
    sprite.scale.y = sprite.scale.x;
    sprite.x = Math.cos(this.logoOrbitAngle) * CameraBorder3.LOGO_ORBIT_RADIUS;
    sprite.y = Math.sin(this.logoOrbitAngle) * CameraBorder3.LOGO_ORBIT_RADIUS;
    this.addChild(sprite);

    this.logoBaseScale = sprite.scale.x;
    this.logoSprite = sprite;
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

  // ── Public update ──────────────────────────────────────────────────────────

  public update(): void {
    const dt = 1 / 60;
    this.time += dt;

    this.tickBeat(dt);

    // Dynamic intervals — scale with activity level
    const dynBrushInterval =
      CameraBorder3.BRUSH_INTERVAL / (0.4 + this.activityLevel * 0.8);
    const dynSparkleInterval =
      CameraBorder3.SPARKLE_INTERVAL / (0.3 + this.activityLevel * 0.9);
    const dynSparkInterval =
      CameraBorder3.SPARK_INTERVAL / (0.4 + this.activityLevel * 0.7);
    const dynLightningInterval =
      CameraBorder3.LIGHTNING_INTERVAL * (1.5 - this.activityLevel * 0.7);

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

    // Fireworks
    this.fireworkAccum += dt;
    if (
      this.fireworkAccum >=
      CameraBorder3.FIREWORK_INTERVAL / (0.5 + this.activityLevel * 0.8)
    ) {
      this.fireworkAccum = 0;
      this.spawnFirework();
    }
    for (const p of this.fireworkParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
    }
    this.fireworkParticles = this.fireworkParticles.filter((p) => p.life > 0);

    // Electric spikes
    this.spikeAccum += dt;
    if (
      this.spikeAccum >=
      CameraBorder3.SPIKE_INTERVAL / (0.5 + this.activityLevel * 0.8)
    ) {
      this.spikeAccum = 0;
      this.spawnElectricSpikes();
    }
    this.electricSpikes = this.electricSpikes.filter((s) => {
      s.alpha -= s.decay * dt;
      return s.alpha > 0;
    });

    // Paint splashes
    this.splashAccum += dt;
    if (
      this.splashAccum >=
      CameraBorder3.SPLASH_INTERVAL / (0.4 + this.activityLevel * 0.8)
    ) {
      this.splashAccum = 0;
      this.spawnPaintSplash();
    }
    for (const d of this.splashDroplets) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= d.decay * dt;
    }
    this.splashDroplets = this.splashDroplets.filter((d) => d.life > 0);

    // Asteroid belt — spawn, orbit, random destruction
    const breatheNow = 1 + 0.03 * Math.sin(this.time * 0.7);

    this.beltSpawnTimer += dt;
    if (this.beltSpawnTimer >= CameraBorder3.ASTEROID_SPAWN_INTERVAL) {
      this.beltSpawnTimer = 0;
      const burst = 2 + Math.floor(Math.random() * 4);
      for (
        let s = 0;
        s < burst && this.asteroidBelt.length < CameraBorder3.MAX_ASTEROIDS;
        s++
      )
        this.spawnAsteroid();
    }

    for (let i = this.asteroidBelt.length - 1; i >= 0; i--) {
      const ast = this.asteroidBelt[i];
      ast.orbitAngle += ast.orbitSpeed * dt;
      ast.orbitTilt += ast.precessionSpeed * dt;
      // Elliptic position in orbit frame, then rotated by tilt
      const lx = ast.semiMajor * Math.cos(ast.orbitAngle) * breatheNow;
      const ly = ast.semiMinor * Math.sin(ast.orbitAngle) * breatheNow;
      const ct = Math.cos(ast.orbitTilt),
        st = Math.sin(ast.orbitTilt);
      ast.cont.x = lx * ct - ly * st;
      ast.cont.y = lx * st + ly * ct;
      ast.cont.rotation += ast.selfRotSpeed * dt;

      if (ast.dying) {
        ast.dyingTimer -= dt;
        ast.alpha = Math.max(
          0,
          ast.dyingTimer / CameraBorder3.ASTEROID_DEATH_DURATION,
        );
        ast.cont.alpha = ast.alpha;
        ast.cont.scale.set(1 + (1 - ast.alpha) * 0.7);
        if (ast.dyingTimer <= 0) {
          this.beltCont.removeChild(ast.cont);
          this.asteroidBelt.splice(i, 1);
        }
      } else {
        // Fade in on spawn
        if (ast.alpha < 1) {
          ast.alpha = Math.min(1, ast.alpha + dt * 3.0);
          ast.cont.alpha = ast.alpha;
        }
        // Random destruction
        if (Math.random() < CameraBorder3.ASTEROID_DEATH_CHANCE * dt * 60) {
          ast.dying = true;
          ast.dyingTimer = CameraBorder3.ASTEROID_DEATH_DURATION;
          this.spawnDebris(ast.cont.x, ast.cont.y);
        }
      }
    }

    // Debris particles
    const debrisDrag = Math.pow(0.82, dt * 60);
    for (const d of this.debrisParticles) {
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= debrisDrag;
      d.vy *= debrisDrag;
    }
    this.debrisParticles = this.debrisParticles.filter((d) => d.life > 0);
    for (const sat of this.naturalSatellites) {
      sat.orbitAngle += sat.orbitSpeed * dt;
      const r = sat.orbitRadius * breatheNow;
      sat.cont.x = Math.cos(sat.orbitAngle) * r;
      sat.cont.y = Math.sin(sat.orbitAngle) * r;
      sat.cont.rotation += sat.selfRotSpeed * dt;
    }

    // Particles
    for (const p of this.particles) {
      p.angle += p.orbitSpeed;
    }

    // Fluid stains — advance orbit + self-rotation + Fourier mode phases
    for (const stain of this.fluidStains) {
      stain.angle += stain.speed * dt;
      stain.rotation += stain.rotSpeed * dt;
      for (const m of stain.modes) m.phase += m.speed * dt;
    }

    this.drawFrame(dt);
  }

  // ── Beat simulation ────────────────────────────────────────────────────────

  private tickBeat(dt: number): void {
    // ── Macro activity envelope ────────────────────────────────────────────
    // Full cycle ≈ 175 s — creates natural ebb/flow without any external input
    this.activityPhase += dt * 0.018;
    this.activityLevel = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.activityPhase));

    if (this.time >= this.nextBeatTime) {
      // ── Heartbeat tempo: 45–70 BPM, slower during rest phases ─────────────
      const restStretch = 1 + (1 - this.activityLevel) * 1.3;
      const baseInterval = (0.85 + Math.random() * 0.55) * restStretch;

      // 12 % chance of a skipped beat (longer pause, no visual burst)
      if (Math.random() < 0.12) {
        this.nextBeatTime =
          this.time + baseInterval + 0.6 + Math.random() * 0.8;
        this.beatAmplitude = 1.05; // barely a blip
      } else {
        this.nextBeatTime = this.time + baseInterval;
        // Beat strength scales with activity — half-energy at rest, full at peak
        this.beatAmplitude =
          1.4 + this.activityLevel * 1.4 + Math.random() * 0.4;
        this.jitterAmp = 0.3 + this.activityLevel * 0.55;

        this.spawnSparks(true);
        if (Math.random() < 0.45 * this.activityLevel) this.spawnLightning();
        this.spawnElectricSpikes();
        if (Math.random() < 0.3 * this.activityLevel) this.spawnFirework();
        if (Math.random() < 0.25 * this.activityLevel) this.spawnPaintSplash();

        // Glitch: rare, only during active phases
        if (
          !this.glitchActive &&
          this.time >= this.glitchNextTime &&
          Math.random() < 0.12 * this.activityLevel
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

    // Slower decay — beat sustains through the full interval
    this.beatAmplitude = Math.max(1.0, this.beatAmplitude - dt * 1.6);
    this.jitterAmp = Math.max(0, this.jitterAmp - dt * 2.0);
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
    if (this.brushStrokes.length > CameraBorder3.MAX_STROKES) {
      this.brushStrokes.splice(
        0,
        this.brushStrokes.length - CameraBorder3.MAX_STROKES,
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
    if (this.sparkles.length > CameraBorder3.MAX_SPARKLES) {
      this.sparkles.splice(
        0,
        this.sparkles.length - CameraBorder3.MAX_SPARKLES,
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
    if (this.sparks.length > CameraBorder3.MAX_SPARKS) {
      this.sparks.splice(0, this.sparks.length - CameraBorder3.MAX_SPARKS);
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
      this.lightningBolts.length < CameraBorder3.MAX_BOLTS
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

  private spawnFirework(): void {
    const angle = Math.random() * Math.PI * 2;
    const r = this.baseRadius + (Math.random() - 0.5) * 12;
    const ox = Math.cos(angle) * r;
    const oy = Math.sin(angle) * r;
    const color = randomPalette();
    const count = 22 + Math.floor(Math.random() * 16);
    for (let i = 0; i < count; i++) {
      const shootAngle =
        (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const speed = 55 + Math.random() * 145;
      this.fireworkParticles.push({
        x: ox,
        y: oy,
        vx: Math.cos(shootAngle) * speed,
        vy: Math.sin(shootAngle) * speed,
        life: 1.0,
        decay: 1.1 + Math.random() * 1.9,
        size: 1.8 + Math.random() * 3.2,
        color,
      });
    }
    if (this.fireworkParticles.length > CameraBorder3.MAX_FIREWORK_PARTICLES)
      this.fireworkParticles.splice(
        0,
        this.fireworkParticles.length - CameraBorder3.MAX_FIREWORK_PARTICLES,
      );
  }

  private spawnElectricSpikes(): void {
    const burstAngle = Math.random() * Math.PI * 2;
    const count = 5 + Math.floor(Math.random() * 7);
    const r = this.baseRadius;
    const color = randomPalette();
    for (let i = 0; i < count; i++) {
      const a = burstAngle + (Math.random() - 0.5) * 1.1;
      const length = 20 + Math.random() * 65;
      const sx = Math.cos(a) * r,
        sy = Math.sin(a) * r;
      const ex = Math.cos(a) * (r + length),
        ey = Math.sin(a) * (r + length);
      const dx = ex - sx,
        dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len,
        py = dx / len;
      const segs = 3 + Math.floor(Math.random() * 4);
      const pts: Array<[number, number]> = [[sx, sy]];
      for (let j = 1; j < segs; j++) {
        const t = j / segs;
        const off = (Math.random() - 0.5) * 15;
        pts.push([sx + dx * t + px * off, sy + dy * t + py * off]);
      }
      pts.push([ex, ey]);
      this.electricSpikes.push({
        points: pts,
        alpha: 0.9 + Math.random() * 0.1,
        decay: 4.0 + Math.random() * 6.0,
        color,
        width: 0.7 + Math.random() * 1.3,
      });
    }
    if (this.electricSpikes.length > CameraBorder3.MAX_SPIKES)
      this.electricSpikes.splice(
        0,
        this.electricSpikes.length - CameraBorder3.MAX_SPIKES,
      );
  }

  private spawnPaintSplash(): void {
    const angle = Math.random() * Math.PI * 2;
    const r = this.baseRadius + (Math.random() - 0.5) * 22;
    const ox = Math.cos(angle) * r;
    const oy = Math.sin(angle) * r;
    const color = randomPalette();
    const count = 14 + Math.floor(Math.random() * 12);
    for (let i = 0; i < count; i++) {
      const shootAngle = angle + (Math.random() - 0.5) * Math.PI * 0.85;
      const speed = 35 + Math.random() * 105;
      this.splashDroplets.push({
        x: ox,
        y: oy,
        vx: Math.cos(shootAngle) * speed,
        vy: Math.sin(shootAngle) * speed,
        life: 1.0,
        decay: 1.4 + Math.random() * 2.6,
        size: 1.4 + Math.random() * 4.0,
        color,
      });
    }
    if (this.splashDroplets.length > CameraBorder3.MAX_SPLASH_DROPLETS)
      this.splashDroplets.splice(
        0,
        this.splashDroplets.length - CameraBorder3.MAX_SPLASH_DROPLETS,
      );
  }

  private drawFireworks(): void {
    for (const p of this.fireworkParticles) {
      this.effectGfx
        .circle(p.x, p.y, p.size * 3.2)
        .fill({ color: p.color, alpha: p.life * 0.14 });
      this.effectGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: p.color, alpha: p.life });
      this.effectGfx
        .circle(p.x, p.y, p.size * 0.4)
        .fill({ color: 0xffffff, alpha: p.life * 0.65 });
    }
  }

  private drawElectricSpikes(): void {
    for (const s of this.electricSpikes) {
      const pts = s.points;
      // Outer glow
      this.effectGfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++)
        this.effectGfx.lineTo(pts[i][0], pts[i][1]);
      this.effectGfx.stroke({
        color: s.color,
        alpha: s.alpha * 0.14,
        width: s.width * 9,
        cap: "round",
        join: "round",
      });
      // Mid glow
      this.effectGfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++)
        this.effectGfx.lineTo(pts[i][0], pts[i][1]);
      this.effectGfx.stroke({
        color: s.color,
        alpha: s.alpha * 0.42,
        width: s.width * 3,
        cap: "round",
        join: "round",
      });
      // Core
      this.effectGfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++)
        this.effectGfx.lineTo(pts[i][0], pts[i][1]);
      this.effectGfx.stroke({
        color: s.color,
        alpha: s.alpha,
        width: s.width,
        cap: "round",
        join: "round",
      });
      // Bright tip
      const tip = pts[pts.length - 1];
      this.effectGfx
        .circle(tip[0], tip[1], s.width * 2.2)
        .fill({ color: s.color, alpha: s.alpha });
      this.effectGfx
        .circle(tip[0], tip[1], s.width * 1.1)
        .fill({ color: 0xffffff, alpha: s.alpha * 0.8 });
    }
  }

  private drawSplashDroplets(): void {
    for (const d of this.splashDroplets) {
      this.effectGfx
        .circle(d.x, d.y, d.size * 2.4)
        .fill({ color: d.color, alpha: d.life * 0.12 });
      this.effectGfx
        .circle(d.x, d.y, d.size)
        .fill({ color: d.color, alpha: d.life * 0.88 });
    }
  }

  // ── Main draw ──────────────────────────────────────────────────────────────

  private drawFrame(dt: number): void {
    // Global breathing scale — all layers scale together
    const breathe = 1 + 0.03 * Math.sin(this.time * 0.7);

    // Breathe the anchor ring
    this.baseRingGfx.scale.set(breathe);

    // ── Brush strokes ────────────────────────────────────────────────────────
    this.brushGfx.clear();
    for (const s of this.brushStrokes) this.drawBrushStroke(s, breathe);

    // ── TrapNation wave rings ─────────────────────────────────────────────────
    this.waveGfx.clear();
    for (let ci = 0; ci < WAVE_CONFIGS.length; ci++) {
      const cfg = WAVE_CONFIGS[ci];
      // Per-ring independent drift — each ring wanders at its own pace
      this.ringSpeedDrift[ci] +=
        dt * (0.008 + ci * 0.0005) * (ci % 2 === 0 ? 1 : -1);
      this.ringAmpDrift[ci] += dt * (0.019 + ci * 0.002);
      const speedMod = 1 + 0.28 * Math.sin(this.ringSpeedDrift[ci]);
      const ampEnv = 0.45 + 0.55 * Math.abs(Math.sin(this.ringAmpDrift[ci]));
      const phase = this.time * cfg.speed * speedMod + cfg.phaseOffset;
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

    // ── Graffiti marks ────────────────────────────────────────────────────────
    this.graffGfx.clear();
    this.drawGraffMarks(breathe);

    // ── Surface black lines ───────────────────────────────────────────────────
    this.surfaceGfx.clear();
    this.drawSurfaceLines();

    // ── Effects: sparkles, sparks, lightning, fireworks, spikes, splashes ────
    this.effectGfx.clear();
    this.drawSparkles();
    this.drawSparks();
    this.drawLightning();
    this.drawFireworks();
    this.drawElectricSpikes();
    this.drawSplashDroplets();

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

    // ── Asteroid debris ───────────────────────────────────────────────────────
    this.beltEffectGfx.clear();
    for (const d of this.debrisParticles) {
      const t = d.life / d.maxLife;
      this.beltEffectGfx
        .circle(d.x, d.y, d.r * t)
        .fill({ color: d.color, alpha: t * 0.85 });
    }

    // ── Logo badge ────────────────────────────────────────────────────────────
    if (this.logoSprite && this.logoGfx) this.animateLogo();
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
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + this.time * 0.008;
      const rOff = (i % 2 === 0 ? 1 : -1) * 28;
      const cx = Math.cos(ang) * (r + rOff);
      const cy = Math.sin(ang) * (r + rOff);
      const sz = 5 + 2 * Math.sin(this.time * 0.35 + i);
      const col =
        i % 3 === 0 ? TOXIC_GREEN : i % 3 === 1 ? TOXIC_VIOLET : RAZER_GREEN;
      const alpha = 0.4 + 0.3 * Math.sin(this.time * 0.25 + i * 0.9);

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

  // ── Surface black lines ────────────────────────────────────────────────────

  private drawSurfaceLines(): void {
    const dt = 1 / 60;
    for (let i = this.surfaceLines.length - 1; i >= 0; i--) {
      const ln = this.surfaceLines[i];
      ln.life += ln.fadeDir * ln.fadeSpeed * dt;

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
          width: ln.width,
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
      // Advance angle — beat makes fast dots surge slightly
      const beatBoost = dot.speed > 0 ? this.beatAmplitude * 0.18 : 1.0;
      dot.angle += dot.speed * dt * (1 + beatBoost * 0.15);

      const r = (this.baseRadius + dot.radiusOffset) * breathe;
      const x = Math.cos(dot.angle) * r;
      const y = Math.sin(dot.angle) * r;

      // Alpha pulses gently; beat gives a short brightness kick
      const baseAlpha =
        0.55 + 0.45 * Math.sin(this.time * dot.alphaSpeed + dot.alphaPhase);
      const kickAlpha = Math.min(
        1.0,
        baseAlpha + (this.beatAmplitude - 1.0) * 0.35,
      );
      const size = dot.size * (1 + (this.beatAmplitude - 1) * 0.25);

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
    const dt = 1 / 60;
    const sprite = this.logoSprite!;
    const gfx = this.logoGfx!;

    // Advance orbit
    this.logoOrbitAngle += CameraBorder3.LOGO_ORBIT_SPEED * dt;
    const globalBreathe = 1 + 0.03 * Math.sin(this.time * 0.7);
    const orbitR = CameraBorder3.LOGO_ORBIT_RADIUS * globalBreathe;
    const x = Math.cos(this.logoOrbitAngle) * orbitR;
    const y = Math.sin(this.logoOrbitAngle) * orbitR;

    // Slow breathe + persistent high-freq tremor
    const breathe = 1 + 0.055 * Math.sin(this.time * 0.6);
    const tremor =
      1 +
      0.013 * Math.sin(this.time * 19.4) +
      0.009 * Math.sin(this.time * 27.1) +
      0.006 * Math.sin(this.time * 41.7);
    sprite.scale.set(this.logoBaseScale * breathe * tremor);

    // Micro position quake
    const qx =
      Math.sin(this.time * 17.3) * 1.8 + Math.sin(this.time * 31.1) * 1.0;
    const qy =
      Math.cos(this.time * 23.7) * 1.4 + Math.cos(this.time * 37.9) * 0.8;
    sprite.x = x + qx;
    sprite.y = y + qy;
    sprite.alpha = 0.9 + Math.sin(this.time * 0.75) * 0.1;

    const aura = 32 + 4 * Math.sin(this.time * 0.5);

    gfx.clear();
    gfx.circle(x, y, aura * 2.2).fill({ color: RAZER_GREEN, alpha: 0.05 });
    gfx.circle(x, y, aura * 1.4).fill({ color: RAZER_GREEN, alpha: 0.1 });
    gfx.circle(x, y, aura * 0.9).fill({ color: LOL_VIOLET, alpha: 0.07 });

    const r0 = aura + 4,
      a0 = this.time * 0.75;
    gfx
      .moveTo(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0)
      .arc(x, y, r0, a0, a0 + Math.PI * 1.4)
      .stroke({ color: RAZER_GREEN, alpha: 0.9, width: 1.5, cap: "round" });

    const r1 = r0 - 5,
      a1 = -this.time * 0.48 + Math.PI * 0.5;
    gfx
      .moveTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1)
      .arc(x, y, r1, a1, a1 + Math.PI * 0.8)
      .stroke({ color: LOL_VIOLET, alpha: 0.65, width: 1.0, cap: "round" });
  }

  // ── Asteroid belt ────────────────────────────────────────────────────────

  private initAsteroidBelt(): void {
    for (let i = 0; i < 60; i++) this.spawnAsteroid(true);
  }

  private spawnAsteroid(instant = false): void {
    const BASE_A = this.baseRadius + 92; // semi-major axis centre
    const bodyR = 4 + Math.random() * 10;
    const semiMajor = BASE_A + (Math.random() - 0.5) * 24;
    const eccentricity = 0.18 + Math.random() * 0.52; // 0.18–0.70
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const orbitTilt = Math.random() * Math.PI * 2;
    const precessionSpd = (Math.random() - 0.5) * 0.06; // slow, both directions
    const orbitSpd = -0.28 + (Math.random() - 0.5) * 0.1;
    const selfRot = (Math.random() - 0.5) * 0.9;

    const cont = new Container();
    const gfx = new Graphics();
    cont.addChild(gfx);
    paintAsteroid(gfx, bodyR);
    this.beltCont.addChild(cont);

    const alpha = instant ? 1 : 0;
    cont.alpha = alpha;

    this.asteroidBelt.push({
      cont,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitSpeed: orbitSpd,
      semiMajor,
      semiMinor,
      orbitTilt,
      precessionSpeed: precessionSpd,
      selfRotSpeed: selfRot,
      alpha,
      dying: false,
      dyingTimer: 0,
    });
  }

  private spawnDebris(wx: number, wy: number): void {
    const COLORS = [0x909098, 0x706860, 0x5a5a62, 0x9898a0, 0x484850];
    const count = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 75;
      const life = 0.35 + Math.random() * 0.55;
      this.debrisParticles.push({
        x: wx,
        y: wy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 1.2 + Math.random() * 3.0,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life,
        maxLife: life,
      });
    }
  }

  // ── Natural satellites ────────────────────────────────────────────────────

  private initNaturalSatellites(): void {
    // Moon, Europa, Io — each on a distinct orbit, drawn once, slowly self-rotating
    const defs = [
      {
        kind: 0,
        r: this.baseRadius + 32,
        orbitSpd: 0.16,
        bodyR: 26,
        selfRot: 0.018,
      }, // Moon
      {
        kind: 1,
        r: this.baseRadius + 60,
        orbitSpd: -0.11,
        bodyR: 22,
        selfRot: -0.024,
      }, // Europa
      {
        kind: 2,
        r: this.baseRadius + 85,
        orbitSpd: 0.2,
        bodyR: 20,
        selfRot: 0.03,
      }, // Io
    ];
    for (const d of defs) {
      const cont = new Container();
      const gfx = new Graphics();
      cont.addChild(gfx);
      paintNatSatellite(gfx, d.kind, d.bodyR);
      this.natSatCont.addChild(cont);
      this.naturalSatellites.push({
        cont,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: d.orbitSpd,
        orbitRadius: d.r,
        selfRotSpeed: d.selfRot,
        kind: d.kind,
      });
    }
  }
}
