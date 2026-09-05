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

// The mesh is deliberately wider and taller than the viewport so the perspective
// sway never exposes an edge. Anything fully outside this margin draws no pixels,
// so it is skipped before it costs a Graphics instruction.
const CULL_MARGIN = 4;
const CLIP_LEFT = 1;
const CLIP_RIGHT = 2;
const CLIP_TOP = 4;
const CLIP_BOTTOM = 8;

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

  // Pre-allocated per-frame scratch (no allocation inside update/draw).
  //
  // The wave is separable: every point in a column shares the same x term and
  // every point in a row shares the same y term, so the four sin/cos values per
  // point collapse to COLS + ROWS table entries per frame.
  private readonly waveSinX = new Float64Array(COLS);
  private readonly waveSinX2 = new Float64Array(COLS);
  private readonly waveCosY = new Float64Array(ROWS);
  private readonly waveSinY2 = new Float64Array(ROWS);
  // Cohen–Sutherland style outside-bits, one per mesh point (see CULL_MARGIN).
  private readonly clipCodes = new Uint8Array(ROWS * COLS);
  // Pixi copies these into its own style object on every fill()/stroke(), so one
  // reusable instance per kind replaces ~20k throwaway literals per frame.
  private readonly scratchFill = { color: 0, alpha: 1 };
  private readonly scratchStroke = { color: 0, alpha: 1, width: 1 };

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

    const points = this.points;
    const { waveSinX, waveSinX2, waveCosY, waveSinY2, clipCodes } = this;

    // Row 0 carries every distinct x, column 0 every distinct y.
    for (let c = 0; c < COLS; c++) {
      const x = points[c].x;
      waveSinX[c] = Math.sin(x * WAVE_FREQ + time);
      waveSinX2[c] = Math.sin(x * WAVE_FREQ * 0.6 - time * 0.4);
    }
    for (let r = 0; r < ROWS; r++) {
      const y = points[r * COLS].y;
      waveCosY[r] = Math.cos(y * WAVE_FREQ + time * 0.7);
      waveSinY2[r] = Math.sin(y * WAVE_FREQ * 0.5 + time * 0.2);
    }

    const clipX = this.w / 2 + CULL_MARGIN;
    const clipY = this.h / 2 + CULL_MARGIN;

    for (let r = 0; r < ROWS; r++) {
      const cosY = waveCosY[r];
      const sinY2 = waveSinY2[r];
      const rowStart = r * COLS;

      for (let c = 0; c < COLS; c++) {
        const i = rowStart + c;
        const p = points[i];

        const noise = waveSinX[c] * cosY;
        const noise2 = waveSinX2[c] * sinY2;

        const baseZ = (noise + noise2 * 0.5) * WAVE_AMP + globalSwell;
        const liftZ = p.lift * TEXT_LIFT;
        p.z = baseZ + liftZ;

        const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
        const screenX = p.x * perspective;
        const screenY = p.y * perspective;
        p.screenX = screenX;
        p.screenY = screenY;

        let code = 0;
        if (screenX < -clipX) code = CLIP_LEFT;
        else if (screenX > clipX) code = CLIP_RIGHT;
        if (screenY < -clipY) code |= CLIP_TOP;
        else if (screenY > clipY) code |= CLIP_BOTTOM;
        clipCodes[i] = code;
      }
    }
  }

  private updateParticles(dt: number, time: number): void {
    const globalSwell = Math.sin(time * 0.8) * 15;

    // Hoisted out of the loop: these are the same for every particle.
    const timeY = time * 0.7;
    const time2X = time * 0.4;
    const time2Y = time * 0.2;
    const halfW = this.w / 2;
    const halfH = this.h / 2;

    const particles = this.particles;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      if (p.isTextParticle) {
        const noise =
          Math.sin(p.homeX * WAVE_FREQ + time) *
          Math.cos(p.homeY * WAVE_FREQ + timeY);
        const noise2 =
          Math.sin(p.homeX * WAVE_FREQ * 0.6 - time2X) *
          Math.sin(p.homeY * WAVE_FREQ * 0.5 + time2Y);

        const baseZ = (noise + noise2 * 0.5) * WAVE_AMP + globalSwell;
        const liftZ = p.lift * TEXT_LIFT;
        const z = baseZ + liftZ;

        const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + z);

        p.x = p.homeX * perspective;
        p.y = p.homeY * perspective;
      } else {
        p.homeX += p.vx * dt * 0.01;
        p.homeY += p.vy * dt * 0.01;

        if (p.homeX > halfW) p.homeX = -halfW;
        if (p.homeX < -halfW) p.homeX = halfW;
        if (p.homeY > halfH) p.homeY = -halfH;
        if (p.homeY < -halfH) p.homeY = halfH;

        const noise =
          Math.sin(p.homeX * WAVE_FREQ + time) *
          Math.cos(p.homeY * WAVE_FREQ + timeY);
        const z = noise * WAVE_AMP + globalSwell;
        const perspective = FOCAL_LENGTH / (FOCAL_LENGTH + z);

        p.x = p.homeX * perspective;
        p.y = p.homeY * perspective;
      }
    }
  }

  private drawMesh(): void {
    const gfx = this.meshGfx;
    const points = this.points;
    const clipCodes = this.clipCodes;

    gfx.clear();

    for (let r = 0; r < ROWS; r++) {
      const rowStart = r * COLS;

      for (let c = 0; c < COLS; c++) {
        const i = rowStart + c;
        const code = clipCodes[i];
        const p = points[i];

        // Sharing an outside bit means the whole segment sits beyond that edge
        // of the viewport, so it can never contribute a pixel.
        if (c < COLS - 1 && (code & clipCodes[i + 1]) === 0) {
          this.drawEdge(p, points[i + 1]);
        }

        if (r < ROWS - 1 && (code & clipCodes[i + COLS]) === 0) {
          this.drawEdge(p, points[i + COLS]);
        }
      }
    }

    const fill = this.scratchFill;
    for (let i = 0; i < points.length; i++) {
      if (clipCodes[i] !== 0) continue;

      const p = points[i];
      fill.color = this.getColorForZ(p.z);
      fill.alpha = 0.2 + ((p.z + WAVE_AMP) / (WAVE_AMP + TEXT_LIFT)) * 0.6;
      gfx.circle(p.screenX, p.screenY, 1.2).fill(fill);
    }
  }

  private drawEdge(p1: Point3D, p2: Point3D): void {
    const avgZ = (p1.z + p2.z) / 2;

    const dx = p1.screenX - p2.screenX;
    const dy = p1.screenY - p2.screenY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tension = Math.max(0.1, 1 - (dist - GRID_SPACING) / GRID_SPACING);

    const stroke = this.scratchStroke;
    stroke.color = this.getColorForZ(avgZ);
    stroke.alpha = 0.05 + ((avgZ + WAVE_AMP) / (WAVE_AMP + TEXT_LIFT)) * 0.35;
    stroke.width = 0.4 * tension;

    this.meshGfx
      .moveTo(p1.screenX, p1.screenY)
      .lineTo(p2.screenX, p2.screenY)
      .stroke(stroke);
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
    const gfx = this.particlesGfx;
    const particles = this.particles;
    const fill = this.scratchFill;
    const stroke = this.scratchStroke;

    gfx.clear();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      fill.color = p.color;
      fill.alpha = p.alpha;
      gfx.circle(p.x, p.y, p.size).fill(fill);

      // Text particles are created without connections and never gain any.
      if (p.isTextParticle) continue;

      const connected = p.connected;
      for (let j = 0; j < connected.length; j++) {
        const target = particles[connected[j]];
        if (!target) continue;

        stroke.color = p.color;
        stroke.alpha = p.alpha * 0.3;
        stroke.width = 0.5;
        gfx.moveTo(p.x, p.y).lineTo(target.x, target.y).stroke(stroke);
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
