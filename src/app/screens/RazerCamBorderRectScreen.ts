import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer rectangular cam border ─────────────────────────────────────────────
// Small centered rounded-rect toxic-green frame, sized like the circular
// splash-ring border, with an audio-reactive pulsing edge and corner glints.
const CAM_BORDER_RECT_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

${NOISE_GLSL}

float sdRoundBox(vec2 p, vec2 halfExtent, float radius) {
  vec2 q = abs(p) - halfExtent + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  float asp = uResolution.x / uResolution.y;
  vec2 p = (vTextureCoord - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  float level = uAudio.x;
  float bass = uAudio.y;

  vec2 wob = 0.006 * vec2(
    fbm(p * 6.0 + vec2(t * 0.1, 0.3)),
    fbm(p * 6.0 + vec2(0.7, t * 0.11))
  );

  vec2 halfExtent = vec2(0.205, 0.155) * (1.0 + level * 0.05);
  float radius = 0.03;
  float d = sdRoundBox(p - wob, halfExtent, radius);

  float thickness = 0.010 + bass * 0.012;
  float ring = smoothstep(thickness, thickness - 0.008, abs(d));

  vec2 cornerLocal = abs(p) - halfExtent + radius;
  float cornerProx = 1.0 - smoothstep(0.0, 0.05, length(max(cornerLocal, 0.0)));
  float cornerGlow = cornerProx * (0.6 + bass * 1.0);

  float ang = atan(p.y, p.x);
  float glint = pow(0.5 + 0.5 * sin(ang * 1.0 - t * 0.7), 30.0) * ring;

  vec3 base = vec3(0.000, 0.760, 0.260);
  vec3 lite = vec3(0.210, 1.000, 0.000);
  vec3 crest = vec3(0.690, 1.000, 0.000);

  vec3 col = base;
  col = mix(col, lite, cornerGlow * 0.6 + level * 0.2);
  col += crest * glint;

  float alpha = clamp(ring * (0.85 + level * 0.15) + glint * 0.5, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}`;

export class RazerCamBorderRectScreen extends ShaderQuadScreen {
  constructor() {
    super(CAM_BORDER_RECT_FRAG, true);
  }
}
