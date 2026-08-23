import type { Graphics } from "pixi.js";
import { BOGIE_COLOR, BOGIE_FRAME, WHEEL_COLOR } from "./palette";

// One bogie / wheel truck with two wheels and animated hub spoke
export function drawBogie(
  g: Graphics,
  cx: number,
  railSurface: number,
  wheelR: number,
  spinAngle: number,
  isLoco: boolean,
): void {
  const frameH = 5;
  const frameY = railSurface - wheelR * 2 - frameH;
  const w1x = cx - wheelR - 1;
  const w2x = cx + wheelR + 1;
  const wy = railSurface - wheelR; // wheel center Y

  // Bogie frame bar
  g.rect(w1x - 2, frameY, w2x - w1x + 4 + wheelR, frameH).fill({
    color: BOGIE_FRAME,
  });

  // Draw two wheels per bogie
  for (const wkx of [w1x, w2x]) {
    const r = isLoco ? wheelR + 1 : wheelR; // slightly larger on loco
    g.circle(wkx, wy, r).fill({ color: WHEEL_COLOR });
    // Hub disc
    g.circle(wkx, wy, r * 0.44).fill({ color: BOGIE_COLOR });
    // Animated spoke (single line, rotates with travel)
    const sa = spinAngle + wkx * 0.07;
    const sr = r * 0.8;
    g.moveTo(wkx + Math.cos(sa) * sr * 0.35, wy + Math.sin(sa) * sr * 0.35)
      .lineTo(wkx + Math.cos(sa) * sr, wy + Math.sin(sa) * sr)
      .stroke({ color: BOGIE_FRAME, width: 1.5 });
    g.moveTo(
      wkx + Math.cos(sa + Math.PI) * sr * 0.35,
      wy + Math.sin(sa + Math.PI) * sr * 0.35,
    )
      .lineTo(
        wkx + Math.cos(sa + Math.PI) * sr,
        wy + Math.sin(sa + Math.PI) * sr,
      )
      .stroke({ color: BOGIE_FRAME, width: 1.5 });
  }
}
