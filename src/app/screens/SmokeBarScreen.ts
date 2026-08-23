import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { randRange as rnd } from "../../lib/math";

// ── Canvas ────────────────────────────────────────────────────────────────────
const W = 1920;
const H = 70;

// ── Smoke colors by y-tier ────────────────────────────────────────────────────
function smokeColor(y: number): number {
  const t = y / H;
  if (t > 0.8) return 0x11111b;
  if (t > 0.62) return 0x181825;
  if (t > 0.46) return 0x1e1e2e;
  if (t > 0.3) return 0x313244;
  if (t > 0.15) return 0x45475a;
  return 0x585b70;
}

// ── Soft-circle texture (created once, shared by all sprites) ─────────────────
// 64×64 radial gradient: opaque white centre → transparent edge
// This bakes in the soft-body look so we only need one sprite draw per puff.
const TEX_SIZE = 64;
const TEX_HALF = TEX_SIZE / 2;

function createSmokeTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    TEX_HALF,
    TEX_HALF,
    0,
    TEX_HALF,
    TEX_HALF,
    TEX_HALF,
  );
  grad.addColorStop(0.0, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.90)");
  grad.addColorStop(0.82, "rgba(255,255,255,0.40)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  return Texture.from(canvas);
}

// ── Scrolling text ────────────────────────────────────────────────────────────
// Title for the stream
const TEXT_STR =
  " Need for Speed™ Heat >>> smoking tires >  burning rubber > drifting corners >>> racing hard! >>>   ";
const SCROLL_PX_MS = 0.058;

// ── Wheel ─────────────────────────────────────────────────────────────────────
const WHEEL_R = 32;
const WHEEL_ROT_SPD = Math.PI * 2 * 3.5; // 3.5 rotations/sec

// ── Smoke particle ────────────────────────────────────────────────────────────
const MAX_PUFFS = 500;

interface Puff {
  x: number;
  y: number;
  vx: number;
  r: number;
  r0: number;
  rx: number;
  ry: number;
  wobbleA: number;
  wobbleF: number;
  wobbleP: number;
  life: number;
  lifeSpd: number;
  sprite: Sprite;
}

const TIERS = [
  {
    yLo: H * 0.4,
    yHi: H * 1.2,
    rLo: 20,
    rHi: 36,
    vxLo: 0.55,
    vxHi: 1.3,
    burst: [5, 9],
  },
  {
    yLo: H * 0.2,
    yHi: H * 0.65,
    rLo: 8,
    rHi: 18,
    vxLo: 0.8,
    vxHi: 2.0,
    burst: [4, 7],
  },
  {
    yLo: H * 0.0,
    yHi: H * 0.35,
    rLo: 2,
    rHi: 8,
    vxLo: 1.4,
    vxHi: 3.5,
    burst: [5, 10],
  },
] as const;

// ── Realistic cartoon alloy wheel ─────────────────────────────────────────────
function buildWheelGraphic(r: number): Graphics {
  const g = new Graphics();
  const ri = r * 0.615;
  const rd = r * 0.435;
  const hub = r * 0.195;

  // Tire body
  g.circle(0, 0, r).fill({ color: 0x0b0b12 });

  // Tread blocks
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const cos = Math.cos(a),
      sin = Math.sin(a);
    const rI = r - 5,
      rO = r + 2.5,
      hw = 3.6;
    g.poly([
      rI * cos + hw * sin,
      rI * sin - hw * cos,
      rI * cos - hw * sin,
      rI * sin + hw * cos,
      rO * cos - hw * sin,
      rO * sin + hw * cos,
      rO * cos + hw * sin,
      rO * sin - hw * cos,
    ]).fill({ color: 0x1e1e2e });
  }
  g.circle(0, 0, r + 1).stroke({ color: 0x06060c, width: 3 });

  // Sidewall
  g.circle(0, 0, ri + 3.5).fill({ color: 0x0e0e1a });
  g.circle(0, 0, ri + 3.5).stroke({ color: 0x06060c, width: 1.5 });

  // Brake disc
  g.circle(0, 0, rd).fill({ color: 0x252638 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cos = Math.cos(a),
      sin = Math.sin(a),
      hw = 1.4;
    g.poly([
      rd * 0.42 * cos + hw * sin,
      rd * 0.42 * sin - hw * cos,
      rd * 0.42 * cos - hw * sin,
      rd * 0.42 * sin + hw * cos,
      rd * 0.9 * cos - hw * sin,
      rd * 0.9 * sin + hw * cos,
      rd * 0.9 * cos + hw * sin,
      rd * 0.9 * sin - hw * cos,
    ]).fill({ color: 0x181826 });
  }

  // Rim face
  g.circle(0, 0, ri).fill({ color: 0x2e3045 });
  g.circle(0, 0, ri).stroke({ color: 0x6e7190, width: 2.2 });

  // 5 tapered spokes
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(a),
      sin = Math.sin(a);
    const px = -sin,
      py = cos;
    const rN = hub * 1.75,
      rF = ri * 0.88;
    const wN = ri * 0.195,
      wF = ri * 0.075;
    // Shadow half
    g.poly([
      cos * rN + px * wN * 0.05,
      sin * rN + py * wN * 0.05,
      cos * rN - px * wN,
      sin * rN - py * wN,
      cos * rF - px * wF,
      sin * rF - py * wF,
      cos * rF + px * wF * 0.05,
      sin * rF + py * wF * 0.05,
    ]).fill({ color: 0x23253a });
    // Main body
    g.poly([
      cos * rN + px * wN,
      sin * rN + py * wN,
      cos * rN - px * wN * 0.05,
      sin * rN - py * wN * 0.05,
      cos * rF - px * wF * 0.05,
      sin * rF - py * wF * 0.05,
      cos * rF + px * wF,
      sin * rF + py * wF,
    ]).fill({ color: 0x565978 });
    // Highlight
    const hn = wN * 0.45,
      hf = wF * 0.45;
    g.poly([
      cos * rN + px * hn,
      sin * rN + py * hn,
      cos * rN + px * hn * 0.1,
      sin * rN + py * hn * 0.1,
      cos * rF + px * hf * 0.1,
      sin * rF + py * hf * 0.1,
      cos * rF + px * hf,
      sin * rF + py * hf,
    ]).fill({ color: 0x8e91b8, alpha: 0.55 });
    // Outline
    g.poly([
      cos * rN + px * wN,
      sin * rN + py * wN,
      cos * rN - px * wN,
      sin * rN - py * wN,
      cos * rF - px * wF,
      sin * rF - py * wF,
      cos * rF + px * wF,
      sin * rF + py * wF,
    ]).stroke({ color: 0x191a28, width: 1 });
  }
  g.circle(0, 0, ri * 0.9).stroke({ color: 0x44465e, width: 1 });

  // Hub
  g.circle(0, 0, hub * 1.42).fill({ color: 0x3e4058 });
  g.circle(0, 0, hub * 1.42).stroke({ color: 0x6e7190, width: 1.5 });
  g.circle(0, 0, hub).fill({ color: 0x1c1d2c });
  g.circle(0, 0, hub).stroke({ color: 0x44465e, width: 1.2 });
  g.circle(0, 0, hub * 0.38).fill({ color: 0x565978 });

  return g;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class SmokeBarScreen extends Container {
  public static assetBundles: string[] = [];

  // Layers: backCont → frontCont → textCont → wheelCont
  // Smoke is fully behind text and wheel.
  private readonly backCont = new Container();
  private readonly frontCont = new Container();
  private readonly textCont = new Container();
  private readonly wheelCont = new Container();

  private smokeTexture: Texture | null = null;
  private readonly spritePool: Sprite[] = [];

  private puffs: Puff[] = [];
  private spawnTimer = 0;
  private readonly SPAWN_MS = 45;
  private scrollX = 0;
  private textW = 0;
  private screenW = 0;
  private ready = false;

  private readonly textStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "bold",
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 3, join: "round" },
  });

  constructor() {
    super();
    this.addChild(this.backCont);
    this.addChild(this.frontCont);
    this.addChild(this.textCont);
    this.addChild(this.wheelCont);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.smokeTexture = createSmokeTexture();
    this.buildWheel();
    this.buildText();
    this.seed();
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;
    this.wheelCont.rotation += WHEEL_ROT_SPD * (time.deltaMS / 1000);
    this.spawnTimer += time.deltaMS;
    while (this.spawnTimer >= this.SPAWN_MS && this.puffs.length < MAX_PUFFS) {
      this.spawnTimer -= this.SPAWN_MS;
      this.addCluster(rnd(-10, 12));
    }
    if (this.spawnTimer >= this.SPAWN_MS) this.spawnTimer = 0; // don't accumulate debt
    this.tick(time.deltaMS);
    this.scrollStep(time.deltaMS);
    this.syncSprites();
  }

  public resize(width: number, height: number): void {
    this.screenW = width;
    this.y = height - H;
    this.wheelCont.x = WHEEL_R;
    this.wheelCont.y = H / 2;
    if (this.ready) this.buildText();
  }

  // ── Sprite pool ───────────────────────────────────────────────────────────

  private acquire(): Sprite {
    const s = this.spritePool.pop() ?? new Sprite(this.smokeTexture!);
    s.anchor.set(0.5);
    return s;
  }

  private release(s: Sprite, front: boolean): void {
    (front ? this.frontCont : this.backCont).removeChild(s);
    this.spritePool.push(s);
  }

  // ── Emit ──────────────────────────────────────────────────────────────────

  private addCluster(spawnX: number, initLife = 0): void {
    for (const tier of TIERS) {
      if (this.puffs.length >= MAX_PUFFS) break;
      const n = Math.floor(rnd(tier.burst[0], tier.burst[1]));
      for (let i = 0; i < n && this.puffs.length < MAX_PUFFS; i++) {
        const r0 = rnd(tier.rLo, tier.rHi);
        const front = Math.random() < 0.38;
        const p: Puff = {
          x: spawnX + rnd(-8, 8),
          y: rnd(tier.yLo, tier.yHi),
          vx: rnd(tier.vxLo, tier.vxHi),
          r: r0,
          r0,
          rx: rnd(0.8, 1.25),
          ry: rnd(0.8, 1.25),
          wobbleA: rnd(1.5, 4.5),
          wobbleF: rnd(0.018, 0.05),
          wobbleP: rnd(0, Math.PI * 2),
          life: initLife,
          lifeSpd: rnd(0.00035, 0.0009),
          sprite: this.acquire(),
        };
        if (initLife > 0) {
          const frames = initLife / p.lifeSpd;
          p.x += p.vx * frames;
          p.r = Math.max(
            1.5,
            p.r0 * (1 - (p.x / ((this.screenW || W) * 0.9)) * 0.55),
          );
        }
        (front ? this.frontCont : this.backCont).addChild(p.sprite);
        this.puffs.push(p);
      }
    }
  }

  // ── Seed ──────────────────────────────────────────────────────────────────

  private seed(): void {
    const w = this.screenW || W;
    const steps = Math.ceil(w / 38);
    for (let i = 0; i <= steps && this.puffs.length < MAX_PUFFS; i++) {
      this.addCluster((i / steps) * w, (i / steps) * 0.65);
    }
  }

  // ── Wheel ─────────────────────────────────────────────────────────────────

  private buildWheel(): void {
    this.wheelCont.removeChildren();
    this.wheelCont.addChild(buildWheelGraphic(WHEEL_R));
    this.wheelCont.x = WHEEL_R;
    this.wheelCont.y = H / 2;
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  private buildText(): void {
    this.textCont.removeChildren().forEach((c) => (c as Text).destroy?.());
    const make = () => {
      const t = new Text({ text: TEXT_STR, style: this.textStyle });
      t.y = (H - t.height) / 2 + 10;
      return t;
    };
    const a = make(),
      b = make();
    this.textW = a.width;
    a.x = 0;
    b.x = this.textW;
    this.textCont.addChild(a, b);
    this.scrollX = 0;
  }

  private scrollStep(deltaMS: number): void {
    if (!this.textW) return;
    this.scrollX += SCROLL_PX_MS * deltaMS;
    if (this.scrollX >= this.textW) this.scrollX -= this.textW;
    const c = this.textCont.children;
    if (c.length >= 2) {
      c[0].x = -this.scrollX;
      c[1].x = this.textW - this.scrollX;
    }
  }

  // ── Physics ───────────────────────────────────────────────────────────────

  private tick(deltaMS: number): void {
    const dt = deltaMS / 16.67;
    const w = this.screenW || W;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += p.lifeSpd * dt;
      if (p.life >= 1 || p.x - p.r > w + 10) {
        this.release(p.sprite, p.sprite.parent === this.frontCont);
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.wobbleP += p.wobbleF * dt;
      p.y += Math.sin(p.wobbleP) * p.wobbleA * p.wobbleF * dt;
      p.r = Math.max(1.5, p.r0 * (1 - Math.min(1, p.x / (w * 0.9)) * 0.55));
    }
  }

  // ── Sync sprites (replaces Graphics clear+redraw) ─────────────────────────
  // No geometry rebuild — just update existing sprite properties.

  private syncSprites(): void {
    const w = this.screenW || W;
    const fade = w * 0.75;

    for (const p of this.puffs) {
      const leftFade = Math.min(1, (p.x + p.r) / 80);
      const rightFade =
        p.x <= fade ? 1.0 : 1.0 - ((p.x - fade) / (w - fade)) * 0.78;
      const alpha = leftFade * rightFade * (1 - p.life) * 0.88;

      const s = p.sprite;
      s.x = p.x;
      s.y = p.y;
      s.scale.x = (p.r * p.rx) / TEX_HALF;
      s.scale.y = (p.r * p.ry) / TEX_HALF;
      s.alpha = Math.max(0, alpha);
      s.tint = smokeColor(p.y);
    }
  }
}
