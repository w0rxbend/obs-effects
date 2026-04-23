import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const SURFACE0 = 0x313244;
const MAUVE = 0xcba6f7;
const SAPPH = 0x74c7ec;
const TEAL = 0x94e2d5;
const PEACH = 0xfab387;
const PINK = 0xf5c2e7;
const GREEN = 0xa6e3a1;
const SKY = 0x89dceb;
const LAVEN = 0xb4befe;
const YELLOW = 0xf9e2af;
const CATT_RED = 0xf38ba8;

const DRAW_COLORS = [
  MAUVE,
  SAPPH,
  TEAL,
  PEACH,
  PINK,
  GREEN,
  SKY,
  LAVEN,
  YELLOW,
  CATT_RED,
] as const;

function randColor(): number {
  return DRAW_COLORS[Math.floor(Math.random() * DRAW_COLORS.length)];
}

// ── Config ────────────────────────────────────────────────────────────────────
const AMBIENT_N = 80;
const TEXT_PARTICLE_STEP = 8;
const RETURN_FORCE = 0.04;
const FRICTION = 0.94;
const JITTER = 0.4;
const COLOR_SPEED = 0.4;
const COLOR_SCALE = 0.0012;
const MOUSE_RADIUS = 150;
const MOUSE_STRENGTH = 0.6;
const PLEXUS_DIST = 45;
const SHAPE_N = 12;

const COMET_N = 2;
const COMET_ATTRACT_RADIUS = 150;
const COMET_REPEL_RADIUS = 70; // Reduced from 120
const COMET_STRENGTH = 0.8;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  color: number;
  radius: number;
  alpha: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  radius: number;
  alpha: number;
}

interface TechShape {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vRot: number;
  sides: number;
  color: number;
  alpha: number;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  history: Array<{ x: number; y: number }>;
  isAttractor: boolean;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class WorxbendTextScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx = new Graphics();
  private readonly plexusGfx = new Graphics();
  private readonly mainGfx = new Graphics();

  private textParticles: Particle[] = [];
  private ambientParticles: AmbientParticle[] = [];
  private techShapes: TechShape[] = [];
  private comets: Comet[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;
  private mouseX = -9999;
  private mouseY = -9999;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.plexusGfx);
    this.addChild(this.mainGfx);
  }

  public async show(): Promise<void> {
    window.addEventListener("mousemove", this._onMouseMove);
    this._initElements();
  }

  public async hide(): Promise<void> {
    window.removeEventListener("mousemove", this._onMouseMove);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this._initElements();
  }

  private _onMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private _initElements(): void {
    this._initAmbient();
    this._initTextParticles();
    this._initTechShapes();
    this._initComets();
  }

  private _initComets(): void {
    this.comets = [];
    for (let i = 0; i < COMET_N; i++) {
      this.comets.push(this._spawnComet());
    }
  }

  private _spawnComet(): Comet {
    const side = Math.floor(Math.random() * 4);
    let x = 0,
      y = 0,
      vx = 0,
      vy = 0;
    const speed = 4 + Math.random() * 6;

    if (side === 0) {
      // Top
      x = Math.random() * this.w;
      y = -50;
      vx = (Math.random() - 0.5) * 2;
      vy = speed;
    } else if (side === 1) {
      // Bottom
      x = Math.random() * this.w;
      y = this.h + 50;
      vx = (Math.random() - 0.5) * 2;
      vy = -speed;
    } else if (side === 2) {
      // Left
      x = -50;
      y = Math.random() * this.h;
      vx = speed;
      vy = (Math.random() - 0.5) * 2;
    } else {
      // Right
      x = this.w + 50;
      y = Math.random() * this.h;
      vx = -speed;
      vy = (Math.random() - 0.5) * 2;
    }

    return {
      x,
      y,
      vx,
      vy,
      color: randColor(),
      size: 2 + Math.random() * 3,
      history: [],
      isAttractor: Math.random() > 0.5,
    };
  }

  private _initTechShapes(): void {
    this.techShapes = [];
    for (let i = 0; i < SHAPE_N; i++) {
      this.techShapes.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 20 + Math.random() * 40,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.02,
        sides: Math.random() > 0.5 ? 3 : 4,
        color: randColor(),
        alpha: 0.03 + Math.random() * 0.05,
      });
    }
  }

  private _initAmbient(): void {
    this.ambientParticles = [];
    for (let i = 0; i < AMBIENT_N; i++) {
      this.ambientParticles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        color: randColor(),
        radius: 0.5 + Math.random() * 1.5,
        alpha: 0.1 + Math.random() * 0.2,
      });
    }
  }

  private _initTextParticles(): void {
    const text = "WORXBEND";
    const maxTextWidth = this.w * 0.75;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = this.w;
    canvas.height = this.h;

    let fontSize = 350;
    ctx.font = `bold ${fontSize}px Silkscreen, sans-serif`;
    const metrics = ctx.measureText(text);

    if (metrics.width > maxTextWidth) {
      fontSize = Math.floor(fontSize * (maxTextWidth / metrics.width));
      ctx.font = `bold ${fontSize}px Silkscreen, sans-serif`;
    }

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText(text, this.w / 2, this.h / 2);

    const imageData = ctx.getImageData(0, 0, this.w, this.h).data;
    this.textParticles = [];

    for (let y = 0; y < this.h; y += TEXT_PARTICLE_STEP) {
      for (let x = 0; x < this.w; x += TEXT_PARTICLE_STEP) {
        const i = (y * this.w + x) * 4;
        if (imageData[i] > 128) {
          this.textParticles.push({
            x: x + (Math.random() - 0.5) * 200,
            y: y + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0,
            homeX: x,
            homeY: y,
            color: 0xffffff,
            radius: 0.5 + Math.random() * 1.0,
            alpha: 0.7 + Math.random() * 0.3,
          });
        }
      }
    }
  }

  private _getInterpolatedColor(value: number): number {
    const n = DRAW_COLORS.length;
    const index = ((value % n) + n) % n;
    const i1 = Math.floor(index);
    const i2 = (i1 + 1) % n;
    const ratio = index - i1;

    return this._lerpColor(DRAW_COLORS[i1], DRAW_COLORS[i2], ratio);
  }

  private _lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }

  private _drawGrid(): void {
    const g = this.bgGfx;
    const spacing = 60;
    const offset = (this.time * 20) % spacing;

    g.beginPath();
    for (let x = offset; x < this.w; x += spacing) {
      g.moveTo(x, 0);
      g.lineTo(x, this.h);
    }
    for (let y = offset; y < this.h; y += spacing) {
      g.moveTo(0, y);
      g.lineTo(this.w, y);
    }
    g.stroke({ color: SURFACE0, width: 1, alpha: 0.15 });
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this.bgGfx.clear();
    this.plexusGfx.clear();
    this.mainGfx.clear();

    // 1. Background Grid
    this._drawGrid();

    // 2. Tech Shapes
    for (const s of this.techShapes) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vRot * dt;

      if (s.x < -s.size) s.x = this.w + s.size;
      if (s.x > this.w + s.size) s.x = -s.size;
      if (s.y < -s.size) s.y = this.h + s.size;
      if (s.y > this.h + s.size) s.y = -s.size;

      this.bgGfx.beginPath();
      if (s.sides === 3) {
        // Triangle
        for (let i = 0; i < 3; i++) {
          const ang = s.rot + (i * Math.PI * 2) / 3;
          const px = s.x + Math.cos(ang) * s.size;
          const py = s.y + Math.sin(ang) * s.size;
          if (i === 0) this.bgGfx.moveTo(px, py);
          else this.bgGfx.lineTo(px, py);
        }
      } else {
        // Square
        for (let i = 0; i < 4; i++) {
          const ang = s.rot + (i * Math.PI * 2) / 4 + Math.PI / 4;
          const px = s.x + Math.cos(ang) * s.size;
          const py = s.y + Math.sin(ang) * s.size;
          if (i === 0) this.bgGfx.moveTo(px, py);
          else this.bgGfx.lineTo(px, py);
        }
      }
      this.bgGfx.closePath();
      this.bgGfx.stroke({ color: s.color, width: 2, alpha: s.alpha });
    }

    // 3. Update & Draw Comets
    for (let i = 0; i < this.comets.length; i++) {
      const c = this.comets[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      c.history.push({ x: c.x, y: c.y });
      if (c.history.length > 20) c.history.shift();

      // Draw Trail
      for (let j = 1; j < c.history.length; j++) {
        const ratio = j / c.history.length;
        this.bgGfx.moveTo(c.history[j - 1].x, c.history[j - 1].y);
        this.bgGfx.lineTo(c.history[j].x, c.history[j].y);
        this.bgGfx.stroke({
          color: c.color,
          width: c.size * ratio,
          alpha: ratio * 0.3,
        });
      }

      // Draw Head
      if (c.isAttractor) {
        this.mainGfx.circle(c.x, c.y, c.size * 2.5);
        this.mainGfx.stroke({ color: c.color, width: 1, alpha: 0.3 });
      }
      this.mainGfx.circle(c.x, c.y, c.size);
      this.mainGfx.fill({ color: c.color, alpha: 0.8 });

      // Recycle
      if (
        c.x < -100 ||
        c.x > this.w + 100 ||
        c.y < -100 ||
        c.y > this.h + 100
      ) {
        this.comets[i] = this._spawnComet();
      }
    }

    // 4. Update & Draw Ambient
    for (const p of this.ambientParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < 0) p.x = this.w;
      if (p.x > this.w) p.x = 0;
      if (p.y < 0) p.y = this.h;
      if (p.y > this.h) p.y = 0;

      this.mainGfx.circle(p.x, p.y, p.radius);
      this.mainGfx.fill({ color: p.color, alpha: p.alpha });
    }

    // 5. Update & Draw Text Particles + Plexus
    for (let i = 0; i < this.textParticles.length; i++) {
      const p = this.textParticles[i];

      // Steering behavior
      const dxHome = p.homeX - p.x;
      const dyHome = p.homeY - p.y;
      p.vx += dxHome * RETURN_FORCE;
      p.vy += dyHome * RETURN_FORCE;

      // Mouse Interactivity
      const dxMouse = p.x - this.mouseX;
      const dyMouse = p.y - this.mouseY;
      const dMouseSq = dxMouse * dxMouse + dyMouse * dyMouse;
      if (dMouseSq < MOUSE_RADIUS * MOUSE_RADIUS) {
        const dMouse = Math.sqrt(dMouseSq);
        const f = (1 - dMouse / MOUSE_RADIUS) * MOUSE_STRENGTH;
        p.vx += (dxMouse / dMouse) * f * dt * 5;
        p.vy += (dyMouse / dMouse) * f * dt * 5;
      }

      // Comet Interactivity
      for (const comet of this.comets) {
        const dxComet = p.x - comet.x;
        const dyComet = p.y - comet.y;
        const dCometSq = dxComet * dxComet + dyComet * dyComet;
        const radius = comet.isAttractor
          ? COMET_ATTRACT_RADIUS
          : COMET_REPEL_RADIUS;

        if (dCometSq < radius * radius) {
          const dComet = Math.sqrt(dCometSq);
          const f = (1 - dComet / radius) * COMET_STRENGTH;

          if (comet.isAttractor) {
            p.vx -= (dxComet / dComet) * f * dt * 5;
            p.vy -= (dyComet / dComet) * f * dt * 5;
          } else {
            p.vx += (dxComet / dComet) * f * dt * 5;
            p.vy += (dyComet / dComet) * f * dt * 5;
          }
        }
      }

      p.vx += (Math.random() - 0.5) * JITTER;
      p.vy += (Math.random() - 0.5) * JITTER;

      p.vx *= FRICTION;
      p.vy *= FRICTION;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const colorValue =
        (p.homeX + p.homeY) * COLOR_SCALE + this.time * COLOR_SPEED;
      p.color = this._getInterpolatedColor(colorValue);

      this.mainGfx.circle(p.x, p.y, p.radius);
      this.mainGfx.fill({ color: p.color, alpha: p.alpha });

      // Plexus Lines
      for (
        let j = i + 1;
        j < Math.min(i + 25, this.textParticles.length);
        j++
      ) {
        const p2 = this.textParticles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < PLEXUS_DIST * PLEXUS_DIST) {
          const dist = Math.sqrt(distSq);
          const alpha = (1 - dist / PLEXUS_DIST) * 0.15;
          this.plexusGfx.moveTo(p.x, p.y);
          this.plexusGfx.lineTo(p2.x, p2.y);
          this.plexusGfx.stroke({ color: p.color, width: 1, alpha });
        }
      }
    }
  }
}
