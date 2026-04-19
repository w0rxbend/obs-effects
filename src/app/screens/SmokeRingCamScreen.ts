import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

const W          = 800;
const H          = 800;
const CX         = W / 2;
const CY         = H / 2;
const CAM_R      = 220;
const BAND_INNER = 200;
const BAND_OUTER = 320;

// Catppuccin Mocha achromatic shades — no hue, pure dark smoke
const CRUST    = 0x11111b;
const MANTLE   = 0x181825;
const BASE_CLR = 0x1e1e2e;
const SURFACE0 = 0x313244;
const SURFACE1 = 0x45475a;

const MAIN_COUNT       = 300;
const OUTER_WISP_COUNT = 60;
const INNER_WISP_COUNT = 40;
const TEX_SIZE         = 128;
const TEX_HALF         = TEX_SIZE / 2;

type ParticleType = "main" | "outer" | "inner";

interface Particle {
  sprite:     Sprite;
  type:       ParticleType;
  angle:      number;
  baseRadius: number;
  angSpeed:   number;  // rad/ms, clockwise = positive
  eddyAmp:    number;
  eddyFreq:   number;
  eddyPhase:  number;
  radAmp:     number;
  radFreq:    number;
  radPhase:   number;
  scaleMin:   number;
  scaleMax:   number;
  scaleFreq:  number;
  scalePhase: number;
  color:      number;
  maxAlpha:   number;
  life:       number;
  maxLife:    number;
  baseSize:   number;
  driftDir:   number;
  driftSpeed: number;
}

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function colorForSize(size: number): { color: number; maxAlpha: number } {
  if (size >= 38) return { color: CRUST,    maxAlpha: 0.85 };
  if (size >= 32) return { color: MANTLE,   maxAlpha: rnd(0.65, 0.75) };
  if (size >= 24) return { color: BASE_CLR, maxAlpha: rnd(0.45, 0.60) };
  if (size >= 14) return { color: SURFACE0, maxAlpha: rnd(0.25, 0.40) };
  return               { color: SURFACE1, maxAlpha: rnd(0.10, 0.20) };
}

function lifeFactor(life: number, maxLife: number): number {
  const t = life / maxLife;
  if (t < 0.15) return t / 0.15;
  if (t > 0.85) return (1 - t) / 0.15;
  return 1.0;
}

function createSmokeTexture(): Texture {
  const canvas  = document.createElement("canvas");
  canvas.width  = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx  = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(TEX_HALF, TEX_HALF, 0, TEX_HALF, TEX_HALF, TEX_HALF);
  grad.addColorStop(0.00, "rgba(255,255,255,1.00)");
  grad.addColorStop(0.40, "rgba(255,255,255,0.82)");
  grad.addColorStop(0.70, "rgba(255,255,255,0.40)");
  grad.addColorStop(0.88, "rgba(255,255,255,0.10)");
  grad.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  return Texture.from(canvas);
}

export class SmokeRingCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly ambientLayer = new Container();
  private readonly smokeLayer   = new Container();
  private readonly wispLayer    = new Container();

  private texture!: Texture;
  private pool:     Sprite[]    = [];
  private particles: Particle[] = [];

  private elapsed = 0;
  private ready   = false;

  constructor() {
    super();
    this.addChild(this.ambientLayer);
    this.addChild(this.smokeLayer);
    this.addChild(this.wispLayer);
  }

  public async show(): Promise<void> {
    this.texture = createSmokeTexture();
    this.buildAmbient();
    this.seed();
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;
    this.elapsed += time.deltaMS;
    this.tick(time.deltaMS);
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width  - W) / 2);
    this.y = Math.round((height - H) / 2);
  }

  // ── Ambient depth ─────────────────────────────────────────────────────────

  private buildAmbient(): void {
    const g = new Graphics();
    for (let r = CAM_R; r <= 340; r += 4) {
      const t     = (r - CAM_R) / (340 - CAM_R);
      const alpha = 0.08 * (1 - t * 0.5);
      g.circle(CX, CY, r).stroke({ color: SURFACE0, alpha, width: 5 });
    }
    this.ambientLayer.addChild(g);
  }

  // ── Sprite pool ───────────────────────────────────────────────────────────

  private acquire(layer: Container): Sprite {
    const s = this.pool.pop() ?? new Sprite(this.texture);
    s.anchor.set(0.5);
    layer.addChild(s);
    return s;
  }

  private release(p: Particle): void {
    p.sprite.parent?.removeChild(p.sprite);
    this.pool.push(p.sprite);
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────

  private spawnMain(initLife = 0): Particle {
    const baseSize              = rnd(18, 45);
    const { color, maxAlpha }   = colorForSize(baseSize);
    return {
      sprite:     this.acquire(this.smokeLayer),
      type:       "main",
      angle:      rnd(0, Math.PI * 2),
      baseRadius: rnd(BAND_INNER + baseSize * 0.3, BAND_OUTER - baseSize * 0.3),
      angSpeed:   rnd(0.00006, 0.00022),
      eddyAmp:    rnd(0.00003, 0.00014),
      eddyFreq:   rnd(0.00030, 0.00100),
      eddyPhase:  rnd(0, Math.PI * 2),
      radAmp:     rnd(6, 20),
      radFreq:    rnd(0.00030, 0.00090),
      radPhase:   rnd(0, Math.PI * 2),
      scaleMin:   rnd(0.72, 0.90),
      scaleMax:   rnd(1.00, 1.22),
      scaleFreq:  rnd(0.00020, 0.00070),
      scalePhase: rnd(0, Math.PI * 2),
      color,
      maxAlpha,
      life:       initLife,
      maxLife:    rnd(3000, 6000),
      baseSize,
      driftDir:   0,
      driftSpeed: 0,
    };
  }

  private spawnOuterWisp(): Particle {
    const baseSize = rnd(6, 14);
    return {
      sprite:     this.acquire(this.wispLayer),
      type:       "outer",
      angle:      rnd(0, Math.PI * 2),
      baseRadius: rnd(BAND_OUTER - 8, BAND_OUTER + 5),
      angSpeed:   rnd(0.00004, 0.00016),
      eddyAmp: 0, eddyFreq: 0, eddyPhase: 0,
      radAmp:  0, radFreq:  0, radPhase:  0,
      scaleMin:   0.80,
      scaleMax:   1.10,
      scaleFreq:  rnd(0.00030, 0.00080),
      scalePhase: rnd(0, Math.PI * 2),
      color:      SURFACE1,
      maxAlpha:   rnd(0.10, 0.22),
      life:       0,
      maxLife:    rnd(2000, 4000),
      baseSize,
      driftDir:   1,
      driftSpeed: rnd(0.004, 0.012),
    };
  }

  private spawnInnerWisp(): Particle {
    const baseSize = rnd(4, 10);
    return {
      sprite:     this.acquire(this.wispLayer),
      type:       "inner",
      angle:      rnd(0, Math.PI * 2),
      baseRadius: rnd(CAM_R - 8, CAM_R + 6),
      angSpeed:   rnd(0.00005, 0.00018),
      eddyAmp: 0, eddyFreq: 0, eddyPhase: 0,
      radAmp:  0, radFreq:  0, radPhase:  0,
      scaleMin:   0.70,
      scaleMax:   1.00,
      scaleFreq:  rnd(0.00030, 0.00080),
      scalePhase: rnd(0, Math.PI * 2),
      color:      SURFACE1,
      maxAlpha:   rnd(0.08, 0.18),
      life:       0,
      maxLife:    rnd(1500, 3000),
      baseSize,
      driftDir:   -1,
      driftSpeed: rnd(0.003, 0.008),
    };
  }

  // ── Seed initial population ───────────────────────────────────────────────

  private seed(): void {
    for (let i = 0; i < MAIN_COUNT; i++) {
      this.particles.push(this.spawnMain(rnd(0, 5999)));
    }
    for (let i = 0; i < OUTER_WISP_COUNT; i++) {
      const p = this.spawnOuterWisp();
      p.life  = rnd(0, p.maxLife);
      this.particles.push(p);
    }
    for (let i = 0; i < INNER_WISP_COUNT; i++) {
      const p = this.spawnInnerWisp();
      p.life  = rnd(0, p.maxLife);
      this.particles.push(p);
    }
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  private tick(deltaMS: number): void {
    const t = this.elapsed;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += deltaMS;

      if (p.life >= p.maxLife) {
        this.release(p);
        let np: Particle;
        if      (p.type === "outer") np = this.spawnOuterWisp();
        else if (p.type === "inner") np = this.spawnInnerWisp();
        else                          np = this.spawnMain();
        this.particles[i] = np;
        continue;
      }

      const lf  = lifeFactor(p.life, p.maxLife);
      const spd = p.angSpeed + p.eddyAmp * Math.sin(p.eddyPhase + p.eddyFreq * t);
      p.angle  += spd * deltaMS;

      let r = p.baseRadius + p.radAmp * Math.sin(p.radPhase + p.radFreq * t);
      if (p.driftDir !== 0) {
        r += p.driftDir * p.driftSpeed * p.life;
      }

      const st = 0.5 + 0.5 * Math.sin(p.scalePhase + p.scaleFreq * t);
      const sc = p.scaleMin + (p.scaleMax - p.scaleMin) * st;

      const s = p.sprite;
      s.x     = CX + Math.cos(p.angle) * r;
      s.y     = CY + Math.sin(p.angle) * r;
      s.alpha = p.maxAlpha * lf;
      s.tint  = p.color;
      s.scale.set((p.baseSize * sc) / TEX_HALF);
    }
  }
}
