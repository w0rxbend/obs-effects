import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const STEPS = 200;

// Catppuccin Mocha
const BASE = 0x1e1e2e;
const SURFACE1 = 0x45475a;
const MAUVE = 0xcba6f7;
const BLUE = 0x89b4fa;
const TEAL = 0x94e2d5;
const LAVENDER = 0xb4befe;
const SAPPHIRE = 0x74c7ec;

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;

const HOLE_R = 240;
const BLOB_BASE_R = 292;

interface Harmonic {
  freq: number;
  amp: number;
  speed: number;
  phase: number;
}

const HARMONICS: Harmonic[] = [
  { freq: 3, amp: 24, speed: 0.32, phase: 0.0 },
  { freq: 5, amp: 14, speed: -0.25, phase: 1.1 },
  { freq: 7, amp: 9, speed: 0.4, phase: 2.7 },
  { freq: 11, amp: 5, speed: -0.16, phase: 0.5 },
  { freq: 13, amp: 3, speed: 0.52, phase: 1.9 },
];

function buildBlob(
  steps: number,
  harmonics: Harmonic[],
  base: number,
  time: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    let r = base;
    for (const h of harmonics) {
      r += Math.sin(a * h.freq + time * h.speed + h.phase) * h.amp;
    }
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export class AmorphousBlobCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly gfx = new Graphics();
  private time = 0;

  constructor() {
    super();
    this.world.x = CX;
    this.world.y = CY;
    this.world.addChild(this.gfx);
    this.addChild(this.world);
  }

  public async show(): Promise<void> {}

  public update(ticker: Ticker): void {
    this.time += Math.min(ticker.deltaMS, 50) / 1000;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const t = this.time;
    const breathe = Math.sin(t * 0.9);

    // ── Main blob body: filled dark shape with transparent camera hole ────────
    const bodyPts = buildBlob(STEPS, HARMONICS, BLOB_BASE_R, t);
    g.poly(bodyPts).fill({ color: BASE, alpha: 0.94 });
    g.circle(0, 0, HOLE_R).cut();

    // ── Outer blob edge — broad glow ──────────────────────────────────────────
    const auraPts = buildBlob(STEPS, HARMONICS, BLOB_BASE_R + 4, t);
    g.poly(auraPts).stroke({
      color: MAUVE,
      width: 36,
      alpha: 0.08 + 0.03 * breathe,
    });
    g.poly(auraPts).stroke({ color: LAVENDER, width: 18, alpha: 0.12 });

    // ── Crisp outer edge strokes ───────────────────────────────────────────────
    g.poly(bodyPts).stroke({ color: MAUVE, width: 2.5, alpha: 0.88 });

    // Chromatic twin fringe — slight time offset creates a colour-shift shimmer
    const fringePts = buildBlob(STEPS, HARMONICS, BLOB_BASE_R, t + 0.18);
    g.poly(fringePts).stroke({ color: SAPPHIRE, width: 1.5, alpha: 0.35 });

    // ── Blob surface highlight — mid-band faint ring ───────────────────────────
    // Gives the blob body a sense of material thickness
    const midPts = buildBlob(
      STEPS,
      HARMONICS,
      (BLOB_BASE_R + HOLE_R) * 0.5 + 6,
      t * 0.45,
    );
    g.poly(midPts).stroke({ color: SURFACE1, width: 10, alpha: 0.3 });
    g.poly(midPts).stroke({ color: LAVENDER, width: 1.5, alpha: 0.12 });

    // ── Inner hole edge glow ───────────────────────────────────────────────────
    g.circle(0, 0, HOLE_R).stroke({
      color: TEAL,
      width: 22,
      alpha: 0.12 + 0.05 * breathe,
    });
    g.circle(0, 0, HOLE_R).stroke({ color: TEAL, width: 4, alpha: 0.6 });
    g.circle(0, 0, HOLE_R - 8).stroke({ color: BLUE, width: 1.5, alpha: 0.3 });
  }

  public resize(width: number, height: number): void {
    const distortX = window.innerWidth / width;
    const distortY = window.innerHeight / height;
    const padding = 256;
    const availCSS =
      Math.min(window.innerWidth, window.innerHeight) - padding * 2;
    const cssScale = availCSS / SIZE;

    this.scale.x = cssScale / distortX;
    this.scale.y = cssScale / distortY;
    this.x = Math.round((width - SIZE * this.scale.x) / 2);
    this.y = Math.round((height - SIZE * this.scale.y) / 2);
  }
}
