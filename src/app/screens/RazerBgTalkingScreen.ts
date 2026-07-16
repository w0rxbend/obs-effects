import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer talking background ─────────────────────────────────────────────────
// Calm, low-motion backdrop for face-forward chat/talking scenes: a soft
// breathing radial glow with slow drifting fog, gently nudged by voice
// level so it never sits fully static, but never distracts from the face.
const TALKING_BG_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

${NOISE_GLSL}

void main() {
  vec2 uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2 p = (uvN - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  float level = uAudio.x;

  vec3 deep = vec3(0.000, 0.010, 0.000);
  vec3 abyss = vec3(0.000, 0.045, 0.012);
  vec3 glow = vec3(0.000, 0.560, 0.190);

  // Slow drifting fog, two octaves, barely moving.
  float fog = fbm(p * 1.4 + vec2(t * 0.015, -t * 0.011));
  fog += 0.4 * fbm(p * 3.1 - vec2(t * 0.02, t * 0.008));

  vec3 col = mix(deep, abyss, clamp(fog * 1.3, 0.0, 1.0));

  // Breathing radial glow, gently lifted by voice level.
  float breath = 0.5 + 0.5 * sin(t * 0.22);
  float dist = length(p);
  float radial = exp(-dist * dist * (2.6 - breath * 0.5 - level * 0.4));
  col += glow * radial * (0.35 + breath * 0.15 + level * 0.35);

  // Faint horizontal light band, like a studio backlight.
  float band = exp(-pow((p.y + 0.05) * 3.2, 2.0));
  col += glow * band * 0.10;

  // Very fine grain to avoid banding.
  float grain = hash12(uvN * uResolution + fract(t) * 30.0) - 0.5;
  col += grain * 0.008;

  vec2 vc = uvN - 0.5;
  col *= 1.0 - 0.5 * dot(vc, vc);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class RazerBgTalkingScreen extends ShaderQuadScreen {
  constructor() {
    super(TALKING_BG_FRAG, true);
  }
}
