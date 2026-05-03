import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const BLOB_STEPS = 96;
const SQUIRCLE_POWER = 4.3;

const SIMPSONS_YELLOW = 0xffd90f;
const BODY_SHADOW = 0xc9a200;
const BODY_HIGHLIGHT = 0xffe84a;
const BODY_OUTLINE = 0x281804;
const EYE_WHITE = 0xffffff;
const EYE_STROKE_COL = 0x1a100a;
const PUPIL_COL = 0x100a06;
const BROW_COL = 0x1a100a;
const MOUTH_STROKE_COL = 0x281804;
const MOUTH_INSIDE = 0x1a0a10;
const TEETH_COL = 0xf0ece4;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function squircleXY(angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    Math.sign(c) * Math.pow(Math.abs(c), 2 / SQUIRCLE_POWER),
    Math.sign(s) * Math.pow(Math.abs(s), 2 / SQUIRCLE_POWER),
  ];
}

interface Harmonic {
  freq: number;
  amp: number;
  speed: number;
  phase: number;
}

// Slow organic swell — always running, no audio coupling
const BASE_HARMONICS: Harmonic[] = [
  { freq: 2, amp: 0.026, speed: 0.62, phase: 0.0 },
  { freq: 3, amp: 0.018, speed: -0.47, phase: 1.3 },
  { freq: 5, amp: 0.012, speed: 0.82, phase: 2.6 },
  { freq: 7, amp: 0.007, speed: -0.37, phase: 0.7 },
];

// Higher-frequency ambient ripple — always running, no audio coupling
const AMBIENT_HARMONICS: Harmonic[] = [
  { freq: 4, amp: 0.016, speed: 1.3, phase: 0.5 },
  { freq: 6, amp: 0.011, speed: -1.0, phase: 3.1 },
  { freq: 9, amp: 0.008, speed: 1.55, phase: 1.8 },
  { freq: 13, amp: 0.005, speed: -0.88, phase: 0.3 },
];

// ── Spring constants for jaw physics ─────────────────────────────────────────
// ω₀ ≈ √900 = 30 rad/s ≈ 4.8 Hz  (matches speech syllable rate ~4-6 Hz)
// ζ  ≈ D / (2·ω₀) = 33 / 60 ≈ 0.55  (underdamped → natural jaw bounce per syllable)
const JAW_K = 900;
const JAW_D = 33;

export class BlobFaceCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly bodyGfx = new Graphics();
  private readonly faceGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  // Slow envelope: overall speech activity for mouth shape
  private slowEnv = 0;

  // Second-order spring jaw
  private jawPos = 0;
  private jawVel = 0;

  // Derived: clamped jaw for drawing
  private mouthOpen = 0;

  // Blink
  private eyeOpenness = 1;
  private blinkTimer = 0;
  private nextBlink = 2.5 + Math.random() * 2;

  // Pupil dart
  private pupilX = 0;
  private pupilY = 0;
  private pupilTargetX = 0;
  private pupilTargetY = 0;
  private nextDart = 1.8 + Math.random() * 1.5;

  private analyser: AnalyserNode | null = null;
  private audioData: Uint8Array<ArrayBuffer> | null = null;

  constructor() {
    super();
    this.addChild(this.world);
    this.world.addChild(this.bodyGfx);
    this.world.addChild(this.faceGfx);
    void this._initAudio();
  }

  private async _initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      src.connect(this.analyser);
      this.audioData = new Uint8Array(
        this.analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
    } catch {
      // no mic — idle animation runs without audio
    }
  }

  private _readRMS(): number {
    if (!this.analyser || !this.audioData) return 0;
    this.analyser.getByteTimeDomainData(this.audioData);
    let sum = 0;
    for (const v of this.audioData) {
      const n = (v - 128) / 128;
      sum += n * n;
    }
    return Math.sqrt(sum / this.audioData.length);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  private get blobSize(): number {
    return Math.min(this.w, this.h) * 0.285;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    const NOISE_FLOOR = 0.04;
    const rms = this._readRMS();
    const raw = clamp((rms - NOISE_FLOOR) * 16, 0, 1);

    // Slow envelope: speech activity for mouth width/smile shape
    const sRate = raw > this.slowEnv ? 0.15 : 0.025;
    this.slowEnv += (raw - this.slowEnv) * sRate;

    // Spring jaw driven directly from raw RMS — no intermediate smoothing.
    // Raw RMS oscillates naturally at syllable rate; the spring (ω₀ ≈ 4.8 Hz)
    // tracks each syllable and adds mechanical inertia/bounce.
    const springForce = (raw - this.jawPos) * JAW_K - this.jawVel * JAW_D;
    this.jawVel += springForce * dt;
    this.jawPos += this.jawVel * dt;
    this.mouthOpen = clamp(this.jawPos, 0, 1.2);

    // Blink — sin envelope for smooth open/close
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkTimer = 0.2;
      this.nextBlink = 2.2 + Math.random() * 3.0;
    }
    if (this.blinkTimer > 0) {
      this.blinkTimer = Math.max(0, this.blinkTimer - dt);
      const p = 1 - this.blinkTimer / 0.2;
      this.eyeOpenness = 1 - Math.sin(p * Math.PI);
    } else {
      this.eyeOpenness = 1;
    }

    // Pupil dart
    this.nextDart -= dt;
    if (this.nextDart <= 0) {
      this.pupilTargetX = (Math.random() - 0.5) * 0.4;
      this.pupilTargetY = (Math.random() - 0.5) * 0.2;
      this.nextDart = 1.0 + Math.random() * 2.5;
    }
    const dartEase = 1 - Math.exp(-dt * 9);
    this.pupilX += (this.pupilTargetX - this.pupilX) * dartEase;
    this.pupilY += (this.pupilTargetY - this.pupilY) * dartEase;

    this._draw();
  }

  private _buildBlobPts(
    size: number,
    inflate: number,
    ox: number,
    oy: number,
  ): number[] {
    const pts: number[] = [];
    const t = this.time;

    for (let i = 0; i < BLOB_STEPS; i++) {
      const angle = (i / BLOB_STEPS) * TAU;
      const [bx, by] = squircleXY(angle);
      let dr = inflate;
      for (const h of BASE_HARMONICS) {
        dr += Math.sin(angle * h.freq + t * h.speed + h.phase) * h.amp;
      }
      for (const h of AMBIENT_HARMONICS) {
        dr += Math.sin(angle * h.freq + t * h.speed + h.phase) * h.amp;
      }
      const r = size * (1 + dr);
      pts.push(bx * r + ox, by * r + oy);
    }
    return pts;
  }

  private _draw(): void {
    const size = this.blobSize;
    const t = this.time;
    const bob =
      Math.sin(t * 1.05) * size * 0.03 + Math.cos(t * 0.6) * size * 0.013;
    const lean = Math.sin(t * 0.47) * 0.028;

    this.world.x = this.w * 0.5;
    this.world.y = this.h * 0.5 + bob;
    this.world.rotation = lean;
    this.world.scale.set(1);

    this._drawBody(size);
    this._drawFace(size);
  }

  private _drawBody(size: number): void {
    const g = this.bodyGfx;
    g.clear();

    const main = this._buildBlobPts(size, 0, 0, 0);
    const shadow = this._buildBlobPts(
      size * 0.975,
      0.01,
      size * 0.04,
      size * 0.055,
    );
    const hilite = this._buildBlobPts(
      size * 0.52,
      -0.04,
      -size * 0.18,
      -size * 0.23,
    );
    const sw = Math.max(size * 0.046, 8);

    g.poly(shadow, true).fill({ color: BODY_SHADOW, alpha: 0.36 });
    g.poly(main, true).fill({ color: SIMPSONS_YELLOW, alpha: 1 });
    g.poly(hilite, true).fill({ color: BODY_HIGHLIGHT, alpha: 0.4 });
    g.poly(main, true).stroke({
      color: BODY_OUTLINE,
      width: sw,
      alpha: 1,
      join: "round",
    });
  }

  private _drawFace(size: number): void {
    const g = this.faceGfx;
    g.clear();

    const eyeR = size * 0.195;
    const eyeSpread = size * 0.265;
    const eyeY = -size * 0.09;
    // Brows raise in sync with jaw spring (mouthOpen)
    const browY = eyeY - eyeR * 1.62 - this.mouthOpen * size * 0.07;

    this._drawBrow(g, -eyeSpread, browY, eyeR, -1);
    this._drawBrow(g, eyeSpread, browY, eyeR, 1);
    this._drawEye(g, -eyeSpread, eyeY, eyeR);
    this._drawEye(g, eyeSpread, eyeY, eyeR);
    this._drawMouth(g, size);
  }

  // side: -1 = left, +1 = right
  private _drawBrow(
    g: Graphics,
    cx: number,
    cy: number,
    eyeR: number,
    side: number,
  ): void {
    const dir = -side;
    const bw = eyeR * 1.72; // wider
    const bh = eyeR * 0.5; // bolder / taller
    const innerX = cx + dir * bw * 0.3;
    const innerTopY = cy - bh * 0.88;
    const outerX = cx - dir * bw * 0.52;
    const outerY = cy + bh * 0.08;
    const midTopY = cy - bh;
    const midBotY = cy + bh * 0.14;

    // Fill
    g.moveTo(innerX, innerTopY)
      .quadraticCurveTo(cx, midTopY, outerX, outerY)
      .quadraticCurveTo(cx, midBotY, innerX, innerTopY)
      .fill({ color: BROW_COL, alpha: 1 });

    // Stroke for extra weight / crisp edge
    g.moveTo(innerX, innerTopY)
      .quadraticCurveTo(cx, midTopY, outerX, outerY)
      .quadraticCurveTo(cx, midBotY, innerX, innerTopY)
      .stroke({
        color: BROW_COL,
        width: Math.max(5, eyeR * 0.08),
        alpha: 1,
        join: "round",
        cap: "round",
      });
  }

  private _drawEye(g: Graphics, ex: number, ey: number, eyeR: number): void {
    const openness = clamp(this.eyeOpenness, 0, 1);
    const ry = eyeR * Math.max(0.07, openness);
    const sw = Math.max(eyeR * 0.12, 5);

    if (ry < eyeR * 0.18) {
      g.moveTo(ex - eyeR * 0.85, ey)
        .quadraticCurveTo(ex, ey - eyeR * 0.08, ex + eyeR * 0.85, ey)
        .stroke({
          color: EYE_STROKE_COL,
          width: sw * 0.9,
          alpha: 1,
          cap: "round",
        });
      return;
    }

    g.ellipse(ex, ey, eyeR * 0.97, ry * 0.97).fill({
      color: EYE_WHITE,
      alpha: 1,
    });
    g.ellipse(ex, ey, eyeR, ry).stroke({
      color: EYE_STROKE_COL,
      width: sw,
      alpha: 1,
      join: "round",
    });

    g.moveTo(ex - eyeR * 0.58, ey + ry * 0.5)
      .quadraticCurveTo(ex, ey + ry * 0.9, ex + eyeR * 0.58, ey + ry * 0.5)
      .stroke({
        color: 0xe8f8ff,
        width: Math.max(2, sw * 0.45),
        alpha: 0.65,
        cap: "round",
      });

    const pMax = Math.min(eyeR, ry) * 0.48;
    const px = clamp(ex + this.pupilX * eyeR * 0.62, ex - pMax, ex + pMax);
    const py = clamp(
      ey + this.pupilY * ry * 0.6,
      ey - pMax * 0.55,
      ey + pMax * 0.55,
    );
    const pr = Math.min(eyeR, ry) * 0.38;

    g.circle(px, py, pr).fill({ color: PUPIL_COL, alpha: 1 });
    g.circle(px + pr * 0.36, py - pr * 0.3, Math.max(2, pr * 0.22)).fill({
      color: 0xffffff,
      alpha: 0.92,
    });
  }

  private _drawMouth(g: Graphics, size: number): void {
    const open = this.mouthOpen; // spring-driven, [0, ~1.05]
    const activity = this.slowEnv; // overall speech activity [0,1]
    const sw = Math.max(size * 0.046, 6);

    // Width spreads slightly when speech is active
    const hw = size * (0.27 + activity * 0.04);
    const my = size * 0.42;
    const lx = -hw;
    const rx = hw;

    // Corners droop a little as the jaw drops (realistic anatomy)
    const cornerY = my + open * size * 0.035;

    // Upper lip: gentle concave smile that flattens as mouth opens wide
    const smileArch = size * (0.032 + activity * 0.012);
    const upperCtrlY = cornerY - smileArch * (1 - open * 0.55);

    // Lower jaw: the audio-reactive P1 — drops with jaw spring position
    const lowerCtrlY = cornerY + size * (0.065 + open * 0.36);

    if (open < 0.025) {
      // Closed rest state — gentle smile arc only
      g.moveTo(lx, my)
        .quadraticCurveTo(0, my + smileArch, rx, my)
        .stroke({ color: MOUTH_STROKE_COL, width: sw, alpha: 1, cap: "round" });
      return;
    }

    // ── Dark mouth interior ───────────────────────────────────────────────────
    g.moveTo(lx, cornerY)
      .quadraticCurveTo(0, upperCtrlY, rx, cornerY)
      .quadraticCurveTo(0, lowerCtrlY, lx, cornerY)
      .fill({ color: MOUTH_INSIDE, alpha: 1 });

    // ── Teeth: appear gradually as jaw opens past threshold ───────────────────
    if (open > 0.14) {
      const teethH = size * Math.min(0.062, (open - 0.14) * 0.17);
      const teethInset = hw * 0.13;
      g.moveTo(lx + teethInset, cornerY)
        .quadraticCurveTo(
          0,
          upperCtrlY + teethH * 0.85,
          rx - teethInset,
          cornerY,
        )
        .lineTo(rx - teethInset, cornerY + teethH)
        .quadraticCurveTo(
          0,
          upperCtrlY + teethH * 2.4,
          lx + teethInset,
          cornerY + teethH,
        )
        .fill({ color: TEETH_COL, alpha: 1 });
    }

    // ── Mouth outline on top ──────────────────────────────────────────────────
    g.moveTo(lx, cornerY)
      .quadraticCurveTo(0, upperCtrlY, rx, cornerY)
      .quadraticCurveTo(0, lowerCtrlY, lx, cornerY)
      .stroke({
        color: MOUTH_STROKE_COL,
        width: sw,
        alpha: 1,
        join: "round",
        cap: "round",
      });
  }
}
