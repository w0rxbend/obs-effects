import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { lerpHex as lerpColor } from "../../lib/color";
import { clamp, clamp01, lerp, smooth01, TAU } from "../../lib/math";

const BLOB_STEPS = 72;
const SQUIRCLE_POWER = 4.0;

const BODY_COLOR = 0x000000;
const BODY_HIGHLIGHT = 0x1a1a1a;
const EYE_WHITE = 0xffffff;
const EYE_BLACK = 0x000000;
const MOUTH_COLOR = 0xffcc00;
const MOUTH_DARK = 0x1a0808;
const TONGUE_COLOR = 0xe03c5a;

// ─── Types ────────────────────────────────────────────────────────────────────

type Emotion =
  | "neutral"
  | "happy"
  | "laugh"
  | "sad"
  | "surprise"
  | "anger"
  | "thinking"
  | "sleepy"
  | "worried"
  | "wink"
  | "tongue";

interface FaceParams {
  // Mouth — two-bezier-curve system (see drawMouth)
  mHw: number; // half-width fraction of base mw
  mAEndY: number; // A-curve endpoint y  (fraction of mh)
  mACpY: number; // A-curve control-point y
  mBEndY: number; // B-curve endpoint y
  mBCpY: number; // B-curve control-point y
  mFillDark: number; // 0 = orange fill (surprise oval), 1 = dark mouth interior
  // Eyes
  eyeOpen: number; // 0 = closed, 1 = fully open
  pupilScale: number; // iris radius multiplier
  gazeYBias: number; // added to gazeY for this expression
  winkAmount: number; // 0 = both open, 1 = left eye fully closed
  tongueAmount: number; // 0 = hidden, 1 = fully out
}

// ─── Face-state definitions ───────────────────────────────────────────────────

const FACES: Record<Emotion, FaceParams> = {
  // Shallow upward smile, normal eyes
  neutral: {
    mHw: 1.0,
    mAEndY: 0,
    mACpY: 0.55,
    mBEndY: 0.04,
    mBCpY: 0.62,
    mFillDark: 0,
    eyeOpen: 1.0,
    pupilScale: 1.0,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Big open-mouth smile, eyes slightly squinted with happiness
  happy: {
    mHw: 1.12,
    mAEndY: 0,
    mACpY: 0.18,
    mBEndY: 0,
    mBCpY: 1.35,
    mFillDark: 1,
    eyeOpen: 0.78,
    pupilScale: 1.0,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Very wide open mouth, eyes nearly closed (arc-squint laugh)
  laugh: {
    mHw: 1.18,
    mAEndY: 0,
    mACpY: 0.08,
    mBEndY: 0,
    mBCpY: 1.55,
    mFillDark: 1,
    eyeOpen: 0.2,
    pupilScale: 0.8,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Gentle frown, droopy pupils looking down
  sad: {
    mHw: 0.9,
    mAEndY: 0,
    mACpY: -0.74,
    mBEndY: -0.05,
    mBCpY: -0.82,
    mFillDark: 0,
    eyeOpen: 0.88,
    pupilScale: 1.12,
    gazeYBias: 0.1,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Oval / small-circle open mouth, very wide pupils
  surprise: {
    mHw: 0.38,
    mAEndY: 0,
    mACpY: -0.76,
    mBEndY: 0,
    mBCpY: 0.76,
    mFillDark: 0,
    eyeOpen: 1.0,
    pupilScale: 1.42,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Pronounced frown, slightly narrowed eyes
  anger: {
    mHw: 1.0,
    mAEndY: 0,
    mACpY: -0.88,
    mBEndY: -0.04,
    mBCpY: -0.95,
    mFillDark: 0,
    eyeOpen: 0.72,
    pupilScale: 1.0,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Flat line, pupils drift upward (pondering look)
  thinking: {
    mHw: 0.72,
    mAEndY: 0,
    mACpY: 0.02,
    mBEndY: 0,
    mBCpY: 0.04,
    mFillDark: 0,
    eyeOpen: 0.9,
    pupilScale: 0.88,
    gazeYBias: -0.14,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Very droopy eyes, slack half-open mouth
  sleepy: {
    mHw: 0.58,
    mAEndY: 0,
    mACpY: 0.1,
    mBEndY: 0,
    mBCpY: 0.8,
    mFillDark: 1,
    eyeOpen: 0.26,
    pupilScale: 0.82,
    gazeYBias: 0.08,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Open distressed mouth, wide scared eyes
  worried: {
    mHw: 0.62,
    mAEndY: 0,
    mACpY: -0.5,
    mBEndY: 0,
    mBCpY: 0.65,
    mFillDark: 0.7,
    eyeOpen: 1.0,
    pupilScale: 1.32,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 0,
  },
  // Smirk, left eye winked shut
  wink: {
    mHw: 0.88,
    mAEndY: 0,
    mACpY: 0.44,
    mBEndY: 0.04,
    mBCpY: 0.52,
    mFillDark: 0,
    eyeOpen: 1.0,
    pupilScale: 1.0,
    gazeYBias: 0,
    winkAmount: 1.0,
    tongueAmount: 0,
  },
  // Open mouth with tongue out, playful slight squint
  tongue: {
    mHw: 1.0,
    mAEndY: 0,
    mACpY: 0.12,
    mBEndY: 0,
    mBCpY: 1.15,
    mFillDark: 1,
    eyeOpen: 0.82,
    pupilScale: 1.05,
    gazeYBias: 0,
    winkAmount: 0,
    tongueAmount: 1.0,
  },
};

// Weighted pool — emotions that appear more often get extra entries
const EMOTION_POOL: Emotion[] = [
  "happy",
  "happy",
  "laugh",
  "sad",
  "surprise",
  "anger",
  "thinking",
  "sleepy",
  "worried",
  "wink",
  "tongue",
  "tongue",
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function pulse(timeLeft: number, duration: number): number {
  if (timeLeft <= 0 || duration <= 0) return 0;
  const p = clamp01(1 - timeLeft / duration);
  if (p < 0.4) return smooth01(p / 0.4);
  return smooth01(1 - (p - 0.4) / 0.6);
}

function lerpFace(a: FaceParams, b: FaceParams, t: number): FaceParams {
  return {
    mHw: lerp(a.mHw, b.mHw, t),
    mAEndY: lerp(a.mAEndY, b.mAEndY, t),
    mACpY: lerp(a.mACpY, b.mACpY, t),
    mBEndY: lerp(a.mBEndY, b.mBEndY, t),
    mBCpY: lerp(a.mBCpY, b.mBCpY, t),
    mFillDark: lerp(a.mFillDark, b.mFillDark, t),
    eyeOpen: lerp(a.eyeOpen, b.eyeOpen, t),
    pupilScale: lerp(a.pupilScale, b.pupilScale, t),
    gazeYBias: lerp(a.gazeYBias, b.gazeYBias, t),
    winkAmount: lerp(a.winkAmount, b.winkAmount, t),
    tongueAmount: lerp(a.tongueAmount, b.tongueAmount, t),
  };
}

function sqx(angle: number): number {
  const c = Math.cos(angle);
  return Math.sign(c) * Math.pow(Math.abs(c), 2 / SQUIRCLE_POWER);
}

function sqy(angle: number): number {
  const s = Math.sin(angle);
  return Math.sign(s) * Math.pow(Math.abs(s), 2 / SQUIRCLE_POWER);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export class TuxBlobScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly blobGfx = new Graphics();
  private readonly faceGfx = new Graphics();

  private readonly blobPath = new Array<number>(BLOB_STEPS * 2);
  private readonly shadowPath = new Array<number>(BLOB_STEPS * 2);

  private w = 1920;
  private h = 1080;
  private time = 0;

  private blinkTimer = 0;
  private nextBlinkIn = 2.2;
  private gazeX = 0;
  private gazeY = 0;
  private gazeTargetX = 0;
  private gazeTargetY = 0;
  private gazeShiftIn = 1.5;

  private inNeutral = true;
  private emotionTimer = 5.0;
  private currentFace: FaceParams = { ...FACES.neutral };
  private targetFace: FaceParams = { ...FACES.neutral };

  constructor() {
    super();
    this.addChild(this.world);
    this.world.addChild(this.blobGfx);
    this.world.addChild(this.faceGfx);
  }

  private get blobSize(): number {
    return Math.min(this.w, this.h) * 0.26;
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.updateBlink(dt);
    this.updateGaze(dt);
    this.updateEmotion(dt);
    this.draw();
  }

  private updateBlink(dt: number): void {
    this.blinkTimer = Math.max(0, this.blinkTimer - dt);
    this.nextBlinkIn -= dt;
    if (this.nextBlinkIn <= 0) {
      this.blinkTimer = 0.18;
      this.nextBlinkIn = 2.0 + Math.random() * 2.8;
    }
  }

  private updateGaze(dt: number): void {
    this.gazeShiftIn -= dt;
    if (this.gazeShiftIn <= 0) {
      this.gazeTargetX = (Math.random() - 0.5) * 0.32;
      this.gazeTargetY = (Math.random() - 0.55) * 0.16;
      this.gazeShiftIn = 1.0 + Math.random() * 1.8;
    }
    const ease = 1 - Math.exp(-dt * 7);
    this.gazeX += (this.gazeTargetX - this.gazeX) * ease;
    this.gazeY += (this.gazeTargetY - this.gazeY) * ease;
  }

  private updateEmotion(dt: number): void {
    // Snappy mouth / eye lerp — faster than blob deformation
    const ease = 1 - Math.exp(-dt * 10);
    this.currentFace = lerpFace(this.currentFace, this.targetFace, ease);

    this.emotionTimer -= dt;
    if (this.emotionTimer > 0) return;

    if (this.inNeutral) {
      const e = EMOTION_POOL[Math.floor(Math.random() * EMOTION_POOL.length)];
      this.targetFace = { ...FACES[e] };
      this.emotionTimer = 2.0 + Math.random() * 2.4;
      this.inNeutral = false;
    } else {
      this.targetFace = { ...FACES.neutral };
      this.emotionTimer = 4.0 + Math.random() * 3.0;
      this.inNeutral = true;
    }
  }

  private buildBlobPath(
    target: number[],
    size: number,
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
  ): void {
    for (let i = 0; i < BLOB_STEPS; i++) {
      const angle = (i / BLOB_STEPS) * TAU;
      const bx = sqx(angle);
      const by = sqy(angle);

      // Viscous low-frequency deformation via layered overlapping waves
      const wave =
        Math.sin(angle * 2 - this.time * 0.42) * 0.052 +
        Math.cos(angle * 3 + this.time * 0.31) * 0.034 +
        Math.sin(angle * 1 + this.time * 0.55) * 0.048 +
        Math.cos(angle * 4 - this.time * 0.22) * 0.022 +
        Math.sin(angle * 5 + this.time * 0.18) * 0.014;

      const radius = 1 + wave;
      target[i * 2] = bx * size * scaleX * radius + offsetX;
      target[i * 2 + 1] = by * size * scaleY * radius + offsetY;
    }
  }

  private draw(): void {
    const size = this.blobSize;

    const bob =
      Math.sin(this.time * 0.68) * size * 0.038 +
      Math.cos(this.time * 0.39) * size * 0.016;
    const lean = Math.sin(this.time * 0.35) * 0.028;
    const scaleX = 1 + Math.sin(this.time * 0.52) * 0.038;
    const scaleY = 1 + Math.cos(this.time * 0.43) * 0.046;

    this.world.x = this.w * 0.5;
    this.world.y = this.h * 0.52 + bob;
    this.world.rotation = lean;

    this.buildBlobPath(
      this.shadowPath,
      size * 0.98,
      scaleX,
      scaleY,
      size * 0.055,
      size * 0.085,
    );
    this.buildBlobPath(this.blobPath, size, scaleX, scaleY, 0, 0);

    // Centroid for 2.5D parallax
    let cx = 0,
      cy = 0;
    for (let i = 0; i < BLOB_STEPS; i++) {
      cx += this.blobPath[i * 2];
      cy += this.blobPath[i * 2 + 1];
    }
    cx /= BLOB_STEPS;
    cy /= BLOB_STEPS;

    this.drawBlob(size);
    this.drawFace(size, cx * 0.18, cy * 0.18, scaleX);
  }

  private drawBlob(size: number): void {
    const g = this.blobGfx;
    g.clear();

    g.poly(this.shadowPath, true).fill({ color: 0x000000, alpha: 0.15 });
    g.poly(this.blobPath, true).fill({ color: BODY_COLOR, alpha: 1 });

    // Subtle matte sheen
    g.ellipse(-size * 0.2, -size * 0.28, size * 0.38, size * 0.26).fill({
      color: BODY_HIGHLIGHT,
      alpha: 0.06,
    });
  }

  private drawFace(
    size: number,
    parallaxX: number,
    parallaxY: number,
    blobScaleX: number,
  ): void {
    const g = this.faceGfx;
    g.clear();
    this.drawEyes(g, size, parallaxX, parallaxY);
    this.drawMouth(g, size, parallaxX, parallaxY, blobScaleX);
  }

  private drawEyes(g: Graphics, size: number, px: number, py: number): void {
    const f = this.currentFace;
    const eyeR = size * 0.14;
    const eyeSpread = size * 0.2;
    const eyeBaseY = py - size * 0.2;

    const blink = pulse(this.blinkTimer, 0.18);
    // Emotion eyeOpen limits how open the eye can be; blink closes from full
    const blinkFactor = clamp01(1 - blink * 0.98);

    for (const side of [-1, 1]) {
      const ex = px + side * eyeSpread;
      const ey = eyeBaseY;

      // Wink only closes the left eye (side === -1)
      const wink = side === -1 ? f.winkAmount : 0;
      const openness = clamp01(f.eyeOpen * blinkFactor * (1 - wink * 0.96));
      const eyeRY = eyeR * Math.max(0.052, openness);

      if (eyeRY < eyeR * 0.1) {
        // Closed / winked — thin arc
        g.moveTo(ex - eyeR, ey)
          .quadraticCurveTo(ex, ey - eyeR * 0.14, ex + eyeR, ey)
          .stroke({
            color: EYE_WHITE,
            width: Math.max(3, eyeR * 0.24),
            alpha: 1,
            cap: "round",
          });
        continue;
      }

      // White sclera
      g.ellipse(ex, ey, eyeR, eyeRY).fill({ color: EYE_WHITE, alpha: 1 });

      // Black iris — follows gaze, sized by pupilScale, clamped to sclera
      const irisR = Math.min(eyeR * 0.54 * f.pupilScale, eyeRY * 0.88);
      const irisMaxX = (eyeR - irisR) * 0.72;
      const irisMaxY = (eyeRY - irisR) * 0.72;
      const effectiveGazeY = clamp(this.gazeY + f.gazeYBias, -1, 1);
      const irisX = ex + clamp(this.gazeX, -1, 1) * irisMaxX;
      const irisY = ey + effectiveGazeY * irisMaxY;
      g.circle(irisX, irisY, irisR).fill({ color: EYE_BLACK, alpha: 1 });

      // White specular dot (upper-right of iris)
      const specR = Math.max(1.5, irisR * 0.22);
      g.circle(irisX + irisR * 0.36, irisY - irisR * 0.36, specR).fill({
        color: EYE_WHITE,
        alpha: 0.95,
      });
    }
  }

  private drawMouth(
    g: Graphics,
    size: number,
    px: number,
    py: number,
    blobScaleX: number,
  ): void {
    const f = this.currentFace;
    const mouthCY = py + size * 0.32;
    const baseMw = size * 0.22;
    const baseMh = size * 0.13;

    // Blob squeeze interaction
    const squeeze = clamp01(1 - blobScaleX) * 5;
    const mw = baseMw * f.mHw * (1 - squeeze * 0.08);
    const mh = baseMh * (1 + squeeze * 0.12);

    const strokeW = Math.max(2.5, size * 0.022);
    const cpXFrac = 0.4;

    const ax0 = px - mw,
      ax3 = px + mw;
    const aY = mouthCY + f.mAEndY * mh;
    const aCP1y = mouthCY + f.mACpY * mh;
    const aCP2y = mouthCY + f.mACpY * mh;

    const bY = mouthCY + f.mBEndY * mh;
    const bCP1y = mouthCY + f.mBCpY * mh;
    const bCP2y = mouthCY + f.mBCpY * mh;

    const cpX1 = px - mw * cpXFrac;
    const cpX2 = px + mw * cpXFrac;

    const divergence = Math.abs(f.mACpY - f.mBCpY);

    // Fill between the two curves — fades in as they diverge
    const fillAlpha = smooth01((divergence - 0.3) / 0.5);
    if (fillAlpha > 0.01) {
      const fillColor = lerpColor(MOUTH_COLOR, MOUTH_DARK, f.mFillDark);
      g.moveTo(ax0, aY)
        .bezierCurveTo(cpX1, aCP1y, cpX2, aCP2y, ax3, aY)
        .bezierCurveTo(cpX2, bCP2y, cpX1, bCP1y, ax0, bY)
        .fill({ color: fillColor, alpha: fillAlpha });
    }

    // Primary A-curve stroke (always drawn)
    g.moveTo(ax0, aY).bezierCurveTo(cpX1, aCP1y, cpX2, aCP2y, ax3, aY).stroke({
      color: MOUTH_COLOR,
      width: strokeW,
      alpha: 1,
      cap: "round",
      join: "round",
    });

    // B-curve stroke fades in as curves diverge
    const bStrokeAlpha = smooth01((divergence - 0.1) / 0.5);
    if (bStrokeAlpha > 0.01) {
      g.moveTo(ax0, bY)
        .bezierCurveTo(cpX1, bCP1y, cpX2, bCP2y, ax3, bY)
        .stroke({
          color: MOUTH_COLOR,
          width: strokeW,
          alpha: bStrokeAlpha,
          cap: "round",
          join: "round",
        });
    }

    // Tongue — drawn inside the open mouth, below the lower lip
    if (f.tongueAmount > 0.02 && divergence > 0.4) {
      const tongueScale = smooth01((f.tongueAmount - 0.1) / 0.5);
      const lowerLipY = mouthCY + f.mBCpY * mh; // approx apex of lower lip
      const tongueW = mw * 0.52 * tongueScale;
      const tongueH = mh * 0.55 * tongueScale;
      const tongueCY = lowerLipY - tongueH * 0.15;
      g.ellipse(px, tongueCY, tongueW, tongueH).fill({
        color: TONGUE_COLOR,
        alpha: clamp01(tongueScale * 1.1),
      });
    }
  }
}
