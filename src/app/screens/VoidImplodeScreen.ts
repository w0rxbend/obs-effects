import { BlurFilter, Container, Graphics } from "pixi.js";
import type { Ticker } from "pixi.js";
import { clamp, randRange as rand } from "../../lib/math";

const C = {
  crust: 0x11111b,
  surface1: 0x45475a,
  text: 0xcdd6f4,
  lavender: 0xb4befe,
  blue: 0x89b4fa,
  sapphire: 0x74c7ec,
  sky: 0x89dceb,
  teal: 0x94e2d5,
  peach: 0xfab387,
  pink: 0xf5c2e7,
  flamingo: 0xf2cdcd,
  rosewater: 0xf5e0dc,
  mauve: 0xcba6f7,
};

const PARTICLE_COLORS = [C.peach, C.pink, C.flamingo, C.rosewater, C.lavender];
const TENDRIL_COLORS = [C.lavender, C.sky, C.teal, C.blue, C.sapphire];

const N_PARTICLES = 250;
const TRAIL_LEN = 22;
const N_TENDRILS = 8;
const MAX_RINGS = 12;
const GRID_STEP = 80;
const GRID_SUB = 10;

interface TrailPt {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  angle: number;
  radius: number;
  radiusDecay: number;
  baseAngularVel: number;
  angularVel: number;
  size: number;
  color: number;
  trail: TrailPt[];
  age: number;
  maxAge: number;
  alpha: number;
}

interface Tendril {
  phaseOffset: number;
  length: number;
  color: number;
  width: number;
  snakeFreq: number;
  snakeAmp: number;
  rotSpeed: number;
}

interface Ring {
  r: number;
  maxR: number;
  speed: number;
  alpha: number;
  color: number;
  lineWidth: number;
  active: boolean;
}

export class VoidImplodeScreen extends Container {
  public static assetBundles: string[] = [];

  // Layer 1: warped spacetime grid
  private readonly gridGfx = new Graphics();
  // Layer 2: particle streams (trails + dots)
  private readonly particleGfx = new Graphics();
  // Layer 3: energy tendrils
  private readonly tendrilGfx = new Graphics();
  // Layer 4: shockwave rings
  private readonly ringGfx = new Graphics();
  // Layer 5: event horizon glow (static, alpha pulsed)
  private readonly glowContainer = new Container();
  private readonly glowGfx = new Graphics();
  // Layer 6: singularity core orb (redrawn each frame)
  private readonly coreContainer = new Container();
  private readonly coreGfx = new Graphics();
  // Layer 7: lens distortion disc (static)
  private readonly lensContainer = new Container();
  private readonly lensGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private cx = 960;
  private cy = 540;
  private t = 0;
  private frameCount = 0;
  private lastRingFrame = 0;
  private lastBurstFrame = -300;
  private lastInnerPulseFrame = -120;

  private readonly particles: Particle[] = [];
  private readonly tendrils: Tendril[] = [];
  private readonly rings: Ring[] = [];

  constructor() {
    super();

    this.addChild(this.gridGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.tendrilGfx);
    this.addChild(this.ringGfx);
    this.addChild(this.glowContainer);
    this.addChild(this.coreContainer);
    this.addChild(this.lensContainer);

    this.glowContainer.addChild(this.glowGfx);
    this.glowContainer.filters = [new BlurFilter({ strength: 28, quality: 3 })];

    this.coreContainer.addChild(this.coreGfx);
    this.coreContainer.filters = [
      new BlurFilter({ strength: 2.5, quality: 2 }),
    ];

    this.lensContainer.addChild(this.lensGfx);
    this.lensContainer.filters = [new BlurFilter({ strength: 8, quality: 2 })];

    for (let i = 0; i < MAX_RINGS; i++) {
      this.rings.push({
        r: 0,
        maxR: 420,
        speed: 2.2,
        alpha: 0,
        color: C.blue,
        lineWidth: 1.8,
        active: false,
      });
    }

    for (let i = 0; i < N_TENDRILS; i++) {
      this.tendrils.push({
        phaseOffset: (i / N_TENDRILS) * Math.PI * 2,
        length: rand(380, 600),
        color: TENDRIL_COLORS[i % TENDRIL_COLORS.length],
        width: rand(2.0, 3.5),
        snakeFreq: rand(2.5, 4.5),
        snakeAmp: rand(18, 40),
        rotSpeed: rand(0.003, 0.007),
      });
    }

    this.initParticles();
    this.buildGlow();
    this.buildLens();
  }

  private initParticles(): void {
    for (let i = 0; i < N_PARTICLES; i++) {
      const p = this.spawnParticle();
      p.radius = rand(50, 750);
      p.x = this.cx + Math.cos(p.angle) * p.radius;
      p.y = this.cy + Math.sin(p.angle) * p.radius;
      for (const pt of p.trail) {
        pt.x = p.x;
        pt.y = p.y;
      }
      p.age = Math.floor(rand(0, p.maxAge * 0.8));
      this.particles.push(p);
    }
  }

  private spawnParticle(): Particle {
    const angle = rand(0, Math.PI * 2);
    const radius = rand(180, 750);
    const x = this.cx + Math.cos(angle) * radius;
    const y = this.cy + Math.sin(angle) * radius;
    const sign = Math.random() < 0.6 ? 1 : -1;
    const baseAngularVel = rand(0.015, 0.045) * sign;
    return {
      x,
      y,
      angle,
      radius,
      radiusDecay: rand(0.993, 0.998),
      baseAngularVel,
      angularVel: baseAngularVel,
      size: rand(1.5, 4.5),
      color:
        PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      trail: Array.from({ length: TRAIL_LEN }, () => ({ x, y })),
      age: 0,
      maxAge: Math.floor(rand(200, 500)),
      alpha: 0,
    };
  }

  private respawnParticle(p: Particle): void {
    const fresh = this.spawnParticle();
    p.x = fresh.x;
    p.y = fresh.y;
    p.angle = fresh.angle;
    p.radius = fresh.radius;
    p.radiusDecay = fresh.radiusDecay;
    p.baseAngularVel = fresh.baseAngularVel;
    p.angularVel = fresh.angularVel;
    p.size = fresh.size;
    p.color = fresh.color;
    p.trail = fresh.trail;
    p.age = 0;
    p.maxAge = fresh.maxAge;
    p.alpha = 0;
  }

  private buildGlow(): void {
    const g = this.glowGfx;
    g.clear();
    const { cx, cy } = this;
    g.circle(cx, cy, 160).fill({ color: C.mauve, alpha: 0.06 });
    g.circle(cx, cy, 90).fill({ color: C.blue, alpha: 0.12 });
    g.circle(cx, cy, 45).fill({ color: C.lavender, alpha: 0.18 });
  }

  private buildLens(): void {
    const g = this.lensGfx;
    g.clear();
    const { cx, cy } = this;
    g.circle(cx, cy, 55).fill({ color: C.crust, alpha: 0.55 });
    g.circle(cx, cy, 58).stroke({ color: C.lavender, alpha: 0.15, width: 3 });
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.buildGlow();
    this.buildLens();
  }

  public update(ticker: Ticker): void {
    const delta = clamp(ticker.deltaTime, 0, 3);
    this.t += delta;
    this.frameCount++;
    this.updateParticles(delta);
    this.updateRings();
    this.draw();
  }

  private updateParticles(delta: number): void {
    for (const p of this.particles) {
      p.radius *= Math.pow(p.radiusDecay, delta);
      p.angularVel = p.baseAngularVel * (180 / (p.radius + 60));
      p.angle += p.angularVel * delta;
      p.x = this.cx + Math.cos(p.angle) * p.radius;
      p.y = this.cy + Math.sin(p.angle) * p.radius;

      p.alpha = Math.min(p.age / 30, 1) * Math.min((p.maxAge - p.age) / 40, 1);
      p.alpha *= clamp(p.radius / 200, 0, 1);

      for (let i = TRAIL_LEN - 1; i > 0; i--) {
        p.trail[i].x = p.trail[i - 1].x;
        p.trail[i].y = p.trail[i - 1].y;
      }
      p.trail[0].x = p.x;
      p.trail[0].y = p.y;

      p.age++;
      if (p.radius < 18 || p.age >= p.maxAge) this.respawnParticle(p);
    }
  }

  private updateRings(): void {
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.r += ring.speed;
      ring.speed += 0.015;
      ring.alpha = 0.75 * (1 - ring.r / ring.maxR);
      if (ring.r >= ring.maxR) ring.active = false;
    }

    if (this.frameCount - this.lastRingFrame >= 55) {
      this.lastRingFrame = this.frameCount;
      this.activateRing(
        420,
        2.2,
        0.75,
        this.frameCount % 2 === 0 ? C.blue : C.mauve,
        1.8,
      );
    }

    if (this.frameCount - this.lastBurstFrame >= 300) {
      this.lastBurstFrame = this.frameCount;
      for (let i = 0; i < 3; i++) {
        this.activateRing(
          420,
          2.2 + i * 0.3,
          0.75,
          i % 2 === 0 ? C.blue : C.mauve,
          1.8,
        );
      }
    }

    if (this.frameCount - this.lastInnerPulseFrame >= 120) {
      this.lastInnerPulseFrame = this.frameCount;
      this.activateRing(180, 4.5, 0.4, C.sapphire, 1.4);
      this.activateRing(180, 4.5, 0.4, C.sapphire, 1.4);
    }
  }

  private activateRing(
    maxR: number,
    speed: number,
    alpha: number,
    color: number,
    lineWidth: number,
  ): void {
    for (const ring of this.rings) {
      if (!ring.active) {
        ring.r = 0;
        ring.maxR = maxR;
        ring.speed = speed;
        ring.alpha = alpha;
        ring.color = color;
        ring.lineWidth = lineWidth;
        ring.active = true;
        return;
      }
    }
  }

  private draw(): void {
    this.drawGrid();
    this.drawParticles();
    this.drawTendrils();
    this.drawRings();
    this.drawCore();
    this.glowContainer.alpha = 0.75 + 0.25 * Math.sin(this.t * 0.035);
  }

  private warpVertex(gx: number, gy: number): { x: number; y: number } {
    const { t, cx, cy } = this;
    const dx = gx - cx;
    const dy = gy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

    const pullStrength = 18000 / (dist * dist + 2000);
    const pullX = -(dx / dist) * pullStrength;
    const pullY = -(dy / dist) * pullStrength;

    const swirlStrength = 6000 / (dist + 80);
    const angle = Math.atan2(dy, dx) + t * 0.004;
    const swirlX = (Math.cos(angle + Math.PI / 2) * swirlStrength * 30) / dist;
    const swirlY = (Math.sin(angle + Math.PI / 2) * swirlStrength * 30) / dist;

    const wave = Math.sin(dist * 0.018 - t * 0.07) * (120 / (dist + 60));
    const waveX = (dx / dist) * wave;
    const waveY = (dy / dist) * wave;

    return {
      x: gx + pullX + swirlX + waveX,
      y: gy + pullY + swirlY + waveY,
    };
  }

  private drawGrid(): void {
    const g = this.gridGfx;
    g.clear();
    const { w, h, cx, cy } = this;

    for (let gx = 0; gx <= w; gx += GRID_STEP) {
      const alpha = clamp(Math.abs(gx - cx) / 500, 0.05, 0.35);
      let first = true;
      for (let gy = 0; gy <= h; gy += GRID_SUB) {
        const v = this.warpVertex(gx, gy);
        if (first) {
          g.moveTo(v.x, v.y);
          first = false;
        } else {
          g.lineTo(v.x, v.y);
        }
      }
      g.stroke({ color: C.surface1, alpha, width: 1 });
    }

    for (let gy = 0; gy <= h; gy += GRID_STEP) {
      const alpha = clamp(Math.abs(gy - cy) / 500, 0.05, 0.35);
      let first = true;
      for (let gx = 0; gx <= w; gx += GRID_SUB) {
        const v = this.warpVertex(gx, gy);
        if (first) {
          g.moveTo(v.x, v.y);
          first = false;
        } else {
          g.lineTo(v.x, v.y);
        }
      }
      g.stroke({ color: C.surface1, alpha, width: 1 });
    }
  }

  private drawParticles(): void {
    const g = this.particleGfx;
    g.clear();

    for (const p of this.particles) {
      if (p.alpha < 0.01) continue;

      // trail[0] = newest (head), trail[TRAIL_LEN-1] = oldest (tail)
      for (let i = TRAIL_LEN - 1; i >= 1; i--) {
        const frac = 1 - i / TRAIL_LEN; // 0 at tail, ~1 near head
        const trailAlpha = frac * frac * p.alpha;
        if (trailAlpha < 0.01) continue;
        const segWidth = 0.1 + 1.7 * frac;
        g.moveTo(p.trail[i].x, p.trail[i].y)
          .lineTo(p.trail[i - 1].x, p.trail[i - 1].y)
          .stroke({ color: p.color, alpha: trailAlpha, width: segWidth });
      }

      g.circle(p.x, p.y, p.size * 2.5).fill({
        color: p.color,
        alpha: p.alpha * 0.15,
      });
      g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      g.circle(p.x, p.y, p.size * 0.4).fill({
        color: C.text,
        alpha: p.alpha * 0.6,
      });
    }
  }

  private drawTendrils(): void {
    const g = this.tendrilGfx;
    g.clear();
    const { cx, cy, t } = this;
    const N = 60;

    for (const td of this.tendrils) {
      const baseAngle = t * td.rotSpeed + td.phaseOffset;
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.04 + td.phaseOffset);

      for (let i = 0; i < N - 1; i++) {
        const s0 = i / (N - 1);
        const s1 = (i + 1) / (N - 1);

        const sa0 = baseAngle + s0 * 1.8;
        const r0 = td.length * (1 - s0);
        const w0 =
          Math.sin(s0 * td.snakeFreq * Math.PI + t * 0.05) * td.snakeAmp * s0;
        const px0 = cx + Math.cos(sa0) * r0 + Math.cos(sa0 + Math.PI / 2) * w0;
        const py0 = cy + Math.sin(sa0) * r0 + Math.sin(sa0 + Math.PI / 2) * w0;

        const sa1 = baseAngle + s1 * 1.8;
        const r1 = td.length * (1 - s1);
        const w1 =
          Math.sin(s1 * td.snakeFreq * Math.PI + t * 0.05) * td.snakeAmp * s1;
        const px1 = cx + Math.cos(sa1) * r1 + Math.cos(sa1 + Math.PI / 2) * w1;
        const py1 = cy + Math.sin(sa1) * r1 + Math.sin(sa1 + Math.PI / 2) * w1;

        const segAlpha = (1 - s0) * 0.65 * pulse;
        const segWidth = td.width * (1 - s0 * 0.7);
        g.moveTo(px0, py0)
          .lineTo(px1, py1)
          .stroke({ color: td.color, alpha: segAlpha, width: segWidth });
      }
    }
  }

  private drawRings(): void {
    const g = this.ringGfx;
    g.clear();
    const { cx, cy } = this;
    for (const ring of this.rings) {
      if (!ring.active || ring.alpha < 0.01 || ring.r < 1) continue;
      g.circle(cx, cy, ring.r).stroke({
        color: ring.color,
        alpha: ring.alpha,
        width: ring.lineWidth,
      });
    }
  }

  private drawCore(): void {
    const g = this.coreGfx;
    g.clear();
    const { cx, cy, t } = this;

    g.circle(cx, cy, 28).fill({ color: C.blue, alpha: 0.3 });
    g.circle(cx, cy, 14).fill({ color: C.mauve, alpha: 0.7 });
    g.circle(cx, cy, 6).fill({ color: C.text, alpha: 0.95 });

    const pulse = 1 + 0.18 * Math.sin(t * 0.12) + 0.08 * Math.sin(t * 0.31);
    g.scale.set(pulse);
    g.pivot.set(cx, cy);
    g.position.set(cx, cy);
  }
}
