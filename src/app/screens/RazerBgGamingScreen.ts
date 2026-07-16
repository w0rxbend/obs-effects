import { NOISE_GLSL } from "../../lib/shaders/toxicGreen";
import { ShaderQuadScreen } from "../../lib/shaders/ShaderQuadScreen";

// ── Razer gaming background ──────────────────────────────────────────────────
// Tron-style perspective floor grid rushing toward the viewer, with a bass
// -reactive strobe wash and magenta accent flashes on hard hits.
const GAMING_BG_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uAudio; // level, bass, mid, high

${NOISE_GLSL}

float gridLine(float coord, float freq, float width) {
  float g = abs(fract(coord * freq) - 0.5) * 2.0;
  return 1.0 - smoothstep(0.0, width, g);
}

void main() {
  vec2 uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2 p = (uvN - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  float level = uAudio.x;
  float bass = uAudio.y;
  float high = uAudio.w;

  float horizon = -0.06;
  float depth = p.y - horizon;

  vec3 col = vec3(0.0);

  if (depth < 0.0) {
    // Floor: perspective-divided grid rushing toward camera.
    float persp = 1.0 / max(-depth, 0.02);
    float speed = 0.35 + level * 0.9;
    vec2 gp = vec2(p.x * persp, persp * 0.5 + t * speed * 3.0);

    float gx = gridLine(gp.x, 1.0, 0.06);
    float gy = gridLine(gp.y, 1.0, 0.06 + level * 0.03);
    float grid = max(gx, gy);

    float fade = smoothstep(0.0, 0.5, -depth) * smoothstep(6.0, 0.2, persp);
    vec3 floorBase = vec3(0.0, 0.05, 0.015);
    vec3 gridCol = mix(vec3(0.0, 0.76, 0.26), vec3(0.69, 1.0, 0.0), bass);

    col = mix(floorBase, gridCol, grid * fade);
    col += gridCol * grid * fade * high * 0.6;
  } else {
    // Sky: dark gradient with drifting scanlines and starfield motes.
    vec3 sky = mix(vec3(0.0, 0.02, 0.006), vec3(0.0, 0.008, 0.002), depth * 1.4);
    float scan = gridLine(p.y * 40.0 + t * 0.6, 1.0, 0.02) * 0.05;
    sky += vec3(0.0, 0.5, 0.15) * scan;

    vec2 sp = p * 6.0;
    float star = smoothstep(0.985, 1.0, hash12(floor(sp) + floor(t * 0.2)));
    sky += vec3(0.6, 1.0, 0.6) * star * 0.5;

    col = sky;
  }

  // Horizon glow band.
  float hz = exp(-pow((p.y - horizon) * 6.0, 2.0));
  col += mix(vec3(0.0, 0.9, 0.3), vec3(1.0, 0.0, 0.65), bass * 0.6) * hz * (0.35 + level * 0.5);

  // Bass strobe wash across the whole frame.
  float strobe = smoothstep(0.55, 1.0, bass) * (0.5 + 0.5 * sin(t * 40.0));
  col += vec3(0.55, 0.05, 0.85) * strobe * 0.22;

  // Vignette.
  vec2 vc = uvN - 0.5;
  col *= 1.0 - 0.55 * dot(vc, vc);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class RazerBgGamingScreen extends ShaderQuadScreen {
  constructor() {
    super(GAMING_BG_FRAG, true);
  }
}
