import type { Graphics } from "pixi.js";
import { DASH_LEN, GAP_LEN } from "./constants";

// Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E
// Returns true anomaly (angle at focus)
export function keplerTrueAnomaly(M: number, e: number): number {
  // Iterative Newton solver for E
  let E = M;
  for (let i = 0; i < 6; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  // True anomaly from E
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const cosV = (cosE - e) / (1 - e * cosE);
  const sinV = (Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE);
  return Math.atan2(sinV, cosV);
}

// Position on ellipse in orbit frame (sun at focus origin)
export function orbitPos(
  a: number,
  e: number,
  trueAnomaly: number,
): { x: number; y: number } {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
  return { x: r * Math.cos(trueAnomaly), y: r * Math.sin(trueAnomaly) };
}

// Rotate point by angle
export function rotate(
  x: number,
  y: number,
  angle: number,
): { x: number; y: number } {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// Draw a dashed ellipse (orbit ring) with sun at focus
export function drawDashedOrbit(
  g: Graphics,
  a: number,
  b: number,
  e: number,
  inc: number,
  color: number,
  alpha: number,
): void {
  const foci = a * e;
  const steps = 180;
  let dashAcc = 0;
  let drawing = true;
  let prevX = 0,
    prevY = 0;

  for (let i = 0; i <= steps; i++) {
    const ta = (i / steps) * Math.PI * 2;
    const ex = a * Math.cos(ta) - foci;
    const ey = b * Math.sin(ta);
    const rot = rotate(ex, ey, inc);

    if (i === 0) {
      prevX = rot.x;
      prevY = rot.y;
      continue;
    }

    const segLen = Math.hypot(rot.x - prevX, rot.y - prevY);
    dashAcc += segLen;

    if (drawing) {
      if (dashAcc <= DASH_LEN) {
        g.moveTo(prevX, prevY)
          .lineTo(rot.x, rot.y)
          .stroke({ color, alpha, width: 0.6, cap: "round" });
      } else {
        // partial dash
        const t = DASH_LEN / dashAcc;
        const mx = prevX + (rot.x - prevX) * t;
        const my = prevY + (rot.y - prevY) * t;
        g.moveTo(prevX, prevY)
          .lineTo(mx, my)
          .stroke({ color, alpha, width: 0.6, cap: "round" });
        dashAcc -= DASH_LEN;
        drawing = false;
      }
    } else {
      if (dashAcc >= GAP_LEN) {
        dashAcc -= GAP_LEN;
        drawing = true;
      }
    }

    prevX = rot.x;
    prevY = rot.y;
  }
}
