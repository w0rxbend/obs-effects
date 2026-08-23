/**
 * Colour helpers shared by effect screens.
 *
 * Every body here is copied verbatim from the definitions that used to live in
 * each screen, so migrating a screen to these imports cannot change what it draws.
 */

/**
 * Blend two 0xRRGGBB colours per channel. `t` is NOT clamped — several screens
 * deliberately pass t outside [0, 1] to extrapolate past the endpoints.
 */
export function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

/** Blend two 0xRRGGBB colours per channel, with `t` first clamped into [0, 1]. */
export function mixHex(a: number, b: number, t: number): number {
  const amount = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * amount) << 16) |
    (Math.round(ag + (bg - ag) * amount) << 8) |
    Math.round(ab + (bb - ab) * amount)
  );
}
