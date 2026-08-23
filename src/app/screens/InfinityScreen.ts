import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { randRange as rnd, TAU } from "../../lib/math";

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;
const FOV = 1100;

// Catppuccin Mocha
const CRUST = 0x11111b;
const MANTLE = 0x181825;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const LAVENDER = 0xb4befe;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const TEAL = 0x94e2d5;
const GREEN = 0xa6e3a1;
const MAUVE = 0xcba6f7;
const PINK = 0xf38ba8;
const YELLOW = 0xf9e2af;

// Lemniscate geometry
const A_INF = 285;
const N_CURVE = 200;

// Particle counts
const N_TRAIL = 520;
const N_HELIX = 320;
const N_HELIX_TURNS = 4;
const HELIX_RADIUS = 340;
const HELIX_HEIGHT = 460;

// Rotation speeds (rad/ms)
const Y_ROT_SPEED = TAU / 11_000;
const HELIX_ROT_SPEED = TAU / 8_500;

function lemniscate(t: number): [number, number] {
  const s = Math.sin(t);
  const d = 1 + s * s;
  return [(A_INF * Math.cos(t)) / d, (A_INF * s * Math.cos(t)) / d];
}

function project(x: number, y: number, z: number): [number, number, number] {
  const scale = FOV / (FOV + z);
  return [CX + x * scale, CY + y * scale, scale];
}

function makeDotTex(hex: number, radius: number): Texture {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const sz = (radius + 2) * 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = sz;
  const ctx = cv.getContext("2d")!;
  const mid = sz / 2;
  const grad = ctx.createRadialGradient(mid, mid, 0, mid, mid, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sz, sz);
  return Texture.from(cv);
}

export class InfinityScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgG = new Graphics();
  private readonly nebulaLayer = new Container();
  private readonly helixLayer = new Container();
  private readonly glowG = new Graphics();
  private readonly curveG = new Graphics();
  private readonly trailLayer = new Container();
  private readonly centerGlowG = new Graphics();

  private nebMeta: { c: Container; phase: number; period: number }[] = [];

  // Infinity trail state
  private trailPhases!: Float32Array;
  private trailSpeeds!: Float32Array;
  private trailSprites: Sprite[] = [];
  private trailTextures: Texture[] = [];

  // Helix spiral state
  private helixAngles!: Float32Array;
  private helixHeights!: Float32Array;
  private helixRadii!: Float32Array;
  private helixSprites: Sprite[] = [];
  private helixTextures: Texture[] = [];

  private rotY = 0;
  private helixRot = 0;
  private elapsed = 0;
  private ready = false;

  constructor() {
    super();
    for (const l of [
      this.bgG,
      this.nebulaLayer,
      this.helixLayer,
      this.glowG,
      this.curveG,
      this.trailLayer,
      this.centerGlowG,
    ]) {
      this.addChild(l);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.glowG as any).blendMode = "add";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.centerGlowG as any).blendMode = "add";
  }

  public async show(): Promise<void> {
    this.trailTextures = [
      makeDotTex(MAUVE, 7),
      makeDotTex(BLUE, 7),
      makeDotTex(LAVENDER, 6),
    ];
    this.helixTextures = [
      makeDotTex(TEAL, 4),
      makeDotTex(SAPPHIRE, 4),
      makeDotTex(GREEN, 4),
      makeDotTex(LAVENDER, 4),
    ];

    this.buildBg();
    this.buildNebulae();
    this.buildHelix();
    this.buildTrail();
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;
    const dt = time.deltaMS;
    this.elapsed += dt;
    this.rotY += Y_ROT_SPEED * dt;
    this.helixRot += HELIX_ROT_SPEED * dt;

    // Helix spiral particles orbit the Y-axis
    for (let i = 0; i < N_HELIX; i++) {
      const angle = this.helixAngles[i] + this.helixRot;
      const r = this.helixRadii[i];
      const [sx, sy, sc] = project(
        r * Math.cos(angle),
        this.helixHeights[i],
        r * Math.sin(angle),
      );
      const s = this.helixSprites[i];
      s.x = sx;
      s.y = sy;
      s.alpha =
        (0.1 + 0.3 * sc) *
        (0.5 + 0.5 * Math.sin(this.elapsed * 0.0006 + i * 0.09));
      s.scale.set(0.3 + 0.5 * sc);
    }

    // Trail particles travel along the lemniscate in 3D
    for (let i = 0; i < N_TRAIL; i++) {
      this.trailPhases[i] =
        (this.trailPhases[i] + this.trailSpeeds[i] * dt) % TAU;
      const [px, py] = lemniscate(this.trailPhases[i]);
      const [sx, sy, sc] = project(
        px * Math.cos(this.rotY),
        py,
        px * Math.sin(this.rotY),
      );
      const s = this.trailSprites[i];
      s.x = sx;
      s.y = sy;
      s.alpha = 0.28 + 0.62 * sc;
      s.scale.set(0.35 + 0.55 * sc);
    }

    this.updateCurve();
    this.updateCenterGlow();

    for (const nb of this.nebMeta) {
      nb.c.alpha =
        0.022 +
        0.032 *
          (0.5 + 0.5 * Math.sin((TAU * this.elapsed) / nb.period + nb.phase));
    }
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width - W) / 2);
    this.y = Math.round((height - H) / 2);
  }

  private buildBg(): void {
    const g = this.bgG;
    g.rect(0, 0, W, H).fill({ color: CRUST });

    // Subtle vignette — dark outer rings
    for (let i = 5; i >= 1; i--) {
      g.circle(CX, CY, i * 230).fill({
        color: i % 2 === 0 ? MANTLE : SURFACE0,
        alpha: 0.03,
      });
    }

    // Dim background stars
    for (let i = 0; i < 1700; i++) {
      const hue = Math.random();
      const col = hue < 0.65 ? SURFACE1 : hue < 0.85 ? LAVENDER : BLUE;
      g.circle(rnd(0, W), rnd(0, H), rnd(0.3, 1.0)).fill({
        color: col,
        alpha: rnd(0.04, 0.28),
      });
    }

    // Bright diffraction-spike stars, kept away from the centre
    for (let i = 0; i < 22; i++) {
      const x = rnd(40, W - 40);
      const y = rnd(40, H - 40);
      if (Math.hypot(x - CX, y - CY) < 380) continue;
      const cols = [LAVENDER, BLUE, YELLOW, PINK, TEAL] as const;
      const col = cols[i % cols.length];
      const al = rnd(0.5, 0.92);
      g.circle(x, y, rnd(0.7, 1.4)).fill({ color: col, alpha: al });
      const len = rnd(7, 24);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI;
        for (const d of [-1, 1] as const) {
          g.moveTo(x, y)
            .lineTo(x + Math.cos(ang) * d * len, y + Math.sin(ang) * d * len)
            .stroke({ color: col, width: 0.4, alpha: al * 0.42 });
        }
      }
    }
  }

  private buildNebulae(): void {
    const defs = [
      { color: MAUVE, cx: CX - 430, cy: CY - 80, spread: 190, n: 90 },
      { color: BLUE, cx: CX + 390, cy: CY + 105, spread: 170, n: 84 },
      { color: TEAL, cx: CX - 55, cy: CY + 285, spread: 155, n: 78 },
      { color: SAPPHIRE, cx: CX + 95, cy: CY - 260, spread: 145, n: 74 },
      { color: PINK, cx: CX - 295, cy: CY + 225, spread: 130, n: 68 },
      { color: GREEN, cx: CX + 445, cy: CY - 190, spread: 138, n: 72 },
    ] as const;

    for (const nb of defs) {
      const c = new Container();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).blendMode = "add";
      const gg = new Graphics();
      for (let i = 0; i < nb.n; i++) {
        gg.circle(
          nb.cx + (Math.random() - 0.5) * 2 * nb.spread,
          nb.cy + (Math.random() - 0.5) * 2 * nb.spread,
          rnd(14, 42),
        ).fill({ color: nb.color, alpha: 1 });
      }
      c.addChild(gg);
      c.alpha = rnd(0.02, 0.055);
      this.nebulaLayer.addChild(c);
      this.nebMeta.push({ c, phase: rnd(0, TAU), period: rnd(6500, 17000) });
    }
  }

  private buildHelix(): void {
    this.helixAngles = new Float32Array(N_HELIX);
    this.helixHeights = new Float32Array(N_HELIX);
    this.helixRadii = new Float32Array(N_HELIX);

    for (let i = 0; i < N_HELIX; i++) {
      const t = i / N_HELIX;
      this.helixAngles[i] = t * TAU * N_HELIX_TURNS;
      this.helixHeights[i] = (t - 0.5) * HELIX_HEIGHT;
      this.helixRadii[i] =
        HELIX_RADIUS * (0.82 + 0.18 * Math.sin(t * TAU * 2.8));
      const s = new Sprite(this.helixTextures[i % this.helixTextures.length]);
      s.anchor.set(0.5);
      this.helixLayer.addChild(s);
      this.helixSprites.push(s);
    }
  }

  private buildTrail(): void {
    this.trailPhases = new Float32Array(N_TRAIL);
    this.trailSpeeds = new Float32Array(N_TRAIL);

    for (let i = 0; i < N_TRAIL; i++) {
      this.trailPhases[i] = (i / N_TRAIL) * TAU;
      this.trailSpeeds[i] = rnd(0.00022, 0.00065);
      const idx = Math.floor((i / N_TRAIL) * this.trailTextures.length);
      const s = new Sprite(this.trailTextures[idx]);
      s.anchor.set(0.5);
      this.trailLayer.addChild(s);
      this.trailSprites.push(s);
    }
  }

  private updateCurve(): void {
    this.glowG.clear();
    this.curveG.clear();

    // Pre-project all curve points once
    const pts: [number, number, number][] = new Array(N_CURVE + 1);
    for (let i = 0; i <= N_CURVE; i++) {
      const [px, py] = lemniscate((i / N_CURVE) * TAU);
      pts[i] = project(px * Math.cos(this.rotY), py, px * Math.sin(this.rotY));
    }

    // Outer soft glow — single polyline per pass (fast)
    const glowPasses = [
      { w: 24, a: 0.022, col: MAUVE },
      { w: 14, a: 0.05, col: BLUE },
      { w: 8, a: 0.09, col: LAVENDER },
    ];
    for (const p of glowPasses) {
      this.glowG.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= N_CURVE; i++) {
        this.glowG.lineTo(pts[i][0], pts[i][1]);
      }
      this.glowG.stroke({ color: p.col, width: p.w, alpha: p.a });
    }

    // Core line — per-segment so width scales with depth
    for (let i = 0; i < N_CURVE; i++) {
      const [x1, y1, sc1] = pts[i];
      const [x2, y2] = pts[i + 1];
      this.curveG
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          color: LAVENDER,
          width: 3.0 * (0.2 + 0.8 * sc1),
          alpha: 0.72 * (0.3 + 0.7 * sc1),
        });
    }

    // Bright white highlight — single polyline
    this.curveG.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= N_CURVE; i++) {
      this.curveG.lineTo(pts[i][0], pts[i][1]);
    }
    this.curveG.stroke({ color: 0xffffff, width: 0.9, alpha: 0.3 });
  }

  private updateCenterGlow(): void {
    const g = this.centerGlowG;
    g.clear();
    const pulse = 0.62 + 0.38 * Math.sin((TAU * this.elapsed) / 3100);
    const mR = [7, 18, 36, 62, 100];
    const mA = [0.28, 0.16, 0.1, 0.055, 0.028];
    for (let i = 0; i < 5; i++) {
      g.circle(CX, CY, mR[i] * pulse).fill({ color: MAUVE, alpha: mA[i] });
    }
    const lR = [5, 12, 26];
    const lA = [0.32, 0.2, 0.12];
    for (let i = 0; i < 3; i++) {
      g.circle(CX, CY, lR[i] * pulse).fill({ color: LAVENDER, alpha: lA[i] });
    }
  }
}
