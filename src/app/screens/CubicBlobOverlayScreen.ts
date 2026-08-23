import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { clamp, clamp01, lerp, smooth01, TAU } from "../../lib/math";

import {
  blobOverlayController,
  type BlobReactionCommand,
} from "../blobOverlayController";

const PATH_STEPS = 72;
const SQUIRCLE_POWER = 4.2;

const BLOB_GLOW = 0x35d6cb;
const BLOB_BODY = 0x88f2df;
const BLOB_HIGHLIGHT = 0xf5ffea;
const BLOB_SHADOW = 0x2a8f95;
const BLOB_EDGE = 0x123745;
const FACE_COLOR = 0x181c22;
const CHEEK_COLOR = 0xffaba0;
const SPARKLE = 0xffffff;
const EYE_WHITE = 0xffffff;
const PUPIL_COLOR = 0x34292b;
const MOUTH_DARK = 0x34151c;
const MOUTH_RED = 0xf36d57;
const MOUTH_PINK = 0xffa68f;

const SMILE_DURATION = 1.45;
const BLINK_DURATION = 0.2;
const HMM_DURATION = 1.2;
const NOD_DURATION = 0.95;
const NO_NO_DURATION = 1.05;

function heldEnvelope(
  timeLeft: number,
  duration: number,
  attackFraction: number,
  releaseFraction: number,
): number {
  if (timeLeft <= 0 || duration <= 0) {
    return 0;
  }

  const progress = 1 - timeLeft / duration;
  const releaseStart = 1 - releaseFraction;

  if (progress < attackFraction) {
    return smooth01(progress / attackFraction);
  }

  if (progress > releaseStart) {
    return smooth01((1 - progress) / releaseFraction);
  }

  return 1;
}

function pulseEnvelope(timeLeft: number, duration: number): number {
  if (timeLeft <= 0 || duration <= 0) {
    return 0;
  }

  const progress = clamp01(1 - timeLeft / duration);
  if (progress < 0.34) {
    return smooth01(progress / 0.34);
  }

  return smooth01(1 - (progress - 0.34) / 0.66);
}

function squircleComponent(value: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), 2 / SQUIRCLE_POWER);
}

interface EyeConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  openness: number;
  roundness: number;
  upperLid: number;
  lowerLid: number;
  pupilScale: number;
  pupilOffsetX: number;
  pupilOffsetY: number;
}

interface MouthConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  smile: number;
  open: number;
  skew: number;
  tension: number;
}

export class CubicBlobOverlayScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly auraGfx = new Graphics();
  private readonly blobGfx = new Graphics();
  private readonly faceGfx = new Graphics();

  private readonly blobPath = new Array<number>(PATH_STEPS * 2);
  private readonly glowPath = new Array<number>(PATH_STEPS * 2);
  private readonly highlightPath = new Array<number>(PATH_STEPS * 2);
  private readonly shadowPath = new Array<number>(PATH_STEPS * 2);

  private unsubscribeController?: () => void;

  private w = 1920;
  private h = 1080;
  private time = 0;

  private smileTimer = 0;
  private blinkTimer = 0;
  private hmmTimer = 0;
  private nodTimer = 0;
  private noNoTimer = 0;
  private gazeX = 0;
  private gazeY = 0;
  private gazeTargetX = 0;
  private gazeTargetY = 0;
  private gazeShiftIn = 1.2;

  constructor() {
    super();

    this.addChild(this.world);
    this.world.addChild(this.auraGfx);
    this.world.addChild(this.blobGfx);
    this.world.addChild(this.faceGfx);
  }

  private get blobSize(): number {
    return Math.min(this.w, this.h) * 0.165;
  }

  public async show(): Promise<void> {
    if (!this.unsubscribeController) {
      this.unsubscribeController = blobOverlayController.onCommand(
        (command) => {
          this.trigger(command);
        },
      );
    }

    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public async hide(): Promise<void> {
    this.unsubscribeController?.();
    this.unsubscribeController = undefined;
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this.smileTimer = Math.max(0, this.smileTimer - dt);
    this.blinkTimer = Math.max(0, this.blinkTimer - dt);
    this.hmmTimer = Math.max(0, this.hmmTimer - dt);
    this.nodTimer = Math.max(0, this.nodTimer - dt);
    this.noNoTimer = Math.max(0, this.noNoTimer - dt);
    this.updateGaze(dt);

    this.draw();
  }

  public trigger(command: BlobReactionCommand): void {
    switch (command) {
      case "smile":
        this.smile();
        break;
      case "blink":
        this.blink();
        break;
      case "hmm":
        this.hmm();
        break;
      case "nod":
        this.nod();
        break;
      case "no-no":
        this.noNo();
        break;
    }
  }

  public smile(): void {
    this.smileTimer = Math.max(this.smileTimer, SMILE_DURATION);
    this.hmmTimer = Math.min(this.hmmTimer, HMM_DURATION * 0.35);
    this.setGazeTarget((Math.random() - 0.5) * 0.16, -0.03);
  }

  public blink(): void {
    this.blinkTimer = BLINK_DURATION;
  }

  public hmm(): void {
    this.hmmTimer = Math.max(this.hmmTimer, HMM_DURATION);
    this.smileTimer = Math.min(this.smileTimer, SMILE_DURATION * 0.25);
    this.setGazeTarget(Math.random() * 0.18 - 0.09, 0.02);
  }

  public nod(): void {
    this.nodTimer = Math.max(this.nodTimer, NOD_DURATION);
    this.setGazeTarget(0, 0.08);
  }

  public noNo(): void {
    this.noNoTimer = Math.max(this.noNoTimer, NO_NO_DURATION);
    this.setGazeTarget(0, -0.02);
    this.blinkTimer = Math.max(this.blinkTimer, BLINK_DURATION * 0.6);
  }

  private setGazeTarget(x: number, y: number): void {
    this.gazeTargetX = clamp(x, -0.22, 0.22);
    this.gazeTargetY = clamp(y, -0.16, 0.16);
    this.gazeShiftIn = 0.8 + Math.random() * 1.6;
  }

  private updateGaze(dt: number): void {
    this.gazeShiftIn -= dt;

    if (this.gazeShiftIn <= 0) {
      this.setGazeTarget(
        (Math.random() - 0.5) * 0.22,
        (Math.random() - 0.55) * 0.14,
      );
    }

    const easing = 1 - Math.exp(-dt * 10);
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
    smileStrength: number,
    hmmStrength: number,
    nodStrength: number,
    noNoStrength: number,
  ): void {
    for (let index = 0; index < PATH_STEPS; index++) {
      const angle = (index / PATH_STEPS) * TAU;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);

      const squircleX = squircleComponent(cosAngle);
      const squircleY = squircleComponent(sinAngle);

      const sideWeight = 1 - Math.abs(sinAngle);
      const topWeight = Math.max(0, -sinAngle);
      const bottomWeight = Math.max(0, sinAngle);
      const cornerWeight = Math.pow(Math.abs(cosAngle * sinAngle), 0.45) * 1.35;

      const idleWave =
        Math.sin(angle * 2 + this.time * 1.15) * 0.026 +
        Math.cos(angle * 3 - this.time * 0.82) * 0.016 +
        Math.sin(angle * 5 + this.time * 1.6) * 0.01;
      const cheekLift = sideWeight * smileStrength * 0.05;
      const browLift = topWeight * hmmStrength * 0.03;
      const chinBounce = bottomWeight * nodStrength * 0.024;
      const shakeSway = cosAngle * noNoStrength * 0.02;

      const radius =
        1 +
        inflate +
        idleWave +
        cheekLift +
        browLift +
        chinBounce +
        shakeSway +
        cornerWeight * 0.02;

      const pointIndex = index * 2;
      target[pointIndex] = squircleX * size * scaleX * radius + offsetX;
      target[pointIndex + 1] = squircleY * size * scaleY * radius + offsetY;
    }
  }

  private draw(): void {
    const size = this.blobSize;

    const smileStrength =
      0.16 + heldEnvelope(this.smileTimer, SMILE_DURATION, 0.12, 0.34) * 0.84;
    const hmmStrength = heldEnvelope(this.hmmTimer, HMM_DURATION, 0.16, 0.36);
    const blinkStrength = pulseEnvelope(this.blinkTimer, BLINK_DURATION);
    const nodStrength = heldEnvelope(this.nodTimer, NOD_DURATION, 0.08, 0.25);
    const noNoStrength = heldEnvelope(
      this.noNoTimer,
      NO_NO_DURATION,
      0.1,
      0.24,
    );

    const nodProgress =
      this.nodTimer > 0 ? 1 - this.nodTimer / NOD_DURATION : 0;
    const noNoProgress =
      this.noNoTimer > 0 ? 1 - this.noNoTimer / NO_NO_DURATION : 0;

    const baseBob =
      Math.sin(this.time * 1.15) * size * 0.045 +
      Math.cos(this.time * 0.6) * size * 0.018;
    const baseLean = Math.sin(this.time * 0.72) * 0.04;

    const nodWave = Math.sin(nodProgress * Math.PI * 2.1);
    const nodLift = Math.abs(Math.sin(nodProgress * Math.PI * 1.05));
    const noNoWave = Math.sin(noNoProgress * Math.PI * 3.2);

    const xOffset = noNoWave * size * 0.12 * noNoStrength;
    const yOffset =
      baseBob +
      nodLift * size * 0.15 * nodStrength -
      Math.max(0, nodWave) * size * 0.04 * nodStrength;
    const rotation =
      baseLean + nodWave * 0.08 * nodStrength + noNoWave * 0.18 * noNoStrength;

    this.world.x = this.w * 0.5 + xOffset;
    this.world.y = this.h * 0.52 + yOffset;
    this.world.rotation = rotation;

    const scaleX =
      1 +
      noNoStrength * 0.08 +
      Math.sin(this.time * 0.9) * 0.02 -
      nodStrength * 0.035;
    const scaleY =
      1 +
      nodStrength * 0.09 +
      Math.cos(this.time * 1.1) * 0.018 -
      noNoStrength * 0.03;

    this.buildBlobPath(
      this.glowPath,
      size * 1.12,
      scaleX * 1.02,
      scaleY * 1.02,
      0.08,
      0,
      8,
      smileStrength,
      hmmStrength,
      nodStrength,
      noNoStrength,
    );
    this.buildBlobPath(
      this.shadowPath,
      size * 0.99,
      scaleX,
      scaleY,
      0.02,
      size * 0.08,
      size * 0.12,
      smileStrength,
      hmmStrength,
      nodStrength,
      noNoStrength,
    );
    this.buildBlobPath(
      this.blobPath,
      size,
      scaleX,
      scaleY,
      0,
      0,
      0,
      smileStrength,
      hmmStrength,
      nodStrength,
      noNoStrength,
    );
    this.buildBlobPath(
      this.highlightPath,
      size * 0.74,
      scaleX * 0.94,
      scaleY * 0.88,
      -0.02,
      -size * 0.16,
      -size * 0.18,
      smileStrength,
      hmmStrength,
      nodStrength,
      noNoStrength,
    );

    this.drawAura(size, smileStrength);
    this.drawBlob(size);
    this.drawFace(
      size,
      smileStrength,
      hmmStrength,
      blinkStrength,
      nodStrength,
      noNoStrength,
      noNoWave,
    );
  }

  private drawAura(size: number, smileStrength: number): void {
    const g = this.auraGfx;
    g.clear();

    g.poly(this.glowPath, true).fill({
      color: BLOB_GLOW,
      alpha: 0.16 + smileStrength * 0.04,
    });
    g.circle(0, size * 0.15, size * 0.86).fill({
      color: BLOB_GLOW,
      alpha: 0.08,
    });
    g.circle(0, -size * 0.25, size * 0.58).fill({
      color: BLOB_HIGHLIGHT,
      alpha: 0.07,
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
      alpha: 0.98,
    });

    g.poly(this.highlightPath, true).fill({
      color: BLOB_HIGHLIGHT,
      alpha: 0.34,
    });

    g.poly(this.blobPath, true).stroke({
      color: BLOB_EDGE,
      width: Math.max(4, size * 0.03),
      alpha: 0.92,
      join: "round",
    });
  }

  private drawFace(
    size: number,
    smileStrength: number,
    hmmStrength: number,
    blinkStrength: number,
    nodStrength: number,
    noNoStrength: number,
    noNoWave: number,
  ): void {
    const g = this.faceGfx;
    g.clear();

    const faceShiftX = noNoWave * size * 0.02;
    const faceLiftY = nodStrength * size * 0.012;
    const gazeX = this.gazeX + hmmStrength * 0.05;
    const gazeY = this.gazeY + noNoStrength * 0.04 - nodStrength * 0.04;
    const joy = clamp01(smileStrength * 0.8 + nodStrength * 0.24);
    const skepticism = clamp01(hmmStrength);
    const concern = clamp01(noNoStrength * 0.9 + hmmStrength * 0.22);
    const faceScale = 1.48;
    const eyeOpenBase =
      0.94 -
      blinkStrength * 1.18 -
      skepticism * 0.2 +
      noNoStrength * 0.12 -
      joy * 0.06;
    const browY =
      -size * 0.39 - concern * size * 0.03 - joy * size * 0.016 - faceLiftY;
    const eyeY =
      -size * 0.13 - skepticism * size * 0.02 - noNoStrength * size * 0.028;
    const leftEyeX = -size * 0.275 + faceShiftX;
    const rightEyeX = size * 0.275 + faceShiftX;
    const eyeWidth = size * (0.225 + noNoStrength * 0.02) * faceScale;
    const eyeHeight = size * (0.235 + noNoStrength * 0.035) * faceScale;

    this.drawBrow(
      g,
      leftEyeX,
      browY - skepticism * size * 0.008,
      eyeWidth * 0.92,
      size * (0.075 + concern * 0.015),
      -0.08 - concern * 0.22 - skepticism * 0.03,
      0.16 + joy * 0.06,
    );
    this.drawBrow(
      g,
      rightEyeX,
      browY - skepticism * size * 0.026,
      eyeWidth * 0.92,
      size * (0.078 + concern * 0.015),
      0.08 + concern * 0.22 + skepticism * 0.16,
      0.16 + joy * 0.06,
    );

    this.drawEye(g, {
      x: leftEyeX,
      y: eyeY,
      width: eyeWidth,
      height: eyeHeight,
      openness: clamp01(eyeOpenBase - skepticism * 0.06),
      roundness: clamp01(0.68 + noNoStrength * 0.14 + nodStrength * 0.05),
      upperLid: clamp01(0.16 + joy * 0.1 + skepticism * 0.2 + blinkStrength),
      lowerLid: clamp01(0.08 + joy * 0.14 + nodStrength * 0.06),
      pupilScale: clamp01(0.62 + noNoStrength * 0.08 - joy * 0.04),
      pupilOffsetX: gazeX,
      pupilOffsetY: gazeY,
    });
    this.drawEye(g, {
      x: rightEyeX,
      y: eyeY,
      width: eyeWidth,
      height: eyeHeight,
      openness: clamp01(eyeOpenBase + noNoStrength * 0.04),
      roundness: clamp01(0.66 + noNoStrength * 0.18 + nodStrength * 0.04),
      upperLid: clamp01(0.14 + joy * 0.08 + skepticism * 0.14 + blinkStrength),
      lowerLid: clamp01(0.08 + joy * 0.16 + nodStrength * 0.05),
      pupilScale: clamp01(0.62 + noNoStrength * 0.08 - joy * 0.04),
      pupilOffsetX: gazeX,
      pupilOffsetY: gazeY,
    });

    if (joy > 0.18) {
      const cheekRadius = size * (0.088 + joy * 0.018);
      const cheekY = size * 0.18 - faceLiftY;
      const cheekX = size * 0.46;
      g.circle(-cheekX + faceShiftX, cheekY, cheekRadius).fill({
        color: CHEEK_COLOR,
        alpha: 0.1 + joy * 0.08,
      });
      g.circle(cheekX + faceShiftX, cheekY, cheekRadius).fill({
        color: CHEEK_COLOR,
        alpha: 0.1 + joy * 0.08,
      });
    }

    this.drawMouth(g, {
      x: faceShiftX + size * 0.016,
      y: size * (0.36 + nodStrength * 0.022 - noNoStrength * 0.016),
      width: size * (0.76 + joy * 0.18 - skepticism * 0.05),
      height: size * (0.28 + noNoStrength * 0.11 + joy * 0.035),
      smile: clamp(
        smileStrength * 1.02 +
          nodStrength * 0.24 -
          skepticism * 0.84 -
          noNoStrength * 1.18,
        -1,
        1,
      ),
      open: clamp01(
        noNoStrength * 0.82 +
          nodStrength * 0.12 +
          Math.max(0, joy - 0.7) * 0.26,
      ),
      skew: clamp(hmmStrength * 0.28 + smileStrength * 0.03, -0.32, 0.32),
      tension: clamp01(skepticism * 0.62 + noNoStrength * 0.48),
    });
  }

  private drawBrow(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    archHeight: number,
    tilt: number,
    weight: number,
  ): void {
    const leftX = x - width * 0.5;
    const rightX = x + width * 0.5;
    const leftY = y - tilt * archHeight;
    const rightY = y + tilt * archHeight;
    const archY = y - archHeight * (1.06 + weight * 0.24);
    const crestX = x - tilt * width * 0.06;

    g.moveTo(leftX, leftY)
      .bezierCurveTo(
        x - width * 0.24,
        archY,
        x + width * 0.18,
        archY - archHeight * 0.04,
        rightX,
        rightY,
      )
      .stroke({
        color: FACE_COLOR,
        width: Math.max(4, archHeight * (0.55 + weight * 0.08)),
        alpha: 1,
        cap: "round",
        join: "round",
      });

    g.moveTo(leftX + width * 0.08, leftY - archHeight * 0.08)
      .bezierCurveTo(
        crestX - width * 0.18,
        archY - archHeight * 0.12,
        crestX + width * 0.16,
        archY - archHeight * 0.1,
        rightX - width * 0.06,
        rightY - archHeight * 0.04,
      )
      .stroke({
        color: SPARKLE,
        width: Math.max(2, archHeight * 0.14),
        alpha: 0.08,
        cap: "round",
      });
  }

  private drawEye(g: Graphics, eye: EyeConfig): void {
    const openness = clamp01(eye.openness);
    const roundness = clamp01(eye.roundness);
    const halfWidth = eye.width * 0.5;
    const halfHeight =
      eye.height * lerp(0.08, 0.24, openness) * lerp(0.88, 1.16, roundness);

    if (halfHeight <= eye.height * 0.045) {
      const leftX = eye.x - halfWidth;
      const rightX = eye.x + halfWidth;
      const archY = eye.y - eye.height * 0.08;

      g.moveTo(leftX, eye.y)
        .quadraticCurveTo(eye.x, archY, rightX, eye.y)
        .stroke({
          color: FACE_COLOR,
          width: Math.max(5, eye.width * 0.065),
          alpha: 1,
          cap: "round",
          join: "round",
        });
      return;
    }

    const leftX = eye.x - halfWidth;
    const rightX = eye.x + halfWidth;
    const topY = eye.y - halfHeight * (0.96 - eye.upperLid * 0.22);
    const bottomY = eye.y + halfHeight * (0.92 - eye.lowerLid * 0.16);
    const topSpread = halfWidth * lerp(0.72, 0.92, roundness);
    const bottomSpread = halfWidth * lerp(0.68, 0.88, roundness);
    const outlineWidth = Math.max(4, eye.width * 0.046);

    g.moveTo(leftX, eye.y)
      .bezierCurveTo(
        eye.x - topSpread,
        topY,
        eye.x + topSpread,
        topY,
        rightX,
        eye.y,
      )
      .bezierCurveTo(
        eye.x + bottomSpread,
        bottomY,
        eye.x - bottomSpread,
        bottomY,
        leftX,
        eye.y,
      )
      .fill({
        color: EYE_WHITE,
        alpha: 1,
      })
      .stroke({
        color: FACE_COLOR,
        width: outlineWidth,
        alpha: 1,
        join: "round",
        cap: "round",
      });

    g.moveTo(leftX + eye.width * 0.06, eye.y - halfHeight * 0.12)
      .bezierCurveTo(
        eye.x - topSpread * 0.74,
        topY - eye.height * 0.02,
        eye.x + topSpread * 0.66,
        topY - eye.height * 0.008,
        rightX - eye.width * 0.06,
        eye.y - halfHeight * 0.08,
      )
      .stroke({
        color: FACE_COLOR,
        width: outlineWidth * 0.92,
        alpha: 1,
        cap: "round",
        join: "round",
      });

    g.moveTo(leftX + eye.width * 0.12, eye.y + halfHeight * 0.42)
      .quadraticCurveTo(
        eye.x,
        bottomY + eye.height * 0.02,
        rightX - eye.width * 0.12,
        eye.y + halfHeight * 0.42,
      )
      .stroke({
        color: FACE_COLOR,
        width: Math.max(2, outlineWidth * 0.38),
        alpha: 0.2,
        cap: "round",
      });

    const pupilX =
      eye.x + clamp(eye.pupilOffsetX, -0.24, 0.24) * eye.width * 0.42;
    const pupilY =
      eye.y +
      clamp(eye.pupilOffsetY, -0.18, 0.2) * eye.height * 0.36 +
      halfHeight * 0.08;
    const pupilRadius =
      Math.min(halfWidth, halfHeight) * lerp(0.42, 0.62, eye.pupilScale);

    g.circle(pupilX, pupilY, pupilRadius).fill({
      color: PUPIL_COLOR,
      alpha: 1,
    });
    g.circle(
      pupilX - pupilRadius * 0.3,
      pupilY - pupilRadius * 0.34,
      Math.max(2, pupilRadius * 0.22),
    ).fill({
      color: SPARKLE,
      alpha: 0.94,
    });
  }

  private drawMouth(g: Graphics, mouth: MouthConfig): void {
    const smile = clamp(mouth.smile, -1, 1);
    const open = clamp01(mouth.open);
    const skew = clamp(mouth.skew, -0.4, 0.4);
    const tension = clamp01(mouth.tension);
    const leftX = mouth.x - mouth.width * 0.5;
    const rightX = mouth.x + mouth.width * 0.5;
    const leftY =
      mouth.y - smile * mouth.height * 0.32 + skew * mouth.height * 0.12;
    const rightY =
      mouth.y - smile * mouth.height * 0.32 - skew * mouth.height * 0.12;
    const midX = mouth.x + skew * mouth.width * 0.18;
    const midY =
      mouth.y + smile * mouth.height * 0.42 - tension * mouth.height * 0.04;
    const strokeWidth = Math.max(5, mouth.height * 0.2);

    if (open < 0.18) {
      g.moveTo(leftX, leftY)
        .quadraticCurveTo(midX, midY, rightX, rightY)
        .stroke({
          color: FACE_COLOR,
          width: strokeWidth,
          alpha: 1,
          cap: "round",
          join: "round",
        });

      g.moveTo(leftX + mouth.width * 0.12, leftY + mouth.height * 0.18)
        .quadraticCurveTo(
          midX,
          midY + mouth.height * (0.2 + Math.max(0, smile) * 0.14),
          rightX - mouth.width * 0.12,
          rightY + mouth.height * 0.18,
        )
        .stroke({
          color: FACE_COLOR,
          width: Math.max(3, strokeWidth * 0.42),
          alpha: 0.78,
          cap: "round",
          join: "round",
        });
      return;
    }

    const upperMidY =
      mouth.y -
      open * mouth.height * 0.38 -
      Math.max(0, smile) * mouth.height * 0.04;
    const lowerMidY =
      mouth.y +
      open * mouth.height * 0.92 +
      Math.max(0, smile) * mouth.height * 0.14;

    g.moveTo(leftX, leftY)
      .bezierCurveTo(
        mouth.x - mouth.width * 0.24,
        upperMidY,
        mouth.x + mouth.width * 0.24,
        upperMidY,
        rightX,
        rightY,
      )
      .bezierCurveTo(
        mouth.x + mouth.width * (0.44 + tension * 0.08),
        mouth.y + open * mouth.height * 0.54,
        mouth.x + mouth.width * 0.18,
        lowerMidY,
        midX,
        lowerMidY,
      )
      .bezierCurveTo(
        mouth.x - mouth.width * 0.18,
        lowerMidY,
        mouth.x - mouth.width * (0.44 + tension * 0.08),
        mouth.y + open * mouth.height * 0.54,
        leftX,
        leftY,
      )
      .fill({
        color: MOUTH_DARK,
        alpha: 1,
      })
      .stroke({
        color: FACE_COLOR,
        width: strokeWidth,
        alpha: 1,
        cap: "round",
        join: "round",
      });

    g.moveTo(mouth.x - mouth.width * 0.22, mouth.y + open * mouth.height * 0.28)
      .bezierCurveTo(
        mouth.x - mouth.width * 0.12,
        mouth.y + open * mouth.height * 0.68,
        mouth.x + mouth.width * 0.12,
        mouth.y + open * mouth.height * 0.72,
        mouth.x + mouth.width * 0.22,
        mouth.y + open * mouth.height * 0.28,
      )
      .bezierCurveTo(
        mouth.x + mouth.width * 0.08,
        mouth.y + open * mouth.height * 0.1,
        mouth.x - mouth.width * 0.08,
        mouth.y + open * mouth.height * 0.1,
        mouth.x - mouth.width * 0.22,
        mouth.y + open * mouth.height * 0.28,
      )
      .fill({
        color: open > 0.46 ? MOUTH_RED : MOUTH_PINK,
        alpha: 0.96,
      });
  }
}
