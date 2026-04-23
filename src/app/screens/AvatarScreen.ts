import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Palette (Catppuccin Mocha) ────────────────────────────────────────────────
const BASE = 0x1e1e2e;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;
const OVERLAY0 = 0x6c7086;
const TEXT = 0xcdd6f4;
const BLUE = 0x89b4fa;
const RED = 0xf38ba8;
const PEACH = 0xfab387;

/**
 * Animated Avatar Screen: Robotic bust with typing hands.
 */
export class AvatarScreen extends Container {
  private readonly avatarCont: Container;
  private readonly bodyGfx: Graphics;
  private readonly headGfx: Graphics;
  private readonly faceGfx: Graphics;

  private readonly leftArmGfx: Graphics;
  private readonly rightArmGfx: Graphics;
  private readonly leftHandCont: Container;
  private readonly rightHandCont: Container;
  private readonly leftHandGfx: Graphics;
  private readonly rightHandGfx: Graphics;

  private blinkTimer = 0;
  private blinkDuration = 0.15;
  private blinkInterval = 3 + Math.random() * 4;
  private isBlinking = false;

  private talkTimer = 0;
  private headBobTimer = 0;
  private typingTimer = 0;

  constructor() {
    super();

    this.avatarCont = new Container();
    this.addChild(this.avatarCont);

    this.bodyGfx = new Graphics();
    this.headGfx = new Graphics();
    this.faceGfx = new Graphics();

    this.leftArmGfx = new Graphics();
    this.rightArmGfx = new Graphics();

    this.leftHandCont = new Container();
    this.rightHandCont = new Container();
    this.leftHandGfx = new Graphics();
    this.rightHandGfx = new Graphics();

    // Layers bottom to top
    this.avatarCont.addChild(this.bodyGfx);
    this.avatarCont.addChild(this.leftArmGfx);
    this.avatarCont.addChild(this.rightArmGfx);
    this.avatarCont.addChild(this.headGfx);
    this.avatarCont.addChild(this.faceGfx);

    this.leftHandCont.addChild(this.leftHandGfx);
    this.rightHandCont.addChild(this.rightHandGfx);
    this.avatarCont.addChild(this.leftHandCont);
    this.avatarCont.addChild(this.rightHandCont);

    this.initAvatar();
  }

  private initAvatar(): void {
    this.drawBody();
    this.drawHeadBase();
  }

  private drawBody(): void {
    this.bodyGfx.clear();
    // Shoulders / Torso
    this.bodyGfx.fill(SURFACE0);
    this.bodyGfx.stroke({ width: 2, color: SURFACE1 });
    this.bodyGfx.roundRect(-180, 100, 360, 200, 40);
    this.bodyGfx.fill();
    this.bodyGfx.stroke();

    // Shoulder Joints (Sockets)
    this.bodyGfx.fill(SURFACE1);
    this.bodyGfx.circle(-160, 130, 25);
    this.bodyGfx.circle(160, 130, 25);
    this.bodyGfx.fill();

    // Chest plate
    this.bodyGfx.fill(BASE);
    this.bodyGfx.roundRect(-120, 120, 240, 150, 20);
    this.bodyGfx.fill();

    // Neck
    this.bodyGfx.fill(SURFACE0);
    this.bodyGfx.rect(-30, 40, 60, 80);
    this.bodyGfx.fill();
  }

  private drawHeadBase(): void {
    this.headGfx.clear();
    // Bender-style head
    this.headGfx.fill(BASE);
    this.headGfx.stroke({ width: 4, color: SURFACE1 });
    this.headGfx.roundRect(-60, -80, 120, 160, 40);
    this.headGfx.fill();
    this.headGfx.stroke();

    // Antenna
    this.headGfx.fill(SURFACE0);
    this.headGfx.roundRect(-10, -100, 20, 30, 5);
    this.headGfx.fill();
    this.headGfx.rect(-2, -130, 4, 30);
    this.headGfx.fill();
    this.headGfx.fill(PEACH);
    this.headGfx.circle(0, -135, 8);
    this.headGfx.fill();
  }

  private drawArmSegment(
    gfx: Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    segmentCount: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Underlying "bone/wire"
    gfx.stroke({ width: 4, color: BASE });
    gfx.moveTo(x1, y1);
    gfx.lineTo(x2, y2);
    gfx.stroke();

    for (let i = 0; i < segmentCount; i++) {
      const tStart = i / segmentCount;
      const tEnd = (i + 0.9) / segmentCount;
      const segX = x1 + dx * tStart;
      const segY = y1 + dy * tStart;
      const segLen = (distance / segmentCount) * 0.9;

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const hw = 8; // half width of plate

      const p1x = segX + cos * 0 - sin * -hw;
      const p1y = segY + sin * 0 + cos * -hw;

      const p2x = segX + cos * segLen - sin * -hw;
      const p2y = segY + sin * segLen + cos * -hw;

      const p3x = segX + cos * segLen - sin * hw;
      const p3y = segY + sin * segLen + cos * hw;

      const p4x = segX + cos * 0 - sin * hw;
      const p4y = segY + sin * 0 + cos * hw;

      gfx.fill(SURFACE0);
      gfx.stroke({ width: 1.5, color: SURFACE1 });
      gfx.poly([p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y], true);
      gfx.fill();
      gfx.stroke();

      // Simple detail: center dot
      const cx = segX + cos * (segLen * 0.5);
      const cy = segY + sin * (segLen * 0.5);
      gfx.fill(OVERLAY0);
      gfx.circle(cx, cy, 2);
      gfx.fill();
    }
  }

  private updateHand(
    cont: Container,
    gfx: Graphics,
    armGfx: Graphics,
    side: "left" | "right",
    t: number,
  ): void {
    const isLeft = side === "left";
    const xBase = isLeft ? -130 : 130;
    const yBase = 220;

    // Movement
    const xOff = Math.sin(t * 12 + (isLeft ? 0 : Math.PI)) * 20;
    const yOff = Math.cos(t * 18 + (isLeft ? Math.PI : 0)) * 12;
    const rotOff = Math.sin(t * 10) * 0.1;
    const handX = xBase + xOff;
    const handY = yBase + yOff;

    cont.x = handX;
    cont.y = handY;
    cont.rotation = rotOff + (isLeft ? 0.2 : -0.2);

    // Draw Arm
    const armStartX = isLeft ? -160 : 160;
    const armStartY = 130;
    const midX = (armStartX + handX) * 0.5 + (isLeft ? -30 : 30);
    const midY = (armStartY + handY) * 0.5 + 40;

    armGfx.clear();
    this.drawArmSegment(armGfx, armStartX, armStartY, midX, midY, 3);
    this.drawArmSegment(armGfx, midX, midY, handX, handY, 3);

    // Elbow Joint
    armGfx.fill(SURFACE1);
    armGfx.stroke({ width: 2, color: OVERLAY0 });
    armGfx.circle(midX, midY, 12);
    armGfx.fill();
    armGfx.stroke();
    armGfx.fill(BASE);
    armGfx.circle(midX, midY, 5);
    armGfx.fill();

    // Draw Hand Gfx
    gfx.clear();
    gfx.fill(SURFACE0);
    gfx.stroke({ width: 2, color: SURFACE1 });
    gfx.roundRect(-35, -20, 70, 45, 12);
    gfx.fill();
    gfx.stroke();

    gfx.fill(SURFACE1);
    gfx.circle(0, 0, 10);
    gfx.fill();

    for (let i = 0; i < 3; i++) {
      const fX = -25 + i * 25;
      const fY = 15;
      const fPhase = t * 25 + i * 1.5;
      const fLen = 35 + Math.sin(fPhase) * 15;

      gfx.fill(SURFACE0);
      gfx.roundRect(fX - 7, fY, 14, fLen * 0.5, 4);
      gfx.roundRect(fX - 6, fY + fLen * 0.5 + 2, 12, fLen * 0.4, 4);
      gfx.fill();
      gfx.stroke({ width: 1, color: SURFACE1 });
      gfx.stroke();

      gfx.fill(OVERLAY0);
      gfx.circle(fX, fY + fLen * 0.5 + 1, 4);
      gfx.fill();
    }

    const thumbX = isLeft ? 30 : -30;
    const thumbY = 0;
    gfx.fill(SURFACE0);
    gfx.roundRect(thumbX - 6, thumbY, 12, 25, 4);
    gfx.fill();
    gfx.stroke({ width: 1, color: SURFACE1 });
    gfx.stroke();
  }

  public update(ticker: Ticker): void {
    const delta = ticker.deltaTime / 60;
    this.headBobTimer += delta;
    this.talkTimer += delta;
    this.typingTimer += delta;

    const headTilt = Math.sin(this.headBobTimer * 1.5) * 0.05;
    const headX = Math.cos(this.headBobTimer * 0.8) * 5;
    const headY = Math.sin(this.headBobTimer * 2.1) * 3;

    this.headGfx.rotation = headTilt;
    this.headGfx.x = headX;
    this.headGfx.y = headY;

    this.faceGfx.rotation = headTilt;
    this.faceGfx.x = headX;
    this.faceGfx.y = headY;

    this.updateHand(
      this.leftHandCont,
      this.leftHandGfx,
      this.leftArmGfx,
      "left",
      this.typingTimer,
    );
    this.updateHand(
      this.rightHandCont,
      this.rightHandGfx,
      this.rightArmGfx,
      "right",
      this.typingTimer,
    );

    this.blinkTimer += delta;
    if (this.isBlinking) {
      if (this.blinkTimer >= this.blinkDuration) {
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.blinkInterval = 2 + Math.random() * 5;
      }
    } else {
      if (this.blinkTimer >= this.blinkInterval) {
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
    }

    this.drawFace();
  }

  private drawFace(): void {
    this.faceGfx.clear();
    this.faceGfx.fill(SURFACE0);
    this.faceGfx.roundRect(-50, -30, 100, 40, 10);
    this.faceGfx.fill();

    let eyeHeight = 25;
    if (this.isBlinking) {
      const p = this.blinkTimer / this.blinkDuration;
      eyeHeight = 25 * (1 - Math.sin(p * Math.PI));
    }

    this.faceGfx.fill(BLUE);
    this.faceGfx.roundRect(-35, -10 - eyeHeight / 2, 20, eyeHeight, 4);
    this.faceGfx.roundRect(15, -10 - eyeHeight / 2, 20, eyeHeight, 4);
    this.faceGfx.fill();

    const talkMag = Math.abs(Math.sin(this.talkTimer * 10)) * 20;
    const mouthWidth = 40;
    const mouthHeight = 5 + talkMag;

    this.faceGfx.fill(RED);
    this.faceGfx.rect(-mouthWidth / 2, 30, mouthWidth, mouthHeight);
    this.faceGfx.fill();

    this.faceGfx.stroke({ width: 2, color: BASE });
    for (let i = 1; i < 4; i++) {
      const x = -mouthWidth / 2 + (mouthWidth / 4) * i;
      this.faceGfx.moveTo(x, 30);
      this.faceGfx.lineTo(x, 30 + mouthHeight);
    }
    this.faceGfx.stroke();
  }

  public resize(width: number, height: number): void {
    this.avatarCont.x = width * 0.5;
    this.avatarCont.y = height * 0.55;
    this.avatarCont.scale.set(1.5);
  }
}
