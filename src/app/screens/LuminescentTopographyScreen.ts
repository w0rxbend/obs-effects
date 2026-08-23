import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { mixHex as lerpColor } from "../../lib/color";

// ── Palette (Catppuccin Mocha) ──────────────────────────────────────────────
const RED = 0xf38ba8;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;

// ── Configuration ───────────────────────────────────────────────────────────
const ROWS = 60;
const COLS = 110;
const GRID_SPACING = 22;
const WAVE_SPEED = 0.0008; // Slower, more majestic
const WAVE_FREQ = 0.018; // Larger waves for more uniform motion
const WAVE_AMP = 45;
const TEXT_LIFT = 160;
const FOCAL_LENGTH = 2200; // Flatter perspective to reduce side-sway

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Point3D {
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
  lift: number;
}

interface BackgroundParticle {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  connected: number[];
  isTextParticle?: boolean;
  lift: number;
}

export class LuminescentTopographyScreen extends Container {
  public static assetBundles = ["main"];

  private readonly meshGfx = new Graphics();
  private readonly particlesGfx = new Graphics();
  private readonly bgGfx = new Graphics();

  private readonly points: Point3D[] = [];
  private readonly particles: BackgroundParticle[] = [];

  private elapsed = 0;
  private w = 1920;
  private h = 1080;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.particlesGfx);
    this.addChild(this.meshGfx);
  }

  public async show(): Promise<void> {
    this.initMesh();
    this.initParticles();
    this.initTextTexture();
    this.drawBackground();
  }

  private initMesh(): void {
    this.points.length = 0;
    const startX = -(COLS * GRID_SPACING) / 2;
    const startY = -(ROWS * GRID_SPACING) / 2;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.points.push({
          x: startX + c * GRID_SPACING,
          y: startY + r * GRID_SPACING,
          z: 0,
          screenX: 0,
          screenY: 0,
          lift: 0,
        });
      }
    }
  }

  private initParticles(): void {
    this.particles.length = 0;
    for (let i = 0; i < 80; i++) {
      const px = (Math.random() - 0.5) * this.w;
      const py = (Math.random() - 0.5) * this.h;
      const p: BackgroundParticle = {
        x: px,
        y: py,
        homeX: px,
        homeY: py,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        size: 1 + Math.random() * 2,
        color: Math.random() > 0.5 ? BLUE : SAPPHIRE,
        alpha: 0.1 + Math.random() * 0.2,
        connected: [],
        lift: 0,
      };

      if (Math.random() > 0.7) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < count; j++) {
          p.connected.push(Math.floor(Math.random() * 80));
        }
      }
      this.particles.push(p);
    }
  }

  private initTextTexture(): void {
    const text = new Text({
      text: "BREAK",
      style: new TextStyle({
        fontFamily: "'Silkscreen', monospace",
        fontSize: 320,
        fontWeight: "700",
        fill: 0xffffff,
        align: "center",
      }),
    });
    text.anchor.set(0.5);

    const container = new Container();
    container.addChild(text);
    container.getBounds();

    text.x = this.w / 2;
    text.y = this.h / 2;

    const canvas = document.createElement("canvas");
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "bold 350px Silkscreen";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BREAK", canvas.width / 2, canvas.height / 2);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    for (const p of this.points) {
      const tx = Math.floor(p.x + this.w / 2);
      const ty = Math.floor(p.y + this.h / 2);
      if (tx >= 0 && tx < this.w && ty >= 0 && ty < this.h) {
        const idx = (ty * this.w + tx) * 4;
        p.lift = imageData[idx] / 255;
      }
    }

    const step = 4;
    for (let y = 0; y < this.h; y += step) {
      for (let x = 0; x < this.w; x += step) {
        const idx = (y * this.w + x) * 4;
        const liftValue = imageData[idx] / 255;
        if (liftValue > 0.5) {
          if (Math.random() > 0.8) {
            const px = x - this.w / 2;
            const py = y - this.h / 2;
            this.particles.push({
              x: px,
              y: py,
              homeX: px,
              homeY: py,
              vx: 0,
              vy: 0,
              size: 1 + Math.random() * 1.5,
              color: RED,
              alpha: 0.5 + Math.random() * 0.4,
              connected: [],
              isTextParticle: true,
              lift: liftValue,
            });
          }
        }
      }
    }

    text.destroy();
    container.destroy();
  }

  private drawBackground(): void {
    this.bgGfx.clear();
    this.bgGfx
      .rect(-this.w / 2, -this.h / 2, this.w, this.h)
      .fill({ color: 0x07070a });
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS;
    this.elapsed += dt;
    const time = this.elapsed * WAVE_SPEED;

    this.updateMesh(time);
    this.updateParticles(dt, time);

    this.drawMesh();
    this.drawParticles();
  }

  private updateMesh(time: number): void {
    // Global swell makes central movement more pronounced
    const globalSwell = Math.sin(time * 0.8) * 15;

    for (const p of this.points) {
      const noise =
        Math.sin(p.x * WAVE_FREQ + time) *
        Math.cos(p.y * WAVE_FREQ + time * 0.7);
      const noise2 =
        Math.sin(p.x * WAVE_FREQ * 0.6 - time * 0.4) *
        Math.sin(p.y * WAVE_FREQ * 0.5 + time * 0.2);

      const baseZ = (noise + noise2 * 0.5) * WAVE_AMP + globalSwell;
      const liftZ = p.lift * TEXT_LIFT;
      p.z = baseZ + liftZ;

      const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
      p.screenX = p.x * perspective;
      p.screenY = p.y * perspective;
    }
  }

  private updateParticles(dt: number, time: number): void {
    const globalSwell = Math.sin(time * 0.8) * 15;

    for (const p of this.particles) {
      if (p.isTextParticle) {
        const noise =
          Math.sin(p.homeX * WAVE_FREQ + time) *
          Math.cos(p.homeY * WAVE_FREQ + time * 0.7);
        const noise2 =
          Math.sin(p.homeX * WAVE_FREQ * 0.6 - time * 0.4) *
          Math.sin(p.homeY * WAVE_FREQ * 0.5 + time * 0.2);

        const baseZ = (noise + noise2 * 0.5) * WAVE_AMP + globalSwell;
        const liftZ = p.lift * TEXT_LIFT;
        const z = baseZ + liftZ;

        const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + z);

        p.x = p.homeX * perspective;
        p.y = p.homeY * perspective;
      } else {
        p.homeX += p.vx * dt * 0.01;
        p.homeY += p.vy * dt * 0.01;

        if (p.homeX > this.w / 2) p.homeX = -this.w / 2;
        if (p.homeX < -this.w / 2) p.homeX = this.w / 2;
        if (p.homeY > this.h / 2) p.homeY = -this.h / 2;
        if (p.homeY < -this.h / 2) p.homeY = this.h / 2;

        const noise =
          Math.sin(p.homeX * WAVE_FREQ + time) *
          Math.cos(p.homeY * WAVE_FREQ + time * 0.7);
        const z = noise * WAVE_AMP + globalSwell;
        const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + z);

        p.x = p.homeX * perspective;
        p.y = p.homeY * perspective;
      }
    }
  }

  private drawMesh(): void {
    this.meshGfx.clear();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const p = this.points[i];

        if (c < COLS - 1) {
          const pRight = this.points[i + 1];
          this.drawEdge(p, pRight);
        }

        if (r < ROWS - 1) {
          const pDown = this.points[i + COLS];
          this.drawEdge(p, pDown);
        }
      }
    }

    for (const p of this.points) {
      const color = this.getColorForZ(p.z);
      const alpha = 0.2 + ((p.z + WAVE_AMP) / (WAVE_AMP + TEXT_LIFT)) * 0.6;
      this.meshGfx.circle(p.screenX, p.screenY, 1.2).fill({ color, alpha });
    }
  }

  private drawEdge(p1: Point3D, p2: Point3D): void {
    const avgZ = (p1.z + p2.z) / 2;
    const color = this.getColorForZ(avgZ);

    const dist = Math.sqrt(
      Math.pow(p1.screenX - p2.screenX, 2) +
        Math.pow(p1.screenY - p2.screenY, 2),
    );
    const tension = Math.max(0.1, 1 - (dist - GRID_SPACING) / GRID_SPACING);

    const alpha = 0.05 + ((avgZ + WAVE_AMP) / (WAVE_AMP + TEXT_LIFT)) * 0.35;

    this.meshGfx
      .moveTo(p1.screenX, p1.screenY)
      .lineTo(p2.screenX, p2.screenY)
      .stroke({ color, alpha, width: 0.4 * tension });
  }

  private getColorForZ(z: number): number {
    const t = (z + WAVE_AMP) / (WAVE_AMP + TEXT_LIFT);
    if (t < 0.45) {
      return lerpColor(0x001a33, BLUE, t * 2.2);
    } else {
      return lerpColor(BLUE, RED, (t - 0.45) * 1.8);
    }
  }

  private drawParticles(): void {
    this.particlesGfx.clear();
    for (const p of this.particles) {
      this.particlesGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: p.color, alpha: p.alpha });

      for (const targetIdx of p.connected) {
        const target = this.particles[targetIdx];
        if (target && !p.isTextParticle) {
          this.particlesGfx
            .moveTo(p.x, p.y)
            .lineTo(target.x, target.y)
            .stroke({ color: p.color, alpha: p.alpha * 0.3, width: 0.5 });
        }
      }
    }
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width / 2;
    this.y = height / 2;
    this.drawBackground();
  }
}
