import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { clamp, clamp01, lerp, smooth01, TAU } from "../../lib/math";

const BLOB_STEPS = 84;
const SQUIRCLE_POWER = 4.6;

const BLOB_AURA = 0x73f7ee;
const BLOB_BODY = 0x7ce8d8;
const BLOB_HIGHLIGHT = 0xf4fff8;
const BLOB_SHADOW = 0x2f9ba1;
const BLOB_EDGE = 0x16343d;
const FACE_COLOR = 0x17181c;
const EYE_WHITE = 0xffffff;
const EYE_WASH = 0xd8f9ff;
const PUPIL = 0x2d2c31;
const TONGUE = 0xc92d62;
const MOUTH_FILL = 0x25161b;
const SPARK = 0xffffff;

function pulse(timeLeft: number, duration: number): number {
  if (timeLeft <= 0 || duration <= 0) {
    return 0;
  }

  const progress = clamp01(1 - timeLeft / duration);
  if (progress < 0.45) {
    return smooth01(progress / 0.45);
  }

  return smooth01(1 - (progress - 0.45) / 0.55);
}

function squircleComponent(value: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), 2 / SQUIRCLE_POWER);
}

interface EyeConfig {
  x: number;
  y: number;
  radius: number;
  openness: number;
  pupilOffsetX: number;
  pupilOffsetY: number;
  pupilBiasX: number;
  pupilBiasY: number;
  pupilScale: number;
  glossOffsetX: number;
  glossOffsetY: number;
}

interface BrowConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  tilt: number;
  arch: number;
}

interface MouthPose {
  x: number;
  y: number;
  width: number;
  height: number;
  open: number;
  smile: number;
  round: number;
  tilt: number;
  droop: number;
  tongueBias: number;
}

export class CubicBlobFaceOverlayScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly auraGfx = new Graphics();
  private readonly blobGfx = new Graphics();
  private readonly faceGfx = new Graphics();

  private readonly blobPath = new Array<number>(BLOB_STEPS * 2);
  private readonly shadowPath = new Array<number>(BLOB_STEPS * 2);
  private readonly highlightPath = new Array<number>(BLOB_STEPS * 2);

  private w = 1920;
  private h = 1080;
  private time = 0;

  private blinkTimer = 0;
  private nextBlinkIn = 1.6;
  private gazeX = 0;
  private gazeY = 0;
  private gazeTargetX = 0.02;
  private gazeTargetY = 0;
  private gazeShiftIn = 1.15;
  private gazeDirection: -1 | 1 = 1;

  constructor() {
    super();

    this.addChild(this.world);
    this.world.addChild(this.auraGfx);
    this.world.addChild(this.blobGfx);
    this.world.addChild(this.faceGfx);
  }

  private get blobSize(): number {
    return Math.min(this.w, this.h) * 0.19;
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
    this.draw();
  }

  private updateBlink(dt: number): void {
    this.blinkTimer = Math.max(0, this.blinkTimer - dt);
    this.nextBlinkIn -= dt;

    if (this.nextBlinkIn > 0) {
      return;
    }

    this.blinkTimer = 0.2;
    this.nextBlinkIn = 1.8 + Math.random() * 2.4;
  }

  private updateGaze(dt: number): void {
    this.gazeShiftIn -= dt;

    if (this.gazeShiftIn <= 0) {
      this.gazeDirection = this.gazeDirection === 1 ? -1 : 1;
      this.gazeTargetX = this.gazeDirection * 0.14;
      this.gazeTargetY = Math.sin(this.time * 1.3) * 0.015;
      this.gazeShiftIn = 1.1 + Math.random() * 0.55;
    }

    const easing = 1 - Math.exp(-dt * 5.2);
    this.gazeX += (this.gazeTargetX - this.gazeX) * easing;
    this.gazeY += (this.gazeTargetY - this.gazeY) * easing;
  }

  private buildBlobPath(
    target: number[],
    size: number,
    scaleX: number,
    scaleY: number,
    inflate: number,
    offsetX: number,
    offsetY: number,
  ): void {
    for (let index = 0; index < BLOB_STEPS; index++) {
      const angle = (index / BLOB_STEPS) * TAU;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      const pointIndex = index * 2;

      const baseX = squircleComponent(cosAngle);
      const baseY = squircleComponent(sinAngle);
      const topWeight = Math.max(0, -sinAngle);
      const bottomWeight = Math.max(0, sinAngle);
      const sideWeight = 1 - Math.abs(sinAngle);
      const cornerWeight = Math.pow(Math.abs(cosAngle * sinAngle), 0.58);

      const primaryWave =
        Math.sin(angle * 2 - this.time * 1.02) * 0.038 +
        Math.cos(angle * 3 + this.time * 0.74) * 0.018;
      const cheekWave =
        sideWeight * Math.sin(this.time * 1.8 + angle * 1.4) * 0.026;
      const crownLift = topWeight * Math.cos(this.time * 1.2 - angle) * 0.03;
      const chinBounce =
        bottomWeight * Math.sin(this.time * 1.45 + angle * 0.6) * 0.024;
      const cornerInflate = cornerWeight * (0.028 + Math.sin(this.time) * 0.01);

      const radius =
        1 +
        inflate +
        primaryWave +
        cheekWave +
        crownLift +
        chinBounce +
        cornerInflate;

      target[pointIndex] = baseX * size * scaleX * radius + offsetX;
      target[pointIndex + 1] = baseY * size * scaleY * radius + offsetY;
    }
  }

  private draw(): void {
    const size = this.blobSize;
    const bob =
      Math.sin(this.time * 1.2) * size * 0.045 +
      Math.cos(this.time * 0.65) * size * 0.018;
    const lean = Math.sin(this.time * 0.52) * 0.038;
    const scaleX = 1 + Math.sin(this.time * 0.84) * 0.035;
    const scaleY = 1 + Math.cos(this.time * 0.94) * 0.045;

    this.world.x = this.w * 0.5;
    this.world.y = this.h * 0.55 + bob;
    this.world.rotation = lean;

    this.buildBlobPath(
      this.shadowPath,
      size * 0.985,
      scaleX,
      scaleY,
      0.01,
      size * 0.08,
      size * 0.11,
    );
    this.buildBlobPath(this.blobPath, size, scaleX, scaleY, 0, 0, 0);
    this.buildBlobPath(
      this.highlightPath,
      size * 0.76,
      scaleX * 0.9,
      scaleY * 0.82,
      -0.035,
      -size * 0.16,
      -size * 0.22,
    );

    this.drawAura(size);
    this.drawBlob(size);
    this.drawFace(size);
  }

  private drawAura(size: number): void {
    const g = this.auraGfx;
    g.clear();

    g.circle(0, size * 0.16, size * 0.96).fill({
      color: BLOB_AURA,
      alpha: 0.085,
    });
    g.circle(-size * 0.16, -size * 0.2, size * 0.52).fill({
      color: BLOB_HIGHLIGHT,
      alpha: 0.08,
    });
  }

  private drawBlob(size: number): void {
    const g = this.blobGfx;
    g.clear();

    g.poly(this.shadowPath, true).fill({
      color: BLOB_SHADOW,
      alpha: 0.24,
    });
    g.poly(this.blobPath, true).fill({
      color: BLOB_BODY,
      alpha: 0.97,
    });
    g.poly(this.highlightPath, true).fill({
      color: BLOB_HIGHLIGHT,
      alpha: 0.34,
    });
    g.poly(this.blobPath, true).stroke({
      color: BLOB_EDGE,
      width: Math.max(4, size * 0.028),
      alpha: 0.95,
      join: "round",
    });
  }

  private drawFace(size: number): void {
    const g = this.faceGfx;
    g.clear();

    const blink = pulse(this.blinkTimer, 0.2);
    const eyeOpenness = 1 - blink * 0.96;
    const browBounce = Math.sin(this.time * 1.2) * 0.5 + 0.5;
    const mouthOpen = clamp01(0.22 + Math.sin(this.time * 1.15 - 0.4) * 0.05);
    const mouthSmile = clamp(
      -0.74 + Math.sin(this.time * 1.05 + 0.8) * 0.05,
      -0.84,
      -0.6,
    );
    const mouthRound = clamp01(0.62 + Math.cos(this.time * 1.08 + 0.4) * 0.06);
    const mouthTilt = Math.sin(this.time * 0.55) * 0.035;
    const mouthDroop = clamp01(0.86 + Math.sin(this.time * 0.84 - 0.7) * 0.04);
    const tongueBias = Math.sin(this.time * 1.08 + 1.4) * 0.03;
    const faceShiftX = Math.sin(this.time * 0.42) * size * 0.008;
    const eyeY = -size * 0.12;
    const eyeRadius = size * 0.245;
    const eyeSpread = size * 0.265;
    const gazeX = this.gazeX;
    const gazeY = this.gazeY;

    this.drawBrow(g, {
      x: -eyeSpread + faceShiftX,
      y: -size * 0.7 - browBounce * size * 0.02,
      width: size * 0.28,
      height: size * 0.16,
      tilt: -0.92 - Math.sin(this.time * 1.05) * 0.04,
      arch: 1.08 + browBounce * 0.14,
    });
    this.drawBrow(g, {
      x: eyeSpread + faceShiftX,
      y: -size * 0.7 - browBounce * size * 0.018,
      width: size * 0.28,
      height: size * 0.16,
      tilt: 0.92 + Math.cos(this.time * 1.02) * 0.04,
      arch: 1.08 + browBounce * 0.12,
    });

    this.drawEye(g, {
      x: -eyeSpread + faceShiftX,
      y: eyeY,
      radius: eyeRadius,
      openness: eyeOpenness,
      pupilOffsetX: gazeX + 0.02,
      pupilOffsetY: gazeY - 0.01,
      pupilBiasX: 0.22,
      pupilBiasY: -0.02,
      pupilScale: 0.34,
      glossOffsetX: 0.5,
      glossOffsetY: -0.06,
    });
    this.drawEye(g, {
      x: eyeSpread + faceShiftX,
      y: eyeY,
      radius: eyeRadius,
      openness: eyeOpenness,
      pupilOffsetX: gazeX - 0.02,
      pupilOffsetY: gazeY - 0.005,
      pupilBiasX: -0.22,
      pupilBiasY: -0.04,
      pupilScale: 0.34,
      glossOffsetX: -0.5,
      glossOffsetY: -0.06,
    });

    this.drawMouth(g, {
      x: faceShiftX,
      y: size * 0.48,
      width: size * 0.62,
      height: size * 0.32,
      open: mouthOpen,
      smile: mouthSmile,
      round: mouthRound,
      tilt: mouthTilt,
      droop: mouthDroop,
      tongueBias,
    });
  }

  private drawBrow(g: Graphics, brow: BrowConfig): void {
    const direction = brow.tilt < 0 ? 1 : -1;
    const innerTopX = brow.x + direction * brow.width * 0.18;
    const innerTopY = brow.y - brow.height * brow.arch;
    const outerTipX = brow.x - direction * brow.width * 0.56;
    const outerTipY = brow.y + brow.height * 0.16;
    const lowerOuterX = brow.x - direction * brow.width * 0.4;
    const lowerOuterY = brow.y + brow.height * 0.28;
    const innerBaseX = brow.x + direction * brow.width * 0.08;
    const innerBaseY = brow.y - brow.height * 0.08;

    g.moveTo(innerTopX, innerTopY)
      .quadraticCurveTo(
        brow.x - direction * brow.width * 0.02,
        brow.y - brow.height * 0.12,
        outerTipX,
        outerTipY,
      )
      .quadraticCurveTo(
        brow.x - direction * brow.width * 0.18,
        brow.y + brow.height * 0.32,
        lowerOuterX,
        lowerOuterY,
      )
      .quadraticCurveTo(
        brow.x + direction * brow.width * 0.02,
        brow.y + brow.height * 0.12,
        innerBaseX,
        innerBaseY,
      )
      .quadraticCurveTo(
        brow.x + direction * brow.width * 0.12,
        brow.y - brow.height * 0.48,
        innerTopX,
        innerTopY,
      )
      .fill({
        color: FACE_COLOR,
        alpha: 1,
      });
  }

  private drawEye(g: Graphics, eye: EyeConfig): void {
    const openness = clamp01(eye.openness);
    const radiusY = eye.radius * lerp(0.1, 1, openness);

    if (radiusY < eye.radius * 0.16) {
      g.moveTo(eye.x - eye.radius, eye.y)
        .quadraticCurveTo(
          eye.x,
          eye.y - eye.radius * 0.1,
          eye.x + eye.radius,
          eye.y,
        )
        .stroke({
          color: FACE_COLOR,
          width: Math.max(6, eye.radius * 0.16),
          alpha: 1,
          cap: "round",
          join: "round",
        });
      return;
    }

    g.ellipse(eye.x, eye.y, eye.radius * 0.98, radiusY * 0.98).fill({
      color: EYE_WHITE,
      alpha: 1,
    });
    g.ellipse(eye.x, eye.y, eye.radius, radiusY).stroke({
      color: FACE_COLOR,
      width: Math.max(6, eye.radius * 0.11),
      alpha: 1,
      cap: "round",
      join: "round",
    });

    g.moveTo(eye.x - eye.radius * 0.58, eye.y + radiusY * 0.42)
      .quadraticCurveTo(
        eye.x,
        eye.y + radiusY * 0.88,
        eye.x + eye.radius * 0.58,
        eye.y + radiusY * 0.42,
      )
      .stroke({
        color: EYE_WASH,
        width: Math.max(3, eye.radius * 0.09),
        alpha: 0.95,
        cap: "round",
        join: "round",
      });

    const pupilX =
      eye.x +
      clamp(eye.pupilBiasX + eye.pupilOffsetX, -0.56, 0.56) * eye.radius * 0.76;
    const pupilY =
      eye.y +
      clamp(eye.pupilBiasY + eye.pupilOffsetY, -0.56, 0.56) * radiusY * 0.78;
    const pupilRadius = Math.min(eye.radius, radiusY) * eye.pupilScale;

    g.circle(pupilX, pupilY, pupilRadius).fill({
      color: PUPIL,
      alpha: 1,
    });
    g.circle(
      pupilX + pupilRadius * eye.glossOffsetX,
      pupilY + pupilRadius * eye.glossOffsetY,
      Math.max(3, pupilRadius * 0.24),
    ).fill({
      color: SPARK,
      alpha: 0.96,
    });
  }

  private drawMouth(g: Graphics, mouth: MouthPose): void {
    const open = clamp01(mouth.open);
    const smile = clamp(mouth.smile, -1, 1);
    const round = clamp01(mouth.round);
    const tilt = clamp(mouth.tilt, -0.2, 0.2);
    const droop = clamp01(mouth.droop);
    const leftX = mouth.x - mouth.width * 0.5;
    const rightX = mouth.x + mouth.width * 0.5;
    const topLeftX = mouth.x - mouth.width * 0.3;
    const topRightX = mouth.x + mouth.width * 0.3;
    const topLeftY = mouth.y - mouth.height * (0.34 + round * 0.04);
    const topCenterY =
      mouth.y -
      mouth.height * (0.16 + open * 0.08) +
      Math.max(0, tilt) * mouth.height * 0.08;
    const topRightY = mouth.y - mouth.height * (0.34 + round * 0.04);
    const lowerCenterY = mouth.y + mouth.height * (0.32 + droop * 0.08);
    const lowerLeftY = mouth.y + mouth.height * (0.48 + droop * 0.06);
    const lowerRightY = mouth.y + mouth.height * (0.48 + droop * 0.06);
    const strokeWidth = Math.max(5, mouth.height * 0.14);

    g.moveTo(leftX, mouth.y + mouth.height * 0.12)
      .bezierCurveTo(
        mouth.x - mouth.width * 0.48,
        mouth.y - mouth.height * (0.18 + Math.abs(smile) * 0.06),
        mouth.x - mouth.width * 0.4,
        topLeftY,
        topLeftX,
        topLeftY,
      )
      .bezierCurveTo(
        mouth.x - mouth.width * 0.14,
        mouth.y - mouth.height * (0.04 + open * 0.04),
        mouth.x + mouth.width * 0.14,
        topCenterY,
        topRightX,
        topRightY,
      )
      .bezierCurveTo(
        mouth.x + mouth.width * 0.4,
        topRightY,
        mouth.x + mouth.width * 0.48,
        mouth.y - mouth.height * (0.18 + Math.abs(smile) * 0.06),
        rightX,
        mouth.y + mouth.height * 0.12,
      )
      .bezierCurveTo(
        mouth.x + mouth.width * 0.46,
        mouth.y + mouth.height * 0.46,
        mouth.x + mouth.width * 0.22,
        lowerRightY,
        mouth.x,
        lowerCenterY,
      )
      .bezierCurveTo(
        mouth.x - mouth.width * 0.22,
        lowerLeftY,
        mouth.x - mouth.width * 0.46,
        mouth.y + mouth.height * 0.46,
        leftX,
        mouth.y + mouth.height * 0.12,
      )
      .fill({
        color: MOUTH_FILL,
        alpha: 1,
      })
      .stroke({
        color: FACE_COLOR,
        width: strokeWidth,
        alpha: 1,
        cap: "round",
        join: "round",
      });

    g.moveTo(mouth.x - mouth.width * 0.24, mouth.y + mouth.height * 0.16)
      .bezierCurveTo(
        mouth.x - mouth.width * (0.14 - mouth.tongueBias),
        mouth.y + mouth.height * (0.28 + open * 0.08),
        mouth.x - mouth.width * 0.02,
        mouth.y + mouth.height * (0.46 + droop * 0.04),
        mouth.x + mouth.width * 0.22,
        mouth.y + mouth.height * 0.18,
      )
      .bezierCurveTo(
        mouth.x + mouth.width * 0.1,
        mouth.y + mouth.height * 0.06,
        mouth.x - mouth.width * 0.12,
        mouth.y + mouth.height * 0.06,
        mouth.x - mouth.width * 0.24,
        mouth.y + mouth.height * 0.16,
      )
      .fill({
        color: TONGUE,
        alpha: 0.97,
      });
  }
}
