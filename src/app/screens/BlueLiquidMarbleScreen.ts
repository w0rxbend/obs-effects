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

// Blue liquid marble: black base, bold banded swirls gradient-mapped
// from sky-cyan → electric blue → deep blue-purple (top-left → bottom-right)
const MARBLE_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}

${VNOISE_GLSL}

const mat2 ROT2 = mat2(0.72, 0.69, -0.69, 0.72);

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

// Palette: sky-cyan → electric blue → cobalt → deep blue-purple
vec3 blueGradient(float t) {
  vec3 skyCyan    = vec3(0.529, 0.808, 0.980); // #87CEDB
  vec3 electricBl = vec3(0.012, 0.612, 0.980); // #039CFA
  vec3 cobalt     = vec3(0.078, 0.353, 0.902); // #145AE6
  vec3 deepPurple = vec3(0.318, 0.255, 0.769); // #5141C4

  if (t < 0.33) return mix(skyCyan,    electricBl, t / 0.33);
  if (t < 0.66) return mix(electricBl, cobalt,     (t - 0.33) / 0.33);
  return           mix(cobalt,     deepPurple, (t - 0.66) / 0.34);
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 uv  = (uvN - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime * 0.10;

  vec2 p = uv * 2.6 + vec2(t * 0.04, t * 0.03);

  // Two-level domain warp for organic wide swirls
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(5.2, 1.3))
  );

  vec2 w = vec2(
    fbm(p + 4.1 * q + vec2(1.8 + t * 0.08, 8.5 - t * 0.06)),
    fbm(p + 4.1 * q + vec2(7.0 + t * 0.05, 3.1 + t * 0.07))
  );

  float f = fbm(p + 3.6 * w + vec2(t * 0.04, -t * 0.03));

  // Sharp topographic banding — same style as the reference
  float raw   = sin(f * 4.8 * 3.14159 * 2.0);
  float sharp = sign(raw) * pow(abs(raw), 0.36); // flatten fills, keep thin outlines
  float bandN = sharp * 0.5 + 0.5;

  // Diagonal gradient wash: top-left (cyan) → bottom-right (purple)
  // matching the reference image's color flow direction
  float diagPos = (uvN.x * 0.45 + uvN.y * 0.55)
                + sin(uvN.x * 1.2 - uvN.y * 0.8 + t * 0.12) * 0.08
                + t * 0.015;
  diagPos = clamp(diagPos, 0.0, 1.0);

  vec3 bandColor = blueGradient(diagPos);

  // Black gaps between bands
  float lit = smoothstep(0.16, 0.36, abs(raw));

  vec3 col = mix(vec3(0.0), bandColor, lit);

  // Thin double-line detail visible in the reference (fine inner lines)
  float hairline = smoothstep(0.05, 0.0, abs(raw) - 0.005) * lit;
  col = mix(col, vec3(0.0), hairline * 0.85);

  // Subtle glow on bright bands
  col += bandColor * 0.07 * lit * smoothstep(0.4, 1.0, bandN);

  float grain = hash12(uvN * uResolution + fract(uTime) * 91.0) - 0.5;
  col += grain * 0.008;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class BlueLiquidMarbleScreen extends Container {
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
