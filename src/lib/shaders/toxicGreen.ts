// Shared "Razer toxic green" palette used across the razer-* effect family.
// JS-side color ints for Graphics/Text draws:
export const TOXIC_BLACK = 0x000a00;
export const TOXIC_ABYSS = 0x000e04;
export const TOXIC_GREEN = 0x00c243;
export const TOXIC_ACID = 0x36ff00;
export const TOXIC_LIME = 0xb0ff00;
export const TOXIC_WHITE = 0xe8ffe0;

// GLSL vec3 literals matching the same palette, for fragment shaders.
export const TOXIC_GLSL = `
const vec3 toxicDeep   = vec3(0.000, 0.010, 0.000);
const vec3 toxicAbyss  = vec3(0.000, 0.055, 0.014);
const vec3 toxicBody   = vec3(0.000, 0.760, 0.260);
const vec3 toxicAcid   = vec3(0.210, 1.000, 0.000);
const vec3 toxicCrest  = vec3(0.690, 1.000, 0.000);
`;

// Reusable hash/value-noise/fbm GLSL snippet shared by razer-* shaders.
export const NOISE_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i),                 hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(3.71, 1.43);
    a *= 0.5;
  }
  return v;
}
`;
