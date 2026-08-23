/**
 * Numeric helpers shared by effect screens.
 *
 * Every body here is copied verbatim from the definitions that used to live in
 * each screen, so migrating a screen to these imports cannot change what it draws.
 */

/** Full turn in radians (2 * PI). */
export const TAU = Math.PI * 2;

/** Restrict `v` to the inclusive range [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear blend: returns `a` at t = 0 and `b` at t = 1. t is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Uniformly distributed number in [lo, hi). */
export function randRange(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** Restrict `v` to [0, 1]. */
export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Smoothstep over [0, 1]: 0 at v <= 0, 1 at v >= 1, with an ease at both ends. */
export function smooth01(v: number): number {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
}

/** Smoothstep between two edges: 0 below edge0, 1 above edge1, eased in between. */
export function smoothstep(
  edge0: number,
  edge1: number,
  value: number,
): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
