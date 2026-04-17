import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha accents ──────────────────────────────────────────────────
const PALETTE = [
  0xcba6f7,  // Mauve
  0x89b4fa,  // Blue
  0x74c7ec,  // Sapphire
  0x89dceb,  // Sky
  0x94e2d5,  // Teal
  0xa6e3a1,  // Green
  0xf9e2af,  // Yellow
  0xfab387,  // Peach
  0xeba0ac,  // Maroon
  0xf38ba8,  // Red
  0xf5c2e7,  // Pink
  0xf2cdcd,  // Flamingo
] as const;

function randColor(): number { return PALETTE[Math.floor(Math.random() * PALETTE.length)]; }

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ripple {
  x: number; y: number;
  r: number;           // current radius
  maxR: number;        // max radius before dying
  speed: number;       // px per tick
  alpha: number;
  width: number;
  color: number;
  // second inner ring (slight lag)
  r2: number; alpha2: number;
  // third innermost (more lag)
  r3: number; alpha3: number;
}

interface Splash {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  alpha: number;
  color: number;
}

interface Impact {
  x: number; y: number;
  r: number;
  alpha: number;
  color: number;
}

// ── Tuning ────────────────────────────────────────────────────────────────────
const DROP_INTERVAL_MIN = 4;    // frames between drops (min)
const DROP_INTERVAL_MAX = 14;
const SPLASH_N          = 9;    // particles per drop
const SPLASH_SPEED      = 3.8;
const GRAVITY           = 0.18;

export class RainScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx: Graphics;

  private ripples: Ripple[]  = [];
  private splashes: Splash[] = [];
  private impacts: Impact[]  = [];

  private W = 800;
  private H = 600;

  private dropTimer = 0;
  private nextDrop  = 0;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);
    this._scheduleNext();
  }

  // ── Drop spawn ────────────────────────────────────────────────────────────

  private _scheduleNext(): void {
    this.nextDrop = DROP_INTERVAL_MIN + Math.random() * (DROP_INTERVAL_MAX - DROP_INTERVAL_MIN);
  }

  private _spawnDrop(): void {
    const x     = 40 + Math.random() * (this.W - 80);
    const y     = 40 + Math.random() * (this.H - 80);
    const color = randColor();
    const maxR  = 55 + Math.random() * 90;
    const speed = 1.4 + Math.random() * 1.2;
    const w     = 1.2 + Math.random() * 1.4;

    // Three concentric rings per drop, inner rings lag behind outer
    this.ripples.push({
      x, y,
      r: 2, maxR, speed,
      alpha: 0.75, width: w,
      color,
      r2: 0,      alpha2: 0,
      r3: -8,     alpha3: 0,
    });

    // Impact flash
    this.impacts.push({ x, y, r: 0, alpha: 0.9, color });

    // Splash particles
    for (let i = 0; i < SPLASH_N; i++) {
      const angle = (i / SPLASH_N) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const spd   = SPLASH_SPEED * (0.5 + Math.random() * 0.8);
      this.splashes.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1.8,  // slight upward kick
        r: 1.2 + Math.random() * 1.8,
        alpha: 0.85,
        color,
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;

    this.dropTimer += dt;
    if (this.dropTimer >= this.nextDrop) {
      this.dropTimer = 0;
      // Occasionally spawn a cluster of 2-3 nearby drops (heavy rain burst)
      const burst = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 3) : 1;
      for (let b = 0; b < burst; b++) this._spawnDrop();
      this._scheduleNext();
    }

    this._updateRipples(dt);
    this._updateSplashes(dt);
    this._updateImpacts(dt);
    this._draw();
  }

  private _updateRipples(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.r  += rp.speed * dt;
      rp.r2 += rp.speed * dt;
      rp.r3 += rp.speed * dt;

      // Outer ring fades as it approaches maxR
      rp.alpha  = Math.max(0, 0.75 * (1 - rp.r  / rp.maxR));
      // Inner rings lag 12 and 24 px behind, start transparent and fade
      rp.alpha2 = rp.r2 > 0 ? Math.max(0, 0.55 * (1 - rp.r2 / (rp.maxR * 0.82))) : 0;
      rp.alpha3 = rp.r3 > 0 ? Math.max(0, 0.35 * (1 - rp.r3 / (rp.maxR * 0.65))) : 0;

      // Unlock inner rings with a delay
      if (rp.r > 12  && rp.r2 <= 0) rp.r2 = 2;
      if (rp.r > 24  && rp.r3 <= 0) rp.r3 = 2;

      if (rp.alpha <= 0 && rp.alpha2 <= 0 && rp.alpha3 <= 0) {
        this.ripples.splice(i, 1);
      }
    }
  }

  private _updateSplashes(dt: number): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const sp = this.splashes[i];
      sp.vy    += GRAVITY * dt;
      sp.x     += sp.vx * dt;
      sp.y     += sp.vy * dt;
      sp.alpha -= 0.028 * dt;
      if (sp.alpha <= 0) this.splashes.splice(i, 1);
    }
  }

  private _updateImpacts(dt: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.r    += 2.2 * dt;
      imp.alpha -= 0.055 * dt;
      if (imp.alpha <= 0) this.impacts.splice(i, 1);
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private _draw(): void {
    const g = this.gfx;
    g.clear();

    // Impact flashes
    for (const imp of this.impacts) {
      g.circle(imp.x, imp.y, imp.r);
      g.fill({ color: imp.color, alpha: imp.alpha * 0.45 });
      g.circle(imp.x, imp.y, imp.r);
      g.stroke({ color: imp.color, width: 1.5, alpha: imp.alpha * 0.80 });
    }

    // Ripple rings
    for (const rp of this.ripples) {
      if (rp.alpha3 > 0 && rp.r3 > 0) {
        g.circle(rp.x, rp.y, rp.r3);
        g.stroke({ color: rp.color, width: rp.width * 0.6, alpha: rp.alpha3 });
      }
      if (rp.alpha2 > 0 && rp.r2 > 0) {
        g.circle(rp.x, rp.y, rp.r2);
        g.stroke({ color: rp.color, width: rp.width * 0.8, alpha: rp.alpha2 });
      }
      // Outer ring — widest, most visible
      g.circle(rp.x, rp.y, rp.r);
      g.stroke({ color: rp.color, width: rp.width, alpha: rp.alpha });
      // Soft glow halo around outer ring
      g.circle(rp.x, rp.y, rp.r);
      g.stroke({ color: rp.color, width: rp.width + 6, alpha: rp.alpha * 0.12 });
    }

    // Splash particles
    for (const sp of this.splashes) {
      g.circle(sp.x, sp.y, sp.r);
      g.fill({ color: sp.color, alpha: sp.alpha });
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.W = width;
    this.H = height;
  }
}
