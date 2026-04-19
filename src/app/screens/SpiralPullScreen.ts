import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

// ── Spiral config ─────────────────────────────────────────────────────────────
const ARMS          = 5;
const SPIRAL_A      = 5;     // inner radius at θ=0
const SPIRAL_B      = 0.25;  // growth rate (log spiral)
const MAX_THETA     = 22;    // radians traced per arm (~3.5 turns)
const ARM_POINTS    = 400;   // samples per arm
const ROTATION_SPD  = 0.14;  // clockwise rad/s

// ── Center glow ───────────────────────────────────────────────────────────────
const GLOW_RINGS    = 8;
const GLOW_MAX_R    = 80;
const PULSE_SPEED   = 1.2;   // Hz

// ── Cyan palette ──────────────────────────────────────────────────────────────
const CYAN_CORE  = 0x00e5ff;
const CYAN_MID   = 0x06b6d4;
const WHITE      = 0xffffff;

export class SpiralPullScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time     = 0;
  private spinAngle = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
  }

  public async hide(): Promise<void> { /* nothing */ }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time      += dt;
    this.spinAngle += dt * ROTATION_SPD; // clockwise → positive angle increase

    const g  = this.gfx;
    const cx = this.w / 2;
    const cy = this.h / 2;

    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const maxR = Math.hypot(cx, cy);

    // ── Spiral arms ──────────────────────────────────────────────────────────
    for (let arm = 0; arm < ARMS; arm++) {
      const armOffset = (arm / ARMS) * Math.PI * 2;

      // Two passes per arm: glow then core
      for (let pass = 0; pass < 2; pass++) {
        const isGlow = pass === 0;

        // Walk along the arm and draw segment-by-segment with fading alpha
        let prevX = 0, prevY = 0;
        let started = false;

        for (let i = 0; i < ARM_POINTS; i++) {
          const theta = (i / (ARM_POINTS - 1)) * MAX_THETA;
          const r     = SPIRAL_A * Math.exp(SPIRAL_B * theta);
          const angle = armOffset + this.spinAngle + theta;

          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);

          if (!started) {
            g.moveTo(px, py);
            prevX = px; prevY = py;
            started = true;
            continue;
          }

          // Fade: 1 at center → 0 at edge
          const distFrac = Math.min(r / maxR, 1);
          const alpha    = Math.pow(1 - distFrac, 1.6);
          if (alpha < 0.005) break;

          if (isGlow) {
            g.moveTo(prevX, prevY).lineTo(px, py)
              .stroke({ width: 10, color: CYAN_MID, alpha: alpha * 0.07 });
            g.moveTo(prevX, prevY).lineTo(px, py)
              .stroke({ width: 4, color: CYAN_CORE, alpha: alpha * 0.12 });
          } else {
            g.moveTo(prevX, prevY).lineTo(px, py)
              .stroke({ width: 1.2, color: CYAN_CORE, alpha: alpha * 0.85 });
          }

          prevX = px;
          prevY = py;
        }
      }
    }

    // ── Center glow (pulsing white) ───────────────────────────────────────────
    const pulse = 0.85 + 0.15 * Math.sin(this.time * PULSE_SPEED * Math.PI * 2);

    for (let i = GLOW_RINGS; i >= 1; i--) {
      const frac  = i / GLOW_RINGS;
      const r     = GLOW_MAX_R * frac * pulse;
      const alpha = (1 - frac) * 0.25;
      g.circle(cx, cy, r).fill({ color: CYAN_MID, alpha });
    }
    // Bright core
    g.circle(cx, cy, 14 * pulse).fill({ color: WHITE, alpha: 0.95 });
    g.circle(cx, cy, 6  * pulse).fill({ color: WHITE, alpha: 1.0  });
  }
}
