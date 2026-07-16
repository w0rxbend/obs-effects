import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer audio-reactive webcam border ───────────────────────────────────────
// Circular toxic-green splash ring. Interior stays clean for the webcam
// viewport. Ring width, spike height, and glow all track OBS audio levels.
const CAM_BORDER_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

const float PI  = 3.14159265358979;
const float TAU = 6.28318530718;

${NOISE_GLSL}

float angDist(float a, float b) {
  return abs(mod(a - b + PI, TAU) - PI);
}

float bump(float a, float centre, float hw, float h) {
  float d = angDist(a, centre);
  return h * exp(-(d * d) / (hw * hw));
}

float outerProfile(float a, float t, float bass) {
  float rot = t * 0.08;
  float w  = 0.012 * sin(a * 2.0 + t * 0.30 + rot * 2.1);
       w += 0.008 * sin(a * 3.0 - t * 0.24 + rot * 1.7 + 1.1);
       w += 0.005 * sin(a * 5.0 + t * 0.42 + 2.4);
  w = max(0.0, w);

  float boost = 0.6 + bass * 1.8;
  float s1 = bump(a, rot + 1.35, 0.40, 0.075 * boost * (0.7 + 0.3 * sin(t * 0.8)));
  float s2 = bump(a, rot + 2.95, 0.30, 0.066 * boost * (0.7 + 0.3 * sin(t * 0.65 + 1.4)));
  float s3 = bump(a, rot - 1.55, 0.34, 0.058 * boost * (0.7 + 0.3 * sin(t * 0.9 + 2.2)));
  float s4 = bump(a, rot - 0.30, 0.20, 0.048 * boost * (0.7 + 0.3 * sin(t * 0.75 + 0.7)));
  float s5 = bump(a, rot + 0.60, 0.13, 0.038 * boost * (0.7 + 0.3 * sin(t * 1.1 + 3.1)));

  return w + s1 + s2 + s3 + s4 + s5;
}

void main() {
  vec2 uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2 p = (uvN - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  float level = uAudio.x;
  float bass = uAudio.y;

  vec2 wp = p + 0.014 * vec2(
    fbm(p * 3.6 + vec2(t * 0.08, 0.42)),
    fbm(p * 3.6 + vec2(0.91, t * 0.09))
  );

  float rC = length(p);
  float rW = length(wp);
  float aW = atan(wp.y, wp.x);

  const float RR  = 0.155;
  const float BHW = 0.020;
  float pulse = BHW * (1.0 + level * 0.9);

  float outer = RR + pulse + outerProfile(aW, t, bass);
  float inner = RR - pulse * 0.7;

  float maskI = smoothstep(inner - 0.005, inner, rC);
  float maskO = smoothstep(outer + 0.012, outer, rW);
  float ring = maskI * maskO;

  vec3 base = vec3(0.000, 0.760, 0.260);
  vec3 lite = vec3(0.210, 1.000, 0.000);

  vec3 ldir = normalize(vec3(-0.42, 0.65, 0.65));
  vec3 snorm = normalize(vec3(wp, 0.28));
  float spec = pow(max(0.0, dot(snorm, ldir)), 4.5);

  float outerFresnel = smoothstep(0.018, 0.0, outer - rW) * maskI;
  float innerRim = smoothstep(inner + 0.020, inner + 0.003, rC) * maskO;

  vec3 col = base;
  col = mix(col, lite, spec * 0.55 + level * 0.25);
  col = mix(col, lite, outerFresnel * (0.45 + bass * 0.4));
  col = mix(col, lite * 0.9, innerRim * 0.30);

  float alpha = clamp(ring, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}`;

export class RazerAudioCamBorderScreen extends ShaderQuadScreen {
  constructor() {
    super(CAM_BORDER_FRAG, true);
  }
}
