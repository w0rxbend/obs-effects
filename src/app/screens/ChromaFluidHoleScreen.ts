import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Chroma fluid hole ─────────────────────────────────────────────────────────
// Solid chroma-key green background with a genuinely transparent, organic
// lava-lamp-style hole animating in the center. Premultiplied alpha at the
// hole edge avoids a green fringe when composited in OBS; the surrounding
// fill can additionally be keyed out with a Color Key filter for layering.
const CHROMA_FLUID_HOLE_FRAG = `#version 300 es
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

  // Gentle domain warp so the hole's boundary breathes like a fluid surface
  // while staying close to a circle rather than a lobed blob.
  vec2 wp = p + 0.025 * vec2(
    fbm(p * 1.6 + vec2(t * 0.05, 1.7)),
    fbm(p * 1.6 + vec2(4.1, t * 0.045))
  );

  float rW = length(wp);
  float aW = atan(wp.y, wp.x);

  // Faint high-frequency ripple around the rim — a shimmer, not a lobe.
  float lobe =
    0.008 * sin(aW * 5.0 + t * 0.28 + 1.4) +
    0.005 * sin(aW * 9.0 - t * 0.4 + 0.7);

  float breathe = 0.012 * sin(t * 0.35);
  float radius = 0.27 + breathe + lobe + level * 0.015;

  float feather = 0.012;
  float holeAlpha = smoothstep(radius - feather, radius + feather, rW);

  vec3 chromaGreen = vec3(0.0, 1.0, 0.0);

  fragColor = vec4(chromaGreen * holeAlpha, holeAlpha);
}`;

export class ChromaFluidHoleScreen extends ShaderQuadScreen {
  constructor() {
    super(CHROMA_FLUID_HOLE_FRAG, true);
  }
}
