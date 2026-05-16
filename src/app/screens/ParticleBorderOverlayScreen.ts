import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const C_CYAN = 0x00e5ff;
const C_PURPLE = 0xb060ff;
const C_TEAL = 0x40ffcc;
const C_VIOLET = 0x8840ff;
const C_WHITE = 0xfff8f0;

const PALETTE = [C_CYAN, C_CYAN, C_PURPLE, C_TEAL, C_VIOLET, C_WHITE];

const POOL_SIZE = 600;
const BORDER_ZONE = 180; // max depth from edge for spawn and alpha falloff
const DRIFT_IN = 12; // base inward drift speed px/s
const NOISE_STR = 16; // lateral sinusoidal noise amplitude
const LIFE_MIN = 5;
const LIFE_MAX = 10;
const SPAWN_RATE = 50; // particles per second

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  noisePhase: number;
  color: number;
  age: number;
  maxAge: number;
  edge: 0 | 1 | 2 | 3; // 0=top 1=right 2=bottom 3=left
  active: boolean;
}

export class ParticleBorderOverlayScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly glowGfx = new Graphics();
  private readonly coreGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;
  private spawnAccum = 0;

  private readonly pool: Particle[] = [];

  constructor() {
    super();
    this.glowGfx.blendMode = "add";
    this.addChild(this.glowGfx);
    this.addChild(this.coreGfx);

    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 0,
        phase: 0,
        noisePhase: 0,
        color: C_CYAN,
        age: 0,
        maxAge: 1,
        edge: 0,
        active: false,
      });
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    // Warm-start: pre-age 65% of the pool so the overlay is full on first frame
    for (let i = 0; i < Math.floor(POOL_SIZE * 0.65); i++) {
      this.spawnParticle(this.pool[i]);
      this.pool[i].age = Math.random() * this.pool[i].maxAge * 0.6;
    }
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this.spawnAccum += SPAWN_RATE * dt;
    const toSpawn = Math.floor(this.spawnAccum);
    this.spawnAccum -= toSpawn;

    let spawned = 0;
    for (let i = 0; i < POOL_SIZE && spawned < toSpawn; i++) {
      if (!this.pool[i].active) {
        this.spawnParticle(this.pool[i]);
        spawned++;
      }
    }

    this.updateParticles(dt);
    this.draw();
  }

  private spawnParticle(p: Particle): void {
    const { w, h } = this;
    const edge = ((Math.random() * 4) | 0) as 0 | 1 | 2 | 3;
    const depth = Math.random() * BORDER_ZONE * 0.45;
    const lateral = Math.random();
    const speed = DRIFT_IN * (0.4 + Math.random() * 0.6);

    p.edge = edge;
    p.r = 2.5 + Math.random() * 4.5;
    p.phase = Math.random() * Math.PI * 2;
    p.noisePhase = Math.random() * Math.PI * 2;
    p.color = PALETTE[(Math.random() * PALETTE.length) | 0];
    p.age = 0;
    p.maxAge = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
    p.active = true;

    if (edge === 0) {
      p.x = lateral * w;
      p.y = depth;
      p.vx = (Math.random() - 0.5) * NOISE_STR;
      p.vy = speed;
    } else if (edge === 1) {
      p.x = w - depth;
      p.y = lateral * h;
      p.vx = -speed;
      p.vy = (Math.random() - 0.5) * NOISE_STR;
    } else if (edge === 2) {
      p.x = lateral * w;
      p.y = h - depth;
      p.vx = (Math.random() - 0.5) * NOISE_STR;
      p.vy = -speed;
    } else {
      p.x = depth;
      p.y = lateral * h;
      p.vx = speed;
      p.vy = (Math.random() - 0.5) * NOISE_STR;
    }
  }

  private updateParticles(dt: number): void {
    const { w, h } = this;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }

      const lateral = Math.sin(p.noisePhase + this.time * 0.55) * NOISE_STR;
      if (p.edge === 0 || p.edge === 2) {
        p.x += (p.vx + lateral) * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += (p.vy + lateral) * dt;
      }

      p.x = Math.max(0, Math.min(w, p.x));
      p.y = Math.max(0, Math.min(h, p.y));
    }
  }

  private draw(): void {
    const { w, h } = this;
    const gg = this.glowGfx;
    const cg = this.coreGfx;
    gg.clear();
    cg.clear();

    for (const p of this.pool) {
      if (!p.active) continue;

      // Lifecycle fade: 0..12% ramp in, 12..72% plateau, 72..100% fade out
      const t = p.age / p.maxAge;
      const fade = t < 0.12 ? t / 0.12 : t > 0.72 ? (1 - t) / 0.28 : 1;
      if (fade < 0.01) continue;

      // Alpha falloff as particle drifts away from its birth edge
      let edgeDist: number;
      if (p.edge === 0) edgeDist = p.y;
      else if (p.edge === 1) edgeDist = w - p.x;
      else if (p.edge === 2) edgeDist = h - p.y;
      else edgeDist = p.x;
      const edgeA = Math.pow(Math.max(0, 1 - edgeDist / BORDER_ZONE), 0.55);

      const pulse = 0.7 + Math.sin(this.time * 1.4 + p.phase) * 0.3;
      const a = fade * edgeA * pulse;
      if (a < 0.01) continue;

      // Additive glow layer — large soft halos
      gg.circle(p.x, p.y, p.r * 7 * pulse).fill({
        color: p.color,
        alpha: a * 0.04,
      });
      gg.circle(p.x, p.y, p.r * 3).fill({ color: p.color, alpha: a * 0.16 });

      // Normal-blend core layer
      cg.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: a * 0.85 });
      cg.circle(p.x, p.y, p.r * 0.38).fill({ color: C_WHITE, alpha: a * 0.72 });
    }
  }
}
