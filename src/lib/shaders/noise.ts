// Palette-neutral GLSL noise primitives shared by fragment shaders across the repo.
// These are the exact bodies that used to be pasted into each screen; GLSL ignores
// whitespace, so interpolating these strings compiles to identical arithmetic.

export const HASH12_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// Value noise on the unit grid, smoothstep-interpolated. Requires hash12 to be
// declared first, so always interpolate HASH12_GLSL above this.
export const VNOISE_GLSL = `
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

/** hash12 + vnoise, in declaration order. */
export const NOISE_BASE_GLSL = `${HASH12_GLSL}${VNOISE_GLSL}`;
