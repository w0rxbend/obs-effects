import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const STEPS = 200;

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;

const HOLE_R = 240;
const BLOB_BASE_R = 292;

// Color ramp: Catppuccin Crust (silent) → dark green → toxic green (loud)
const C_CALM = { r: 0x11, g: 0x11, b: 0x1b };
const C_MID = { r: 0x1a, g: 0x7a, b: 0x10 };
const C_HOT = { r: 0x39, g: 0xff, b: 0x14 };

function lerpC(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): number {
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return (r << 16) | (g << 8) | bl;
}

function volumeColor(vol: number): number {
  const v = Math.max(0, Math.min(1, vol));
  if (v < 0.45) return lerpC(C_CALM, C_MID, v / 0.45);
  return lerpC(C_MID, C_HOT, (v - 0.45) / 0.55);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface Harmonic {
  freq: number;
  amp: number;
  speed: number;
  phase: number;
}

// Slow organic base shape
const HARMONICS: Harmonic[] = [
  { freq: 3, amp: 24, speed: 0.32, phase: 0.0 },
  { freq: 5, amp: 14, speed: -0.25, phase: 1.1 },
  { freq: 7, amp: 9, speed: 0.4, phase: 2.7 },
  { freq: 11, amp: 5, speed: -0.16, phase: 0.5 },
  { freq: 13, amp: 3, speed: 0.52, phase: 1.9 },
];

// Turbulence — blends in proportional to volume
const TURB_H: Harmonic[] = [
  { freq: 6, amp: 20, speed: 1.4, phase: 0.6 },
  { freq: 9, amp: 14, speed: -1.1, phase: 2.9 },
  { freq: 15, amp: 9, speed: 1.8, phase: 1.7 },
  { freq: 19, amp: 6, speed: -2.2, phase: 0.3 },
  { freq: 4, amp: 24, speed: 0.85, phase: 3.5 },
];

function buildBlob(
  steps: number,
  base: number,
  time: number,
  vol: number,
  phaseOffset = 0,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const speedMul = 1 + vol * 2.5;

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU + phaseOffset;
    let r = base;
    for (const h of HARMONICS) {
      r += Math.sin(a * h.freq + time * h.speed * speedMul + h.phase) * h.amp;
    }
    for (const h of TURB_H) {
      r += Math.sin(a * h.freq + time * h.speed + h.phase) * h.amp * vol;
    }
    r = Math.max(r, HOLE_R + 2);
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export class AmorphousBlobCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly gfxGlow = new Graphics();
  private readonly gfxCore = new Graphics();

  private time = 0;
  private volume = 0;

  private analyser: AnalyserNode | null = null;
  private audioData: Uint8Array<ArrayBuffer> | null = null;

  constructor() {
    super();
    this.world.x = CX;
    this.world.y = CY;
    // gfxGlow sits below the body fill; gfxCore draws fill + crisp strokes on top
    this.world.addChild(this.gfxGlow);
    this.world.addChild(this.gfxCore);
    this.addChild(this.world);
    void this.initAudio();
  }

  private async initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.5;
      src.connect(this.analyser);
      this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      // No mic — idle animation runs at vol = 0
    }
  }

  private readRMS(): number {
    if (!this.analyser || !this.audioData) return 0;
    this.analyser.getByteTimeDomainData(this.audioData);
    let sum = 0;
    for (const v of this.audioData) {
      const n = (v - 128) / 128;
      sum += n * n;
    }
    return Math.sqrt(sum / this.audioData.length);
  }

  public async show(): Promise<void> {}

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;

    // Fast attack, slow decay
    const raw = clamp(this.readRMS() * 4, 0, 1);
    const rate = raw > this.volume ? 0.6 : 0.055;
    this.volume += (raw - this.volume) * rate;

    this.draw();
  }

  private draw(): void {
    const vol = this.volume;
    const gc = this.gfxGlow;
    const gn = this.gfxCore;
    gc.clear();
    gn.clear();

    const t = this.time;
    const breathe = Math.sin(t * 0.9);

    const col = volumeColor(vol);
    const colHot = volumeColor(clamp(vol + 0.25, 0, 1));
    const colCool = volumeColor(clamp(vol - 0.15, 0, 1));

    // Body fill: Catppuccin Crust, stays dark throughout
    const bodyColor = 0x11111b;

    // ── Main blob body ─────────────────────────────────────────────────────────
    const bodyPts = buildBlob(STEPS, BLOB_BASE_R, t, vol);
    gn.poly(bodyPts).fill({ color: bodyColor, alpha: 0.94 });
    gn.circle(0, 0, HOLE_R).cut();

    // ── Outer glow — radiates outward, expands with volume ─────────────────────
    const auraPts = buildBlob(STEPS, BLOB_BASE_R + 4, t, vol);
    const glowW = 36 + vol * 50;
    gc.poly(auraPts).stroke({
      color: col,
      width: glowW,
      alpha: (0.06 + 0.04 * breathe) * (0.4 + vol * 0.6),
    });
    gc.poly(auraPts).stroke({
      color: colHot,
      width: glowW * 0.4,
      alpha: 0.05 + vol * 0.18,
    });

    // ── Crisp outer edge ───────────────────────────────────────────────────────
    gn.poly(bodyPts).stroke({
      color: col,
      width: 2.5 + vol * 2.5,
      alpha: 0.7 + vol * 0.28,
    });

    // Chromatic fringe — slight time offset for depth shimmer
    const fringePts = buildBlob(STEPS, BLOB_BASE_R, t + 0.18, vol);
    gn.poly(fringePts).stroke({
      color: colCool,
      width: 1.5,
      alpha: 0.2 + vol * 0.3,
    });

    // ── Mid-band surface highlight ─────────────────────────────────────────────
    const midPts = buildBlob(
      STEPS,
      (BLOB_BASE_R + HOLE_R) * 0.5 + 6,
      t * 0.45,
      vol * 0.4,
    );
    gc.poly(midPts).stroke({ color: 0x120404, width: 10, alpha: 0.3 });
    gc.poly(midPts).stroke({
      color: col,
      width: 1.5,
      alpha: 0.06 + vol * 0.12,
    });

    // ── Inner hole edge glow ───────────────────────────────────────────────────
    gc.circle(0, 0, HOLE_R).stroke({
      color: colCool,
      width: 22 + vol * 24,
      alpha: 0.08 + vol * 0.14,
    });
    gn.circle(0, 0, HOLE_R).stroke({
      color: colCool,
      width: 4,
      alpha: 0.35 + vol * 0.55,
    });
    gn.circle(0, 0, HOLE_R - 8).stroke({
      color: col,
      width: 1.5,
      alpha: 0.15 + vol * 0.3,
    });
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
