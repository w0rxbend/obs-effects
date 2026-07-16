import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer screen-share border ────────────────────────────────────────────────
// Thin rounded-rect toxic-green frame around the full capture area, with
// bright corner brackets and a rotating scan glint. Interior stays fully
// transparent so the shared screen reads clean.
const SHARE_BORDER_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

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

  float margin = 0.028 + level * 0.008;
  float radius = 0.026;
  float thickness = 0.0032 + level * 0.0022;

  vec2 halfExtent = vec2(asp, 1.0) * 0.5 - vec2(margin);
  float d = sdRoundBox(p, halfExtent, radius);

  float frame = smoothstep(thickness, thickness - 0.0022, abs(d));

  // Faint inner glow just inside the frame line, fading out with depth.
  float innerGlow = clamp(-d / 0.038, 0.0, 1.0) * step(0.0, -d) * 0.10;

  // Corner bracket brightening — proximity to the four rounded-box corners.
  vec2 cornerLocal = abs(p) - halfExtent + radius;
  float cornerProx = 1.0 - smoothstep(0.0, 0.06, length(max(cornerLocal, 0.0)));
  float cornerGlow = cornerProx * (0.55 + bass * 0.9);

  // Rotating scan glint sweeping around the perimeter.
  float ang = atan(p.y, p.x);
  float glint = pow(0.5 + 0.5 * sin(ang - t * 0.6), 36.0) * frame;

  vec3 base = vec3(0.000, 0.760, 0.260);
  vec3 acid = vec3(0.210, 1.000, 0.000);
  vec3 crest = vec3(0.690, 1.000, 0.000);

  vec3 col = base;
  col = mix(col, acid, cornerGlow);
  col += crest * glint * 1.4;
  col += acid * innerGlow;

  float alpha = clamp(frame * (0.85 + level * 0.15) + innerGlow + glint * 0.6, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}`;

export class RazerScreenShareBorderScreen extends ShaderQuadScreen {
  constructor() {
    super(SHARE_BORDER_FRAG, true);
  }
}
