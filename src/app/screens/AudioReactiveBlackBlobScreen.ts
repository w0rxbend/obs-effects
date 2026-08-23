import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib";
import { clamp01, lerp, smoothstep, TAU } from "../../lib/math";

const BODY_POINTS = 128;
const BODY_COLOR = 0x010101;
const BODY_EDGE = 0x181818;
const BODY_HIGHLIGHT = 0x0a0a0a;
const WHITE = 0xffffff;
const SOFT_WHITE = 0xd8d8d8;
const BLACK = 0x000000;

interface AudioState {
  level: number;
  bass: number;
  mid: number;
  high: number;
  vocal: number;
  fast: number;
  slow: number;
  long: number;
  attack: number;
  volatility: number;
  rhythm: number;
  arousal: number;
}

interface Expression {
  calm: number;
  talk: number;
  happy: number;
  surprise: number;
  worry: number;
  angry: number;
}

interface FacePose {
  eyeOpen: number;
  eyeWidth: number;
  eyeTilt: number;
  eyeSmile: number;
  pupilScale: number;
  pupilY: number;
  mouthOpen: number;
  mouthCurve: number;
  mouthWidth: number;
  browInner: number;
  browOuter: number;
}

function approach(
  current: number,
  target: number,
  dt: number,
  speed: number,
): number {
  return current + (target - current) * (1 - Math.exp(-dt * speed));
}

function squircle(angle: number): [number, number] {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return [
    Math.sign(x) * Math.pow(Math.abs(x), 0.58),
    Math.sign(y) * Math.pow(Math.abs(y), 0.58),
  ];
}

export class AudioReactiveBlackBlobScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly background = new Graphics();
  private readonly world = new Container();
  private readonly body = new Graphics();
  private readonly face = new Graphics();
  private readonly bodyPath = new Array<number>(BODY_POINTS * 2);
  private readonly shadowPath = new Array<number>(BODY_POINTS * 2);

  private w = 1920;
  private h = 1080;
  private time = 0;

  private previousLevel = 0;
  private fast = 0;
  private slow = 0;
  private long = 0;
  private attack = 0;
  private volatility = 0;
  private rhythmMemory = 0;
  private rhythm = 0;

  private calm = 1;
  private talk = 0;
  private happy = 0;
  private surprise = 0;
  private worry = 0;
  private angry = 0;

  private blink = 0;
  private nextBlink = 2.4;
  private gazeX = 0;
  private gazeY = 0;
  private gazeTargetX = 0;
  private gazeTargetY = 0;
  private nextGaze = 1.2;

  constructor() {
    super();
    this.addChild(this.background);
    this.addChild(this.world);
    this.world.addChild(this.body);
    this.world.addChild(this.face);
    void obsAudio.connect();
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    obsAudio.update(dt);

    const audio = this.updateAudio(dt);
    const expression = this.updateExpression(audio, dt);
    this.updateGazeAndBlink(audio, expression, dt);
    this.draw(audio, expression);
  }

  private get size(): number {
    return Math.min(this.w, this.h) * 0.44;
  }

  private updateAudio(dt: number): AudioState {
    const level = smoothstep(0.03, 0.72, clamp01(obsAudio.level));
    const bass = smoothstep(0.025, 0.68, clamp01(obsAudio.bass));
    const mid = smoothstep(0.025, 0.66, clamp01(obsAudio.mid));
    const high = smoothstep(0.02, 0.62, clamp01(obsAudio.high));
    const vocal = smoothstep(0.025, 0.66, clamp01(obsAudio.vocal));
    const delta = level - this.previousLevel;
    this.previousLevel = level;

    this.fast = approach(this.fast, level, dt, 16);
    this.slow = approach(this.slow, level, dt, 3.5);
    this.long = approach(this.long, level, dt, 0.9);

    const attackTarget = clamp01(
      Math.max(0, delta) * 8 +
        high * 0.24 +
        (obsAudio.beat && level > 0.15 ? 0.34 : 0),
    );
    this.attack = approach(
      this.attack,
      attackTarget,
      dt,
      attackTarget > this.attack ? 18 : 5,
    );

    const volatilityTarget = clamp01(
      Math.abs(this.fast - this.slow) * 3.1 + Math.abs(delta) * 3.8,
    );
    this.volatility = approach(this.volatility, volatilityTarget, dt, 4.5);

    if (level > 0.2 && (obsAudio.beat || attackTarget > 0.45)) {
      this.rhythmMemory = Math.min(1, this.rhythmMemory + 0.28);
    }
    this.rhythmMemory *= Math.exp(-dt * 1.45);
    this.rhythm = approach(this.rhythm, this.rhythmMemory, dt, 4);

    const arousal = clamp01(
      this.fast * 0.26 +
        this.slow * 0.28 +
        bass * 0.18 +
        high * 0.16 +
        this.attack * 0.2 +
        this.volatility * 0.18 +
        this.rhythm * 0.12,
    );

    return {
      level,
      bass,
      mid,
      high,
      vocal,
      fast: this.fast,
      slow: this.slow,
      long: this.long,
      attack: this.attack,
      volatility: this.volatility,
      rhythm: this.rhythm,
      arousal,
    };
  }

  private updateExpression(audio: AudioState, dt: number): Expression {
    const surpriseTarget =
      smoothstep(0.3, 0.86, audio.attack + audio.high * 0.32) *
      smoothstep(0.16, 0.45, audio.level);
    const angryTarget =
      smoothstep(
        0.42,
        0.9,
        audio.bass * 0.52 +
          audio.slow * 0.42 +
          audio.long * 0.24 +
          audio.volatility * 0.14,
      ) *
      (1 - surpriseTarget * 0.7) *
      (1 - audio.high * 0.35);
    const worryTarget =
      smoothstep(
        0.18,
        0.7,
        audio.volatility * 0.64 + audio.attack * 0.22 + audio.high * 0.22,
      ) *
      smoothstep(0.08, 0.35, audio.level) *
      (1 - angryTarget * 0.45);
    const happyTarget =
      smoothstep(
        0.18,
        0.78,
        audio.rhythm * 0.52 + audio.vocal * 0.28 + audio.mid * 0.18,
      ) *
      (1 - audio.volatility * 0.55) *
      (1 - angryTarget * 0.8);
    const talkTarget =
      smoothstep(0.08, 0.52, audio.vocal * 0.74 + audio.fast * 0.28) *
      (1 - surpriseTarget * 0.6);
    const calmTarget = clamp01(
      1 -
        talkTarget * 0.35 -
        happyTarget * 0.55 -
        surpriseTarget * 0.9 -
        worryTarget * 0.62 -
        angryTarget * 0.78,
    );

    this.calm = approach(this.calm, calmTarget, dt, 3);
    this.talk = approach(this.talk, talkTarget, dt, 5.5);
    this.happy = approach(this.happy, happyTarget, dt, 3.8);
    this.surprise = approach(
      this.surprise,
      surpriseTarget,
      dt,
      surpriseTarget > this.surprise ? 13 : 4,
    );
    this.worry = approach(this.worry, worryTarget, dt, 4.5);
    this.angry = approach(this.angry, angryTarget, dt, 3.4);

    return {
      calm: this.calm,
      talk: this.talk,
      happy: this.happy,
      surprise: this.surprise,
      worry: this.worry,
      angry: this.angry,
    };
  }

  private updateGazeAndBlink(
    audio: AudioState,
    expression: Expression,
    dt: number,
  ): void {
    this.blink = Math.max(0, this.blink - dt);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && expression.surprise < 0.3) {
      this.blink = 0.15;
      this.nextBlink =
        lerp(3.2, 1.1, expression.worry + audio.volatility * 0.4) +
        Math.random() * 1.5;
    }

    this.nextGaze -= dt;
    if (this.nextGaze <= 0 || audio.attack > 0.55) {
      const range =
        0.06 +
        expression.talk * 0.05 +
        expression.worry * 0.18 +
        expression.surprise * 0.14;
      this.gazeTargetX = (Math.random() - 0.5) * range;
      this.gazeTargetY = (Math.random() - 0.56) * range * 0.6;
      this.nextGaze = lerp(1.5, 0.24, audio.attack + expression.worry);
    }

    const speed = 5 + expression.worry * 7 + audio.attack * 14;
    this.gazeX = approach(this.gazeX, this.gazeTargetX, dt, speed);
    this.gazeY = approach(this.gazeY, this.gazeTargetY, dt, speed);
  }

  private draw(audio: AudioState, expression: Expression): void {
    this.drawBackground(audio);

    const size = this.size;
    const shake =
      size *
      (audio.attack * 0.018 +
        expression.worry * 0.006 +
        expression.angry * 0.008);
    const breathe =
      Math.sin(this.time * 0.62) * size * 0.018 + audio.bass * size * 0.018;
    this.world.x = this.w * 0.5 + Math.sin(this.time * 28) * shake;
    this.world.y =
      this.h * 0.54 + breathe + Math.cos(this.time * 23) * shake * 0.55;
    this.world.rotation =
      Math.sin(this.time * 0.42) * 0.01 +
      Math.sin(this.time * 5.5) * expression.worry * 0.01 -
      expression.angry * 0.02;

    this.buildBodyPath(
      this.shadowPath,
      size * 1.012,
      1.08,
      1.08,
      size * 0.035,
      size * 0.055,
      audio,
      expression,
    );
    this.buildBodyPath(
      this.bodyPath,
      size,
      1.08,
      1.08,
      0,
      0,
      audio,
      expression,
    );
    this.drawBody(audio, expression);
    this.drawFace(size, audio, expression);
  }

  private drawBackground(audio: AudioState): void {
    this.background.clear();
    this.background.rect(0, 0, this.w, this.h).fill({ color: BLACK, alpha: 1 });
    this.background
      .ellipse(this.w * 0.5, this.h * 0.56, this.size * 1.94, this.size * 0.9)
      .fill({
        color: 0x090909,
        alpha: 0.08 + audio.bass * 0.06 + audio.arousal * 0.08,
      });
    this.background
      .ellipse(this.w * 0.5, this.h * 0.55, this.size * 1.5, this.size * 0.68)
      .fill({
        color: BODY_HIGHLIGHT,
        alpha: 0.12 + audio.arousal * 0.18,
      });
  }

  private buildBodyPath(
    target: number[],
    size: number,
    scaleX: number,
    scaleY: number,
    ox: number,
    oy: number,
    audio: AudioState,
    expression: Expression,
  ): void {
    const wobble =
      0.014 +
      audio.slow * 0.022 +
      audio.bass * 0.018 +
      expression.worry * 0.014 +
      expression.angry * 0.018;
    for (let i = 0; i < BODY_POINTS; i++) {
      const a = (i / BODY_POINTS) * TAU;
      const [x, y] = squircle(a);
      const upperRoundness = smoothstep(-1, -0.08, -y) * 0.035;
      const wave =
        Math.sin(a * 2 - this.time * 0.45) * wobble +
        Math.cos(a * 3 + this.time * 0.3) * wobble * 0.65 +
        Math.sin(a * 5 - this.time * (1.2 + audio.mid * 1.4)) *
          audio.vocal *
          0.012 +
        Math.sin(a * 8 + this.time * 7.5) *
          (expression.worry + expression.angry) *
          0.01;
      const lowerWeight = smoothstep(-0.2, 0.95, y) * 0.055;
      const r =
        1 +
        wave +
        lowerWeight +
        upperRoundness +
        audio.slow * 0.025 +
        audio.attack * 0.03;
      target[i * 2] = x * size * scaleX * r + ox;
      target[i * 2 + 1] = y * size * scaleY * r + oy;
    }
  }

  private drawBody(audio: AudioState, expression: Expression): void {
    this.body.clear();
    this.body.poly(this.shadowPath, true).fill({ color: BLACK, alpha: 0.88 });
    this.body.poly(this.bodyPath, true).fill({
      color: BODY_COLOR,
      alpha: 0.98,
    });
    this.body.poly(this.bodyPath, true).stroke({
      color: BODY_EDGE,
      width: 3 + audio.arousal * 13,
      alpha:
        0.34 +
        audio.arousal * 0.18 +
        expression.surprise * 0.12 +
        expression.worry * 0.06,
      join: "round",
    });
    this.body
      .ellipse(0, this.size * 0.28, this.size * 0.58, this.size * 0.26)
      .fill({
        color: 0x050505,
        alpha: 0.22 + audio.bass * 0.08,
      });
    this.body
      .ellipse(
        -this.size * 0.18,
        -this.size * 0.37,
        this.size * 0.28,
        this.size * 0.08,
      )
      .fill({
        color: WHITE,
        alpha: 0.012 + expression.surprise * 0.016,
      });
  }

  private drawFace(
    size: number,
    audio: AudioState,
    expression: Expression,
  ): void {
    this.face.clear();
    const pose = this.makePose(expression, audio);
    const faceY = -size * 0.12 - expression.surprise * size * 0.02;
    const eyeSpread = size * (0.245 + expression.surprise * 0.035);
    const eyeW = size * pose.eyeWidth;
    const eyeH = size * 0.15 * pose.eyeOpen;

    this.drawEye(-eyeSpread, faceY, eyeW, eyeH, -1, pose);
    this.drawEye(eyeSpread, faceY, eyeW, eyeH, 1, pose);
    this.drawBrows(eyeSpread, faceY, eyeW, eyeH, pose);
    this.drawMouth(size, pose, audio);
  }

  private makePose(expression: Expression, audio: AudioState): FacePose {
    const blinkClose =
      this.blink > 0 ? Math.sin((1 - this.blink / 0.15) * Math.PI) : 0;
    return {
      eyeOpen: clamp01(
        0.78 +
          expression.talk * 0.05 +
          expression.surprise * 0.6 -
          expression.happy * 0.08 -
          expression.angry * 0.2 -
          expression.worry * 0.05 -
          blinkClose * 0.95,
      ),
      eyeWidth:
        0.25 +
        expression.surprise * 0.055 +
        expression.angry * 0.02 -
        expression.happy * 0.012,
      eyeTilt: expression.angry * 0.44 - expression.worry * 0.2,
      eyeSmile: expression.happy * 0.52 - expression.worry * 0.16,
      pupilScale: 1 + expression.surprise * 0.35 - expression.angry * 0.08,
      pupilY: expression.worry * 0.22 - expression.happy * 0.12,
      mouthOpen: clamp01(
        expression.surprise * 0.92 +
          audio.vocal * 0.16 +
          audio.fast * 0.12 +
          expression.talk * 0.18,
      ),
      mouthCurve:
        expression.happy * 0.84 -
        expression.worry * 0.66 -
        expression.angry * 0.45 -
        expression.surprise * 0.14,
      mouthWidth:
        0.12 +
        expression.happy * 0.06 +
        expression.worry * 0.025 -
        expression.surprise * 0.035,
      browInner: -expression.worry * 0.22 + expression.angry * 0.28,
      browOuter: expression.worry * 0.18 - expression.angry * 0.24,
    };
  }

  private drawEye(
    cx: number,
    cy: number,
    width: number,
    height: number,
    side: -1 | 1,
    pose: FacePose,
  ): void {
    const h = Math.max(height, this.size * 0.014);
    const tilt = pose.eyeTilt * side;
    const leftX = cx - width * 0.5;
    const rightX = cx + width * 0.5;
    const topY = cy - h * 0.58;
    const bottomY = cy + h * (0.58 - pose.eyeSmile * 0.2);
    const innerPinch = pose.eyeSmile * width * 0.09;

    this.face
      .moveTo(leftX + innerPinch, cy + tilt * h * 0.42)
      .quadraticCurveTo(cx, topY - tilt * h * 0.2, rightX, cy - tilt * h * 0.42)
      .quadraticCurveTo(
        cx + width * 0.04,
        bottomY - pose.eyeSmile * h * 0.48,
        leftX + innerPinch,
        cy + tilt * h * 0.42,
      )
      .fill({ color: WHITE, alpha: 0.97 });

    const pupilR = h * 0.115 * pose.pupilScale;
    const px = cx + this.gazeX * width - side * width * 0.035;
    const py = cy + this.gazeY * h + pose.pupilY * h * 0.65;
    this.face
      .circle(px, py, Math.max(3, pupilR))
      .fill({ color: BLACK, alpha: 1 });

    this.face
      .circle(px - pupilR * 0.24, py - pupilR * 0.3, pupilR * 0.18)
      .fill({
        color: WHITE,
        alpha: 0.24,
      });
  }

  private drawBrows(
    eyeSpread: number,
    eyeY: number,
    eyeW: number,
    eyeH: number,
    pose: FacePose,
  ): void {
    const browAlpha = clamp01(
      Math.abs(pose.eyeTilt) * 1.6 + Math.abs(pose.browInner) * 1.4,
    );
    if (browAlpha < 0.03) return;

    for (const side of [-1, 1] as const) {
      const cx = side * eyeSpread;
      const innerX = cx - side * eyeW * 0.34;
      const outerX = cx + side * eyeW * 0.46;
      const innerY = eyeY - eyeH * (1.62 + pose.browInner);
      const outerY = eyeY - eyeH * (1.62 + pose.browOuter);
      this.face
        .moveTo(innerX, innerY)
        .lineTo(outerX, outerY)
        .stroke({
          color: SOFT_WHITE,
          width: Math.max(2, this.size * 0.009),
          alpha: 0.45 * browAlpha,
          cap: "round",
        });
    }
  }

  private drawMouth(size: number, pose: FacePose, audio: AudioState): void {
    const y = size * 0.2;
    const halfW = size * pose.mouthWidth;
    const stroke = Math.max(2.5, size * (0.008 + audio.arousal * 0.005));

    if (pose.mouthOpen > 0.5) {
      const ovalW = size * (0.026 + pose.mouthOpen * 0.038);
      const ovalH = size * (0.024 + pose.mouthOpen * 0.082);
      this.face.ellipse(0, y + ovalH * 0.35, ovalW, ovalH).fill({
        color: SOFT_WHITE,
        alpha: 0.82,
      });
      this.face.ellipse(0, y + ovalH * 0.35, ovalW * 0.55, ovalH * 0.72).fill({
        color: BLACK,
        alpha: 0.96,
      });
      return;
    }

    const controlY =
      y - pose.mouthCurve * size * 0.072 + pose.mouthOpen * size * 0.026;
    const endY = y - pose.mouthCurve * size * 0.012;
    this.face
      .moveTo(-halfW, endY)
      .quadraticCurveTo(0, controlY, halfW, endY)
      .stroke({
        color: SOFT_WHITE,
        width: stroke,
        alpha: 0.78,
        cap: "round",
        join: "round",
      });
  }
}
