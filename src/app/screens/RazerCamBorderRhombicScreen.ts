import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer rhombic cam border ──────────────────────────────────────────────────
// Small centered diamond-shaped toxic-green frame, audio-reactive spikes at
// each of the four points, matching the size/placement of the other borders.
const CAM_BORDER_RHOMBIC_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

${NOISE_GLSL}

void main() {
  float asp = uResolution.x / uResolution.y;
  vec2 p = (vTextureCoord - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  float level = uAudio.x;
  float bass = uAudio.y;

  float rot = t * 0.05;
  vec2 pr = vec2(
    p.x * cos(rot) - p.y * sin(rot),
    p.x * sin(rot) + p.y * cos(rot)
  );

  float rx = 0.235 * (1.0 + level * 0.06);
  float ry = 0.175 * (1.0 + level * 0.06);

  // Taxicab (L1) distance normalized by axis extents — an isoline of this
  // forms a diamond/rhombus.
  float wob = 0.02 * fbm(vec2(atan(pr.y, pr.x) * 2.0 + t * 0.4, t * 0.2));
  float dNorm = abs(pr.x) / rx + abs(pr.y) / ry - 1.0 - wob;

  float thickness = 0.055 + bass * 0.05;
  float ring = smoothstep(thickness, thickness - 0.035, abs(dNorm));

  // Spike glow at the four rhombus points.
  float pointGlow =
    (smoothstep(0.92, 1.0, abs(pr.x) / rx) + smoothstep(0.92, 1.0, abs(pr.y) / ry)) *
    (0.5 + bass * 1.2) *
    ring;

  float ang = atan(pr.y, pr.x);
  float glint = pow(0.5 + 0.5 * sin(ang * 1.0 - t * 0.65), 28.0) * ring;

  vec3 base = vec3(0.000, 0.760, 0.260);
  vec3 lite = vec3(0.210, 1.000, 0.000);
  vec3 crest = vec3(0.690, 1.000, 0.000);

  vec3 col = base;
  col = mix(col, lite, clamp(pointGlow, 0.0, 1.0));
  col += crest * glint;

  float alpha = clamp(ring * (0.85 + level * 0.15) + pointGlow * 0.4 + glint * 0.5, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}`;

export class RazerCamBorderRhombicScreen extends ShaderQuadScreen {
  constructor() {
    super(CAM_BORDER_RHOMBIC_FRAG, true);
  }
}
