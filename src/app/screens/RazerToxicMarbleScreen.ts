import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";
import { HASH12_GLSL, VNOISE_GLSL } from "../../lib/shaders/noise";

const FILTER_VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

// Razer toxic marble: pure black base, bold banded swirls gradient-mapped
// from Razer green → toxic green → acid salad → yellow-green
const MARBLE_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}

${VNOISE_GLSL}

const mat2 ROT2 = mat2(0.74, 0.67, -0.67, 0.74);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    v += amp * vnoise(p);
    p = ROT2 * p * 2.02 + vec2(6.3, 4.1);
    amp *= 0.49;
  }
  return v;
}

// Gradient-map palette: Razer green → toxic green → acid salad → yellow-green
vec3 razerGradient(float t) {
  // t in [0,1] from dark/deep to light/yellow end
  vec3 razerGreen  = vec3(0.267, 0.839, 0.173); // #44D62C
  vec3 toxicGreen  = vec3(0.224, 1.000, 0.078); // #39FF14
  vec3 acidSalad   = vec3(0.678, 1.000, 0.184); // #ADFF2F
  vec3 yellowGreen = vec3(0.870, 1.000, 0.000); // #DEFF00

  if (t < 0.33) return mix(razerGreen, toxicGreen, t / 0.33);
  if (t < 0.66) return mix(toxicGreen, acidSalad, (t - 0.33) / 0.33);
  return mix(acidSalad, yellowGreen, (t - 0.66) / 0.34);
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 uv  = (uvN - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime * 0.10;

  // Slow drift
  vec2 p = uv * 2.6 + vec2(t * 0.05, t * 0.03);

  // Two-level domain warp to produce the wide organic swirls
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(5.1, 1.4))
  );

  vec2 w = vec2(
    fbm(p + 4.0 * q + vec2(2.1 + t * 0.09, 8.7 - t * 0.07)),
    fbm(p + 4.0 * q + vec2(6.8 + t * 0.04, 3.2 + t * 0.06))
  );

  float f = fbm(p + 3.5 * w + vec2(t * 0.04, -t * 0.03));

  // ── BANDING ─────────────────────────────────────────────────────────────
  // Sharp sinusoidal bands — same graphic topographic look as the reference.
  // Use fewer, wider bands (lower frequency multiplier) so colored areas dominate.
  float bandFreq = 4.5;
  float raw  = sin(f * bandFreq * 3.14159 * 2.0);

  // Sharpen: push values toward ±1 so bands have flat fills and thin transitions
  float sharp = sign(raw) * pow(abs(raw), 0.38);

  // remap to [0,1] for coloring
  float bandN = sharp * 0.5 + 0.5;

  // ── GRADIENT MAP ────────────────────────────────────────────────────────
  // A slow global gradient drifts across the screen (top→bottom + time)
  // to give the pink→orange→yellow wash of the reference (now green version).
  float gradPos = uvN.y + sin(uvN.x * 1.4 + t * 0.15) * 0.12 + t * 0.018;
  gradPos = clamp(gradPos, 0.0, 1.0);

  vec3 bandColor = razerGradient(gradPos);

  // ── BLACK OUTLINES ───────────────────────────────────────────────────────
  // Thin black separators between bands — the defining feature of the reference.
  // Computed from the derivative of the band value.
  float bandEdge = abs(raw); // near 0 at band centers, near 1 at edges
  // Where |sin| is close to 0 the transition is narrow → that's the outline zone
  float outline  = 1.0 - smoothstep(0.0, 0.22, abs(raw));

  // Final color: band color where band is lit, black outline at edges, black bg
  // The "black" background emerges from bandN being near 0.5 (sin≈0) in dark areas
  // We make areas near sin=0 fully black (they are the outline AND the bg).
  float lit = smoothstep(0.18, 0.38, abs(raw)); // 0 = black gap, 1 = colored band

  vec3 col = mix(vec3(0.0), bandColor, lit);

  // Extra thin hairline within the outline for the double-line detail
  float hairline = smoothstep(0.06, 0.0, abs(raw) - 0.01) * lit;
  col = mix(col, vec3(0.0), hairline * 0.8);

  // ── SUBTLE GLOW ─────────────────────────────────────────────────────────
  // A faint bloom on the brighter bands to give them that toxic neon feel
  col += bandColor * 0.06 * lit * smoothstep(0.5, 1.0, bandN);

  // Slight grain
  float grain = hash12(uvN * uResolution + fract(uTime) * 83.0) - 0.5;
  col += grain * 0.008;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class RazerToxicMarbleScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly quad: Sprite;
  private readonly uniforms: UniformGroup;
  private readonly resolution = new Float32Array([1920, 1080]);
  private time = 0;

  constructor() {
    super();

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: "f32" },
      uResolution: { value: this.resolution, type: "vec2<f32>" },
    });

    const filter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: MARBLE_FRAG,
      }),
      resources: { marbleUniforms: this.uniforms },
    });

    this.quad = new Sprite(Texture.WHITE);
    this.quad.filters = [filter];
    this.addChild(this.quad);
  }

  public async show(): Promise<void> {}

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.quad.width = width;
    this.quad.height = height;
    this.resolution[0] = width;
    this.resolution[1] = height;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    this.uniforms.uniforms.uTime = this.time;
  }
}
