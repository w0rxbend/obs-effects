import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer fluid-stain cam border ─────────────────────────────────────────────
// Organic ink-stain shaped toxic-green frame — a fully domain-warped,
// multi-harmonic wobbly ring rather than a fixed geometric outline, with an
// audio-reactive bloom that surges the stain outward on bass hits.
const CAM_BORDER_FLUID_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

const float TAU = 6.28318530718;

${NOISE_GLSL}

// Organic radial profile: several rotating noise octaves at different
// angular frequencies, so the stain never settles into a fixed silhouette.
float stainProfile(float a, float t, float bass) {
  float w  = 0.05 * fbm(vec2(cos(a) * 2.1, sin(a) * 2.1) + t * 0.05);
       w += 0.028 * sin(a * 3.0 + t * 0.22);
       w += 0.020 * sin(a * 5.0 - t * 0.31 + 1.7);
       w += 0.014 * sin(a * 8.0 + t * 0.44 + 0.6);
  return w * (1.0 + bass * 1.4);
}

void main() {
  float asp = uResolution.x / uResolution.y;
  vec2 p = (vTextureCoord - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  float level = uAudio.x;
  float bass = uAudio.y;

  vec2 wp = p + 0.02 * vec2(
    fbm(p * 2.6 + vec2(t * 0.06, 0.4)),
    fbm(p * 2.6 + vec2(0.8, t * 0.07))
  );

  float rC = length(p);
  float rW = length(wp);
  float aW = atan(wp.y, wp.x);

  const float RR = 0.165;
  float pulse = 0.028 * (1.0 + level * 0.9);

  float outer = RR + pulse + stainProfile(aW, t, bass);
  float inner = RR - pulse * 0.6 + stainProfile(aW + 1.7, t * 0.8, bass) * 0.4;

  float maskI = smoothstep(inner - 0.006, inner, rC);
  float maskO = smoothstep(outer + 0.014, outer, rW);
  float stain = maskI * maskO;

  // Small satellite droplets bleeding off the main stain.
  float drops = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float da = fi * 0.897 + t * 0.05 + sin(t * 0.3 + fi) * 0.2;
    float dr = RR + 0.05 + 0.03 * sin(t * 0.6 + fi * 2.1);
    float ds = 0.01 + 0.006 * sin(t * 1.3 + fi * 1.5) + bass * 0.01;
    vec2 dp = dr * vec2(cos(da), sin(da));
    drops += smoothstep(ds, ds * 0.3, length(p - dp));
  }
  drops = min(drops, 1.0);

  vec3 base = vec3(0.000, 0.760, 0.260);
  vec3 lite = vec3(0.210, 1.000, 0.000);
  vec3 crest = vec3(0.690, 1.000, 0.000);

  vec3 ldir = normalize(vec3(-0.4, 0.6, 0.65));
  vec3 snorm = normalize(vec3(wp, 0.3));
  float spec = pow(max(0.0, dot(snorm, ldir)), 4.0);

  float outerFresnel = smoothstep(0.02, 0.0, outer - rW) * maskI;
  float innerRim = smoothstep(inner + 0.02, inner + 0.004, rC) * maskO;

  vec3 col = base;
  col = mix(col, lite, spec * 0.5 + level * 0.2);
  col = mix(col, crest, outerFresnel * (0.5 + bass * 0.4));
  col = mix(col, lite * 0.9, innerRim * 0.3);
  col = mix(col, lite * 0.85, drops * 0.3 * (1.0 - stain));

  float alpha = clamp(stain + drops * 0.85, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}`;

export class RazerCamBorderFluidScreen extends ShaderQuadScreen {
  constructor() {
    super(CAM_BORDER_FLUID_FRAG, true);
  }
}
