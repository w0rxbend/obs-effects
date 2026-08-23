import { Graphics } from "pixi.js";
import { TAPE_BLACK, TAPE_HW, TAPE_YELLOW } from "./palette";

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Builds a caution-tape Graphics in tape-local coordinates (origin = centre).
 * Stripes are drawn ONLY inside the border zones so they never overlap the
 * yellow centre band — no overdraw, no layering issues.
 */
export function buildTapeGraphics(hh: number): Graphics {
  const hw = TAPE_HW;
  const bz = Math.max(hh * 0.32, 14); // border zone height
  const cHH = hh - bz; // centre half-height
  const period = bz * 2.4; // stripe period scaled to border zone
  const blackW = period * 0.48;
  const slant = bz; // 45° within the border zone

  const g = new Graphics();

  // 1. Full yellow background (no overdraw issues — drawn once)
  g.rect(-hw, -hh, hw * 2, hh * 2).fill({ color: TAPE_YELLOW });

  // 2. Black stripes in TOP border zone only
  for (let x = -hw - slant * 2; x < hw + slant; x += period) {
    g.poly([
      x,
      -hh,
      x + blackW,
      -hh,
      x + blackW + slant,
      -cHH,
      x + slant,
      -cHH,
    ]).fill({ color: TAPE_BLACK });
  }

  // 3. Black stripes in BOTTOM border zone only (mirrored)
  for (let x = -hw - slant * 2; x < hw + slant; x += period) {
    g.poly([
      x + slant,
      cHH,
      x + blackW + slant,
      cHH,
      x + blackW,
      hh,
      x,
      hh,
    ]).fill({
      color: TAPE_BLACK,
    });
  }

  // 4. Hard outer border lines
  g.rect(-hw, -hh, hw * 2, 3).fill({ color: TAPE_BLACK });
  g.rect(-hw, hh - 3, hw * 2, 3).fill({ color: TAPE_BLACK });

  // 5. Thin separator lines at centre band edges
  g.rect(-hw, -cHH - 1, hw * 2, 2).fill({ color: TAPE_BLACK, alpha: 0.5 });
  g.rect(-hw, cHH - 1, hw * 2, 2).fill({ color: TAPE_BLACK, alpha: 0.5 });

  return g;
}
