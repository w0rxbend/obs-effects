import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

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

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

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
    const count = 320;
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
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        alpha,
        speed,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleRate: 0.4 + Math.random() * 1.4,
      });
    }
    // Draw nearer (faster) streaks on top.
    this.streaks.sort((a, b) => a.speed - b.speed);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    const g = this.gfx;
    g.clear();

    const uEnd = this.uMin + this.uSpan;
    const halfU = this.ux;
    const halfV = this.uy;

    for (const s of this.streaks) {
      // Drift down-left along the motion axis, wrapping seamlessly.
      s.u -= s.speed * dt;
      if (s.u < this.uMin) s.u += this.uSpan;
      else if (s.u > uEnd) s.u -= this.uSpan;

      s.twinklePhase += s.twinkleRate * dt;

      const cx = s.u * this.ux + s.w * this.wx;
      const cy = s.u * this.uy + s.w * this.wy;
      const h = s.len * 0.5;
      const x1 = cx - halfU * h;
      const y1 = cy - halfV * h;
      const x2 = cx + halfU * h;
      const y2 = cy + halfV * h;

      const flicker = 0.85 + 0.15 * Math.sin(s.twinklePhase);

      g.moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          width: s.width,
          color: s.color,
          alpha: s.alpha * flicker,
          cap: "round",
        });
    }
  }
}
