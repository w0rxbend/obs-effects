import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// Catppuccin Mocha
const C_BASE     = 0x1e1e2e;
const C_CRUST    = 0x11111b;

const ACCENT_COLORS = [
  0xcba6f7, // mauve
  0x89b4fa, // blue
  0x74c7ec, // sapphire
  0x89dceb, // sky
  0x94e2d5, // teal
  0xa6e3a1, // green
  0xb4befe, // lavender
  0xf5c2e7, // pink
] as const;

const STAR_COUNT   = 600;
const SPEED_BASE   = 0.4;   // base radial speed (fraction of half-diagonal per second)
const SPEED_ACCEL  = 2.8;   // speed multiplier applied as stars age (warp stretch factor)
const TRAIL_ALPHA  = 0.92;  // how much of the trail is retained each frame (fade comet tail)
const FADE_MARGIN  = 0.08;  // fraction of viewport where stars fade in/out at edge

interface Star {
  x: number;
  y: number;
  px: number;   // previous x (for streak rendering)
  py: number;   // previous y
  vx: number;   // normalised direction x
  vy: number;   // normalised direction y
  speed: number;
  size: number;
  color: number;
  age: number;  // 0–1 (born → dead)
  life: number; // total lifetime in seconds
}

function newStar(cx: number, cy: number, halfDiag: number): Star {
  const angle = Math.random() * Math.PI * 2;
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);

  // Birth point: small jitter around centre
  const spawnR = Math.random() * halfDiag * 0.04;
  const x = cx + vx * spawnR;
  const y = cy + vy * spawnR;

  return {
    x, y,
    px: x, py: y,
    vx, vy,
    speed: (0.5 + Math.random() * 0.5) * SPEED_BASE,
    size: 0.5 + Math.random() * 1.5,
    color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
    age: 0,
    life: 1.2 + Math.random() * 2.0,
  };
}

export class StarFieldScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bg  = new Graphics();
  private readonly gfx = new Graphics();

  private w = 800;
  private h = 600;

  private stars: Star[] = [];
  private time = 0;

  constructor() {
    super();
    this.addChild(this.bg);
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.spawnStars();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.spawnStars();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    const cx = this.w / 2;
    const cy = this.h / 2;
    const halfDiag = Math.hypot(cx, cy);

    // Draw background (solid each frame to clear previous gfx)
    this.bg.clear();
    this.bg.rect(0, 0, this.w, this.h).fill({ color: C_BASE });

    this.gfx.clear();

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];

      s.px = s.x;
      s.py = s.y;

      // Accelerate as star ages (warp stretch)
      const effectiveSpeed = s.speed * (1 + s.age * SPEED_ACCEL);
      s.x += s.vx * effectiveSpeed * halfDiag * dt;
      s.y += s.vy * effectiveSpeed * halfDiag * dt;
      s.age += dt / s.life;

      // Respawn when off-screen or life elapsed
      if (s.age >= 1 || s.x < -8 || s.x > this.w + 8 || s.y < -8 || s.y > this.h + 8) {
        this.stars[i] = newStar(cx, cy, halfDiag);
        continue;
      }

      // Fade in at birth, fade out near edge
      const distR = Math.hypot(s.x - cx, s.y - cy) / halfDiag;
      const edgeFade = 1 - Math.max(0, (distR - (1 - FADE_MARGIN)) / FADE_MARGIN);
      const birthFade = Math.min(1, s.age / 0.05);
      const alpha = birthFade * edgeFade;

      if (alpha <= 0) continue;

      // Streak width grows with speed
      const thickness = s.size * (1 + s.age * 3);

      this.gfx
        .moveTo(s.px, s.py)
        .lineTo(s.x, s.y)
        .stroke({ width: thickness, color: s.color, alpha, cap: "round" });

      // Bright dot at the head
      this.gfx
        .circle(s.x, s.y, thickness * 0.7)
        .fill({ color: s.color, alpha: alpha * 0.9 });
    }
  }

  private spawnStars(): void {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const halfDiag = Math.hypot(cx, cy);

    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = newStar(cx, cy, halfDiag);
      // Distribute initial ages so the screen isn't empty on first frame
      s.age = Math.random() * 0.9;
      s.x = cx + s.vx * s.age * s.life * s.speed * halfDiag;
      s.y = cy + s.vy * s.age * s.life * s.speed * halfDiag;
      s.px = s.x;
      s.py = s.y;
      this.stars.push(s);
    }
  }
}
