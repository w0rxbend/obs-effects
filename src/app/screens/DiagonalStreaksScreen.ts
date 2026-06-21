import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { obsAudio } from "../../lib";

// ── Diagonal Streaks ─────────────────────────────────────────────────────────
// Endless field of rounded "speed line" capsules drifting along a fixed
// diagonal axis. Motion is computed in an oriented (u, w) space so the field
// tiles perfectly and loops forever with no visible seam or pop-in.

const PALETTE = [
  0xff3b30, // red
  0xff2d6f, // hot pink
  0xff6b8a, // soft coral
  0x7c3aed, // violet
  0x5b21b6, // deep violet
  0x2dd4bf, // teal
];

interface StreakPalette {
  colors: number[];
  background: number;
}

interface Streak {
  u: number; // position along the motion axis
  w: number; // lane offset across the motion axis (fixed)
  len: number;
  width: number;
  color: number;
  alpha: number;
  speed: number; // px/sec along u
  twinklePhase: number;
  twinkleRate: number;
  depth: number;
}

export class DiagonalStreaksScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private readonly streaks: Streak[] = [];

  // Motion axis (unit). Streaks slope up-to-the-right and drift down-left.
  private readonly axisAngle = (-32 * Math.PI) / 180;
  private readonly ux = Math.cos(this.axisAngle);
  private readonly uy = Math.sin(this.axisAngle);
  // Perpendicular (lane) axis.
  private readonly wx = -this.uy;
  private readonly wy = this.ux;

  // Oriented bounds covering the viewport, recomputed on resize.
  private uMin = 0;
  private uSpan = 1;
  private wMin = 0;
  private wSpan = 1;
  private margin = 400;
  private seeded = false;
  private time = 0;
  private beatPulse = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    if (this.audioReactive) void obsAudio.connect();
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  protected get palette(): StreakPalette {
    return {
      colors: PALETTE,
      background: 0x05060a,
    };
  }

  protected get streakCount(): number {
    return 320;
  }

  protected get audioReactive(): boolean {
    return false;
  }

  protected get speedScale(): number {
    return 1;
  }

  protected get widthScale(): number {
    return 1;
  }

  protected get alphaScale(): number {
    return 1;
  }

  public resize(width: number, height: number): void {
    // Longest possible streak is the diagonal-ish; pad the oriented bounds so
    // capsules fully clear the screen before wrapping.
    this.margin = Math.max(width, height) * 0.25;

    // Project the four screen corners onto the oriented axes.
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    let uMin = Infinity;
    let uMax = -Infinity;
    let wMin = Infinity;
    let wMax = -Infinity;
    for (const [cx, cy] of corners) {
      const u = cx * this.ux + cy * this.uy;
      const w = cx * this.wx + cy * this.wy;
      uMin = Math.min(uMin, u);
      uMax = Math.max(uMax, u);
      wMin = Math.min(wMin, w);
      wMax = Math.max(wMax, w);
    }
    this.uMin = uMin - this.margin;
    this.uSpan = uMax - uMin + this.margin * 2;
    this.wMin = wMin - this.margin;
    this.wSpan = wMax - wMin + this.margin * 2;

    if (!this.seeded) {
      this.seed();
      this.seeded = true;
    } else {
      // Re-spread lanes so density stays even after a resize.
      for (const s of this.streaks) {
        s.u = this.uMin + Math.random() * this.uSpan;
        s.w = this.wMin + Math.random() * this.wSpan;
      }
    }
  }

  private seed(): void {
    this.streaks.length = 0;
    const count = this.streakCount;
    const colors = this.palette.colors;
    for (let i = 0; i < count; i++) {
      // Three parallax depth bands: far (slow/thin/dim) → near (fast/bold).
      const depth = Math.random();
      const len = 60 + depth * depth * 520 + Math.random() * 80;
      const width = 4 + depth * 18;
      const speed = 90 + depth * 360;
      const alpha = 0.28 + depth * 0.62;
      this.streaks.push({
        u: this.uMin + Math.random() * this.uSpan,
        w: this.wMin + Math.random() * this.wSpan,
        len,
        width,
        color: colors[(Math.random() * colors.length) | 0],
        alpha,
        speed,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleRate: 0.4 + Math.random() * 1.4,
        depth,
      });
    }
    // Draw nearer (faster) streaks on top.
    this.streaks.sort((a, b) => a.speed - b.speed);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    if (this.audioReactive) obsAudio.update(dt);

    const level = this.audioReactive ? obsAudio.level : 0;
    const bass = this.audioReactive ? obsAudio.bass : 0;
    const mid = this.audioReactive ? obsAudio.mid : 0;
    const high = this.audioReactive ? obsAudio.high : 0;
    if (this.audioReactive && obsAudio.beat) this.beatPulse = 1;
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4.8);

    const speedBoost = this.audioReactive
      ? 1 + level * 1.4 + bass * 1.1 + this.beatPulse * 1.2
      : 1;
    const widthBoost = this.audioReactive ? 1 + bass * 0.75 : 1;
    const alphaBoost = this.audioReactive ? 1 + mid * 0.75 + high * 0.45 : 1;
    const laneJitter = this.audioReactive
      ? Math.sin(this.time * (3.2 + high * 4)) * high * 18
      : 0;

    const g = this.gfx;
    g.clear();
    g.rect(0, 0, window.innerWidth, window.innerHeight).fill({
      color: this.palette.background,
      alpha: this.audioReactive ? 0.16 + level * 0.22 : 0,
    });

    const uEnd = this.uMin + this.uSpan;
    const halfU = this.ux;
    const halfV = this.uy;

    for (const s of this.streaks) {
      // Drift down-left along the motion axis, wrapping seamlessly.
      s.u -= s.speed * this.speedScale * speedBoost * dt;
      if (s.u < this.uMin) s.u += this.uSpan;
      else if (s.u > uEnd) s.u -= this.uSpan;

      s.twinklePhase += s.twinkleRate * (1 + high * 2.2) * dt;

      const audioWave =
        this.audioReactive && s.depth > 0.42
          ? Math.sin(this.time * (2.2 + s.depth * 4.5) + s.twinklePhase) *
            laneJitter *
            s.depth
          : 0;
      const cx = s.u * this.ux + (s.w + audioWave) * this.wx;
      const cy = s.u * this.uy + (s.w + audioWave) * this.wy;
      const h =
        s.len * (0.5 + (this.audioReactive ? bass * 0.18 * s.depth : 0));
      const x1 = cx - halfU * h;
      const y1 = cy - halfV * h;
      const x2 = cx + halfU * h;
      const y2 = cy + halfV * h;

      const flicker =
        0.82 +
        0.18 * Math.sin(s.twinklePhase) +
        (this.audioReactive ? high * 0.22 + this.beatPulse * 0.2 : 0);

      g.moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          width: s.width * this.widthScale * widthBoost,
          color: s.color,
          alpha: Math.min(1, s.alpha * this.alphaScale * alphaBoost * flicker),
          cap: "round",
        });
    }
  }
}

export class RazerDiagonalStreaksScreen extends DiagonalStreaksScreen {
  protected override get palette(): StreakPalette {
    return {
      background: 0x000800,
      colors: [0x44ff00, 0x7cff2a, 0x00ff66, 0xb6ff00, 0x1eff00],
    };
  }

  protected override get audioReactive(): boolean {
    return true;
  }
}

export class CyanDiagonalStreaksScreen extends DiagonalStreaksScreen {
  protected override get palette(): StreakPalette {
    return {
      background: 0x02080d,
      colors: [0x00e5ff, 0x4df8ff, 0x0a84ff, 0x80ffea, 0xffffff],
    };
  }

  protected override get audioReactive(): boolean {
    return true;
  }
}

export class MagentaDiagonalStreaksScreen extends DiagonalStreaksScreen {
  protected override get palette(): StreakPalette {
    return {
      background: 0x0b0209,
      colors: [0xff2bd6, 0xff007a, 0xff6bd5, 0xb026ff, 0xffffff],
    };
  }

  protected override get audioReactive(): boolean {
    return true;
  }
}

export class AmberDiagonalStreaksScreen extends DiagonalStreaksScreen {
  protected override get palette(): StreakPalette {
    return {
      background: 0x0d0600,
      colors: [0xffb000, 0xff6a00, 0xfff066, 0xff2f00, 0xffffff],
    };
  }

  protected override get audioReactive(): boolean {
    return true;
  }
}

export class UltravioletDiagonalStreaksScreen extends DiagonalStreaksScreen {
  protected override get palette(): StreakPalette {
    return {
      background: 0x05030d,
      colors: [0x9b5cff, 0x6d28d9, 0xf0abfc, 0x38bdf8, 0xffffff],
    };
  }

  protected override get audioReactive(): boolean {
    return true;
  }

  protected override get streakCount(): number {
    return 360;
  }
}

export class WhiteoutDiagonalStreaksScreen extends DiagonalStreaksScreen {
  protected override get palette(): StreakPalette {
    return {
      background: 0x030506,
      colors: [0xffffff, 0xd8fbff, 0x9ee7ff, 0x7dd3fc, 0xe5e7eb],
    };
  }

  protected override get audioReactive(): boolean {
    return true;
  }

  protected override get alphaScale(): number {
    return 0.82;
  }
}
