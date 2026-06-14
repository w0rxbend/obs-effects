import type { Ticker } from "pixi.js";
import {
  Container,
  Graphics,
  Sprite,
  Texture,
  BlurFilter,
  ColorMatrixFilter,
  Rectangle,
  Assets,
} from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const CRUST = 0x11111b;
const WHITE = 0xffffff;
const MAUVE = 0xcba6f7;
const SAPPHIRE = 0x74c7ec;
const SKY = 0x89dceb;
const TEAL = 0x94e2d5;
const ROSEWATER = 0xf5e0dc; // Catppuccin Rosewater

// ── Visualizer Constants ──────────────────────────────────────────────────────
const BAR_COUNT = 240;
const RADIUS = 280;
const BAR_MAX_OUT = 220;
const BAR_W = 3.2;

// ── Sprite Sheet Constants ────────────────────────────────────────────────────
const CELL_W = 201;
const CELL_H = 192;
const SHEET_COLS = 14;
const SHEET_ROWS = 8;

interface FreqBin {
  value: number;
  target: number;
}

enum ParticleType {
  DRIFT,
  ORBIT,
  EXPLOSION,
  ICON,
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  type: ParticleType;
  angle?: number;
  dist?: number;
  rotSpeed?: number;
  life?: number;
  sprite?: Sprite | null;
  baseScale?: number;
}

interface Ripple {
  r: number;
  alpha: number;
  speed: number;
}

interface WarpLine {
  angle: number;
  length: number;
  distance: number;
  speed: number;
  alpha: number;
}

interface Blob {
  angle: number;
  dist: number;
  radius: number;
  color: number;
  alpha: number;
  phase: number;
  speed: number;
  rotation: number;
  rotSpeed: number;
}

/**
 * TrapNation-style visualizer - Large Icon Edition.
 */
export class TrapNationScreen extends Container {
  public static assetBundles = ["main"];

  private readonly bgGfx: Graphics;
  private readonly auraGfx: Graphics;

  private readonly clusterContainer: Container;
  private readonly clusterOutlineContainer: Container;
  private readonly clusterOutlineGfx: Graphics;
  private readonly clusterGfx: Graphics;

  private readonly ringContainer: Container;
  private readonly ringGfx: Graphics;

  private readonly vizContainer: Container;
  private readonly vizGfx: Graphics;

  private readonly warpGfx: Graphics;
  private readonly rippleGfx: Graphics;
  private readonly particleGfx: Graphics;
  private readonly iconContainer: Container;

  // Logo System
  private readonly logoContainer: Container;
  private readonly logoOutlineContainer: Container;
  private logoSprite: Sprite | null = null;
  private logoOutlineSprite: Sprite | null = null;

  private w = 0;
  private h = 0;
  private time = 0;

  private readonly bins: FreqBin[];
  private beatDecay = 0;
  private nextBeatTime = 0;
  private megaBeatDecay = 0;
  private beatStrength = 1.0;

  private readonly particles: DustParticle[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly warpLines: WarpLine[] = [];
  private readonly blobs: Blob[] = [];
  private iconTextures: Texture[] = [];

  private shakeX = 0;
  private shakeY = 0;
  private shakeDecay = 0;

  private logoBaseScale = 1.0;

  constructor() {
    super();

    this.bins = Array.from({ length: BAR_COUNT }, () => ({
      value: 0,
      target: 0,
    }));

    this.bgGfx = new Graphics();
    this.auraGfx = new Graphics();

    // 1. Center Cluster
    this.clusterContainer = new Container();
    this.clusterOutlineContainer = new Container();
    this.clusterOutlineGfx = new Graphics();
    this.clusterGfx = new Graphics();

    const tightBlur = new BlurFilter();
    tightBlur.blur = 6;
    const outlineMatrix = new ColorMatrixFilter();
    outlineMatrix.matrix = [
      0, 0, 0, 0, 0.96, 0, 0, 0, 0, 0.88, 0, 0, 0, 0, 0.86, 0, 0, 0, 100, -50,
    ];
    this.clusterOutlineContainer.filters = [tightBlur, outlineMatrix];
    this.clusterOutlineContainer.addChild(this.clusterOutlineGfx);
    this.clusterContainer.addChild(this.clusterOutlineContainer);
    this.clusterContainer.addChild(this.clusterGfx);

    // 2. Ring Gooey Layer
    this.ringContainer = new Container();
    this.ringGfx = new Graphics();
    const blur = new BlurFilter();
    blur.blur = 14;
    const threshold = new ColorMatrixFilter();
    threshold.matrix = [
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 90, -45,
    ];
    this.ringContainer.filters = [blur, threshold];
    this.ringContainer.addChild(this.ringGfx);

    // 3. Viz Gooey Layer (Audio Bars)
    this.vizContainer = new Container();
    this.vizGfx = new Graphics();
    const vizBlur = new BlurFilter();
    vizBlur.blur = 8;
    const vizThreshold = new ColorMatrixFilter();
    vizThreshold.matrix = [
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 80, -40,
    ];
    this.vizContainer.filters = [vizBlur, vizThreshold];
    this.vizContainer.addChild(this.vizGfx);

    this.warpGfx = new Graphics();
    this.rippleGfx = new Graphics();
    this.particleGfx = new Graphics();
    this.iconContainer = new Container();

    // 4. Logo Setup
    this.logoContainer = new Container();
    this.logoOutlineContainer = new Container();

    const logoBlur = new BlurFilter();
    logoBlur.blur = 8;
    const logoOutlineMatrix = new ColorMatrixFilter();
    logoOutlineMatrix.matrix = [
      0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0.65, 0, 0, 0, 0, 0.97, 0, 0, 0, 100, -50,
    ];
    this.logoOutlineContainer.filters = [logoBlur, logoOutlineMatrix];
    this.logoContainer.addChild(this.logoOutlineContainer);

    // Layers order
    this.addChild(this.bgGfx);
    this.addChild(this.iconContainer);
    this.addChild(this.auraGfx);
    this.addChild(this.clusterContainer);
    this.addChild(this.ringContainer);
    this.addChild(this.vizContainer);
    this.addChild(this.warpGfx);
    this.addChild(this.rippleGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.logoContainer);

    this._initWarpLines();
    this._initBlobs();
  }

  public async show(): Promise<void> {
    const logoTex = Texture.from("worxbend-logo.png");
    this.logoSprite = new Sprite(logoTex);
    this.logoSprite.anchor.set(0.5);
    this.logoSprite.width = 240;
    this.logoSprite.scale.y = this.logoSprite.scale.x;
    this.logoBaseScale = this.logoSprite.scale.x;
    const colorBoost = new ColorMatrixFilter();
    colorBoost.saturate(0.5);
    colorBoost.brightness(1.4, false);
    this.logoSprite.filters = [colorBoost];
    this.logoOutlineSprite = new Sprite(logoTex);
    this.logoOutlineSprite.anchor.set(0.5);
    this.logoOutlineSprite.width = 245;
    this.logoOutlineSprite.scale.y = this.logoOutlineSprite.scale.x;
    this.logoOutlineContainer.addChild(this.logoOutlineSprite);
    this.logoContainer.addChild(this.logoSprite);

    const sheetTex = await Assets.load<Texture>("sprite-linux.png");
    for (let r = 0; r < SHEET_ROWS; r++) {
      for (let c = 0; c < SHEET_COLS; c++) {
        const frame = new Rectangle(c * CELL_W, r * CELL_H, CELL_W, CELL_H);
        this.iconTextures.push(new Texture({ source: sheetTex.source, frame }));
      }
    }

    this._initParticles();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime / 60;
    this.time += dt;

    this._updateAudioSimulation(dt);
    this._updateParticles(dt);
    this._updateRipples(dt);
    this._updateWarpLines();
    this._updateBlobs(dt);
    this._updateShake(dt);

    this._drawBackground();
    this._drawAura();
    this._drawCluster();
    this._drawWarpLines();
    this._drawRipples();
    this._drawParticles();
    this._drawVisualizer();
    this._animateLogo();
    this._applyShake();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.pivot.set(0, 0);
    const elements = [
      this.bgGfx,
      this.auraGfx,
      this.clusterOutlineGfx,
      this.clusterGfx,
      this.ringGfx,
      this.vizGfx,
      this.warpGfx,
      this.rippleGfx,
      this.particleGfx,
      this.iconContainer,
      this.logoContainer,
    ];
    elements.forEach((g) => {
      if (g && !g.destroyed) g.position.set(width * 0.5, height * 0.5);
    });
  }

  // ── Simulation ─────────────────────────────────────────────────────────────

  private _initParticles(): void {
    for (let i = 0; i < 60; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 1200,
        vx: (Math.random() - 0.5) * 8,
        vy: -15 - Math.random() * 25,
        size: 0.6 + Math.random() * 1.8,
        alpha: 0.05 + Math.random() * 0.4,
        color: WHITE,
        type: ParticleType.DRIFT,
        sprite: null,
      });
    }

    // ICON Particles - Increased Size (20px to 40px)
    for (let i = 0; i < 120; i++) {
      if (this.iconTextures.length === 0) break;
      const tex =
        this.iconTextures[Math.floor(Math.random() * this.iconTextures.length)];
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);

      const targetWidth = 35;
      const bScale = targetWidth / CELL_W;
      sprite.scale.set(bScale);

      sprite.alpha = 0.15 + Math.random() * 0.25;
      sprite.tint = Math.random() > 0.8 ? MAUVE : WHITE;
      this.iconContainer.addChild(sprite);

      this.particles.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 1200,
        vx: (Math.random() - 0.5) * 5,
        vy: -10 - Math.random() * 20,
        size: 1.0,
        alpha: sprite.alpha,
        color: WHITE,
        type: ParticleType.ICON,
        sprite,
        baseScale: bScale,
      });
    }

    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1.2 + Math.random() * 2.2,
        alpha: 0.1 + Math.random() * 0.5,
        color: Math.random() > 0.5 ? MAUVE : SKY,
        type: ParticleType.ORBIT,
        angle: Math.random() * Math.PI * 2,
        dist: 350 + Math.random() * 500,
        rotSpeed: (0.1 + Math.random() * 0.3) * (Math.random() > 0.5 ? 1 : -1),
        sprite: null,
      });
    }
  }

  private _spawnExplosion(): void {
    const count = 25 + Math.floor(Math.random() * 15);
    for (let i = 0; i < count; i++) {
      const isIcon = Math.random() > 0.5;
      const ang = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 35;

      let sprite: Sprite | null = null;
      let bScale = 1.0;
      if (isIcon && this.iconTextures.length > 0) {
        const tex =
          this.iconTextures[
            Math.floor(Math.random() * this.iconTextures.length)
          ];
        sprite = new Sprite(tex);
        sprite.anchor.set(0.5);

        const targetWidth = 35;
        bScale = targetWidth / CELL_W;
        sprite.scale.set(bScale);

        sprite.tint = Math.random() > 0.5 ? MAUVE : WHITE;
        sprite.alpha = 0.7;
        this.iconContainer.addChild(sprite);
      }

      this.particles.push({
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 40,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        size: 1.5 + Math.random() * 3,
        alpha: 0.8 + Math.random() * 0.2,
        color: WHITE,
        type: ParticleType.EXPLOSION,
        life: 1.0,
        sprite,
        baseScale: bScale,
      });
    }
  }

  private _initWarpLines(): void {
    for (let i = 0; i < 45; i++) {
      this.warpLines.push({
        angle: Math.random() * Math.PI * 2,
        length: 20 + Math.random() * 120,
        distance: 100 + Math.random() * 1000,
        speed: 1.8 + Math.random() * 5,
        alpha: 0.08 + Math.random() * 0.25,
      });
    }
  }

  private _initBlobs(): void {
    const colors = [MAUVE, SAPPHIRE, SKY, TEAL];
    const blobCount = 24;
    for (let i = 0; i < blobCount; i++) {
      const angle = (i / blobCount) * Math.PI * 2;
      this.blobs.push({
        angle,
        dist: 10 + Math.random() * 110,
        radius: 50 + Math.random() * 40,
        color: colors[i % colors.length],
        alpha: 0.4 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.12 + Math.random() * 0.28,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.6,
      });
    }
  }

  private _updateAudioSimulation(dt: number): void {
    if (this.time >= this.nextBeatTime) {
      this.nextBeatTime = this.time + 1.0 + Math.random() * 2.0;
      this.beatStrength = 1.0 + Math.random() * 0.5;
      this.beatDecay = this.beatStrength;

      this._spawnExplosion();

      if (Math.random() > 0.6) {
        this.megaBeatDecay = 1.0;
        this.shakeDecay = 1.0;
        this.shakeX = (Math.random() - 0.5) * 25;
        this.shakeY = (Math.random() - 0.5) * 25;
        this._spawnRipple(RADIUS, 320);
      } else {
        this.shakeDecay = 0.6;
        this.shakeX = (Math.random() - 0.5) * 10;
        this.shakeY = (Math.random() - 0.5) * 10;
        if (Math.random() > 0.5) this._spawnRipple(RADIUS, 200);
      }
    }

    this.beatDecay = Math.max(0, this.beatDecay - dt * 2.8);
    this.megaBeatDecay = Math.max(0, this.megaBeatDecay - dt * 1.8);

    for (let i = 0; i < BAR_COUNT; i++) {
      const index = i < BAR_COUNT / 2 ? i : BAR_COUNT - 1 - i;
      const normIdx = index / (BAR_COUNT / 2);
      let v: number;
      if (normIdx < 0.25) {
        v = (1.0 - normIdx * 3) * this.beatDecay * 1.6;
        v += Math.sin(this.time * 6 + i * 0.2) * 0.3;
      } else {
        v = Math.sin(this.time * 4 + i * 0.3) * 0.15 + 0.1;
        v += Math.sin(this.time * 2.0 - i * 0.1) * 0.1;
        v += this.beatDecay * 0.15;
      }
      v = Math.max(0.04, v);
      this.bins[i].target = v;
      this.bins[i].value += (this.bins[i].target - this.bins[i].value) * 0.2;
    }
  }

  private _spawnRipple(radius: number, speed: number): void {
    this.ripples.push({ r: radius, alpha: 0.5, speed });
    if (this.ripples.length > 5) this.ripples.shift();
  }

  private _updateParticles(dt: number): void {
    const warp = 1.0 + this.beatDecay * 4.0 + this.megaBeatDecay * 6.0;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (p.type === ParticleType.DRIFT || p.type === ParticleType.ICON) {
        p.x += p.vx * dt;
        p.y += p.vy * dt * warp;
        if (p.y < -700) p.y = 700;
        if (p.x < -1000) p.x = 1000;
        if (p.x > 1000) p.x = -1000;
      } else if (p.type === ParticleType.ORBIT) {
        p.angle! += p.rotSpeed! * dt * (1.0 + this.beatDecay * 0.5);
        p.x = Math.cos(p.angle!) * p.dist!;
        p.y = Math.sin(p.angle!) * p.dist!;
      } else if (p.type === ParticleType.EXPLOSION) {
        p.x += p.vx * dt * 40;
        p.y += p.vy * dt * 40;
        p.life! -= dt * 1.8;
        p.alpha = p.life!;

        if (p.life! <= 0) {
          if (p.sprite && !p.sprite.destroyed) {
            p.sprite.destroy();
          }
          p.sprite = null;
          this.particles.splice(i, 1);
          continue;
        }
      }

      if (p.sprite && !p.sprite.destroyed) {
        p.sprite.x = p.x;
        p.sprite.y = p.y;
        p.sprite.alpha = p.alpha;
        p.sprite.rotation += dt * 0.5;
        const s = (p.baseScale || 1.0) * (1.0 + this.beatDecay * 0.4);
        p.sprite.scale.set(s);
      }
    }
  }

  private _updateWarpLines(): void {
    const pulseBoost = this.beatDecay * 65;
    for (const wl of this.warpLines) {
      wl.distance += wl.speed + pulseBoost;
      if (wl.distance > 1300) {
        wl.distance = 100 + Math.random() * 200;
        wl.angle = Math.random() * Math.PI * 2;
      }
    }
  }

  private _updateBlobs(dt: number): void {
    for (const b of this.blobs) {
      b.phase += dt * b.speed * (1.0 + this.beatDecay * 2.0);
      b.rotation += dt * b.rotSpeed * (1.0 + this.beatDecay);
      b.angle += dt * 0.1;
    }
  }

  private _updateRipples(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += r.speed * dt;
      r.alpha -= dt * 0.6;
      if (r.alpha <= 0) this.ripples.splice(i, 1);
    }
  }

  private _updateShake(dt: number): void {
    this.shakeDecay = Math.max(0, this.shakeDecay - dt * 5.0);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private _drawBackground(): void {
    this.bgGfx.clear();
    this.bgGfx
      .rect(-this.w * 0.5, -this.h * 0.5, this.w, this.h)
      .fill({ color: CRUST, alpha: 1.0 });
  }

  private _drawAura(): void {
    this.auraGfx.clear();
    const pulse = 1.0 + this.beatDecay * 0.25;
    const r = RADIUS * pulse;
    for (let i = 0; i < 3; i++) {
      const scale = 1.2 + i * 0.6;
      const alpha = (0.1 - i * 0.02) * this.beatDecay + 0.01;
      this.auraGfx.circle(0, 0, r * scale).fill({ color: MAUVE, alpha });
    }
  }

  private _drawCluster(): void {
    this.clusterGfx.clear();
    this.clusterOutlineGfx.clear();
    const beat = this.beatDecay;

    for (const b of this.blobs) {
      const x =
        Math.cos(b.angle) * b.dist +
        Math.sin(this.time * 0.3 + b.phase) * (40 + beat * 60);
      const y =
        Math.sin(b.angle) * b.dist +
        Math.cos(this.time * 0.25 + b.phase) * (40 + beat * 60);
      const r = b.radius * (1.0 + Math.sin(b.phase) * 0.15 + beat * 0.4);

      const points: { x: number; y: number }[] = [];
      const numPoints = 10;
      for (let i = 0; i < numPoints; i++) {
        const ang = (i / numPoints) * Math.PI * 2;
        const disto = beat * 35 * Math.sin(this.time * 15 + i * 3);
        const fluid = Math.sin(this.time * b.speed + ang * 3) * 12 + disto;
        const px = x + Math.cos(ang + b.rotation) * (r + fluid);
        const py = y + Math.sin(ang + b.rotation) * (r + fluid);
        points.push({ x: px, y: py });
      }

      this._renderBlobPath(this.clusterOutlineGfx, points, WHITE, 1.0);
      this._renderBlobPath(this.clusterGfx, points, b.color, b.alpha);
    }
  }

  private _drawVisualizer(): void {
    this.vizGfx.clear();
    this.ringGfx.clear();

    const beat = this.beatDecay;
    const breathe = 1.0 + Math.sin(this.time * 0.4) * 0.02;
    const r = RADIUS * breathe * (1.0 + beat * 0.12);

    // 1. Gooey Ring
    const ringRes = 32;
    for (let i = 0; i < ringRes; i++) {
      const ang = (i / ringRes) * Math.PI * 2 + this.time * 0.3;
      const binIdx = Math.floor((i / ringRes) * BAR_COUNT);
      const audioVal = this.bins[binIdx].value * 45;
      const bx = Math.cos(ang) * r;
      const by = Math.sin(ang) * r;
      const br =
        45 +
        audioVal +
        beat * 30 +
        Math.sin(this.time * 12 + i) * (8 + beat * 15);
      this.ringGfx
        .circle(bx, by, br)
        .stroke({ color: ROSEWATER, alpha: 0.9, width: 4 + beat * 4 });
      this.ringGfx.circle(bx, by, br).fill({ color: CRUST, alpha: 1.0 });
    }

    // 2. Gooey Audio Bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const v = this.bins[i].value;
      const distFromVertical = Math.abs(cos);
      const wave = Math.sin(angle * 3 + this.time * 1.5) * 0.08;
      const verticalBoost = 0.8 + (1.0 - distFromVertical + wave) * 0.5;
      const h = v * BAR_MAX_OUT * verticalBoost;
      const disp = Math.sin(angle * 6 + this.time * 1.8) * 2 * beat;

      const x1 = cos * (r + disp);
      const y1 = sin * (r + disp);
      const x2 = cos * (r + h + disp);
      const y2 = sin * (r + h + disp);

      this.vizGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({ color: WHITE, alpha: 0.9, width: BAR_W * 2.8 });
      this.vizGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({ color: WHITE, alpha: 0.9, width: BAR_W * 1.4 });
    }
  }

  private _renderBlobPath(
    gfx: Graphics,
    points: { x: number; y: number }[],
    color: number,
    alpha: number,
  ): void {
    const numPoints = points.length;
    gfx.beginPath();
    let midX = (points[0].x + points[numPoints - 1].x) / 2;
    let midY = (points[0].y + points[numPoints - 1].y) / 2;
    gfx.moveTo(midX, midY);
    for (let i = 0; i < numPoints; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % numPoints];
      midX = (p1.x + p2.x) / 2;
      midY = (p1.y + p2.y) / 2;
      gfx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }
    gfx.closePath();
    gfx.fill({ color, alpha });
  }

  private _drawWarpLines(): void {
    this.warpGfx.clear();
    const pulse = this.beatDecay;
    for (const wl of this.warpLines) {
      const x1 = Math.cos(wl.angle) * wl.distance;
      const y1 = Math.sin(wl.angle) * wl.distance;
      const stretch = wl.length * (1.0 + pulse * 5.5);
      const x2 = Math.cos(wl.angle) * (wl.distance + stretch);
      const y2 = Math.sin(wl.angle) * (wl.distance + stretch);
      this.warpGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          color: WHITE,
          alpha: wl.alpha * (0.5 + pulse * 1.2),
          width: 2.2 + pulse * 8,
        });
    }
  }

  private _drawRipples(): void {
    this.rippleGfx.clear();
    for (const r of this.ripples) {
      this.rippleGfx
        .circle(0, 0, r.r)
        .stroke({ color: WHITE, alpha: r.alpha * 0.3, width: 2 });
      this.rippleGfx
        .circle(0, 0, r.r + 15)
        .stroke({ color: MAUVE, alpha: r.alpha * 0.15, width: 8 });
    }
  }

  private _drawParticles(): void {
    this.particleGfx.clear();
    const beat = this.beatDecay;

    for (const p of this.particles) {
      const alpha = p.alpha * (1.0 + beat * 1.2);
      if (p.type === ParticleType.DRIFT) {
        const warp = beat * 18.0;
        if (warp > 2) {
          this.particleGfx
            .moveTo(p.x, p.y)
            .lineTo(p.x, p.y + warp)
            .stroke({ color: p.color, alpha, width: p.size });
        } else {
          this.particleGfx
            .circle(p.x, p.y, p.size)
            .fill({ color: p.color, alpha });
        }
      } else if (p.type === ParticleType.ORBIT) {
        this.particleGfx
          .circle(p.x, p.y, p.size * (1.0 + beat * 0.6))
          .fill({ color: p.color, alpha });
      } else if (p.type === ParticleType.EXPLOSION && !p.sprite) {
        this.particleGfx
          .circle(p.x, p.y, p.size)
          .fill({ color: p.color, alpha });
      }
    }
  }

  private _animateLogo(): void {
    if (
      !this.logoSprite ||
      !this.logoOutlineSprite ||
      this.logoSprite.destroyed
    )
      return;
    const beat = this.beatDecay;
    const punch = 1.0 + beat * 0.25 + this.megaBeatDecay * 0.12;
    const float = Math.sin(this.time * 0.7) * 8;
    this.logoSprite.scale.set(this.logoBaseScale * punch);
    this.logoSprite.y = float;
    this.logoOutlineSprite.scale.copyFrom(this.logoSprite.scale);
    this.logoOutlineSprite.y = this.logoSprite.y;
    if (this.megaBeatDecay > 0.7) {
      const sx = (Math.random() - 0.5) * 12 * this.megaBeatDecay;
      this.logoSprite.x = sx;
      this.logoOutlineSprite.x = sx;
    } else {
      this.logoSprite.x = 0;
      this.logoOutlineSprite.x = 0;
    }
    this.logoContainer.alpha = 1.0;
  }

  private _applyShake(): void {
    const sx = this.shakeX * this.shakeDecay;
    const sy = this.shakeY * this.shakeDecay;
    this.x = sx;
    this.y = sy;
  }
}
