import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";

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

// Teal-red marble: dense 4-color cycling bands (white / teal / black / red)
// with heavy domain warp — full-coverage swirling, no dominant background
const MARBLE_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT2 = mat2(0.76, 0.65, -0.65, 0.76);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 7; i++) {
    v += amp * vnoise(p);
    p = ROT2 * p * 2.01 + vec2(7.4, 3.1);
    amp *= 0.47;
  }
  return v;
}

// 4-color cycle palette: white → teal → near-black → crimson red → repeat
// phase in [0, 1] cycles through all four
vec3 cyclePalette(float phase) {
  vec3 white   = vec3(0.945, 0.929, 0.906); // warm white / cream
  vec3 teal    = vec3(0.020, 0.588, 0.533); // #059788 teal-jade
  vec3 dark    = vec3(0.040, 0.055, 0.055); // near-black with teal tint
  vec3 red     = vec3(0.847, 0.149, 0.047); // #D8260C crimson red

  // 4 equal segments; smoothstep within each for soft band edges
  float s = phase * 4.0;
  int   seg = int(s);
  float f   = fract(s);

  // Soft transition within the band (not at edges — that's handled by outline)
  // Use a slight ease so fills stay solid and transitions are brief
  float fe = smoothstep(0.0, 0.18, f) * smoothstep(1.0, 0.82, f);

  vec3 col;
  if (seg == 0) col = mix(mix(red,   white, fe), white, 0.0); // white zone
  else if (seg == 1) col = mix(white, teal,  fe);              // teal zone
  else if (seg == 2) col = mix(teal,  dark,  fe);              // dark zone
  else               col = mix(dark,  red,   fe);              // red zone

  return col;
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 uv  = (uvN - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime * 0.14;

  vec2 p = uv * 3.0 + vec2(t * 0.06, t * 0.04);

  // Three-level domain warp for the tight, densely swirling flow
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(5.2, 1.3))
  );

  vec2 w = vec2(
    fbm(p + 4.0 * q + vec2(1.7 + t * 0.10, 9.2 - t * 0.08)),
    fbm(p + 4.0 * q + vec2(8.3 + t * 0.05, 2.8 + t * 0.09))
  );

  vec2 r = vec2(
    fbm(p + 3.0 * w + vec2(-3.1, 6.7)),
    fbm(p + 3.0 * w + vec2(4.5, -2.3))
  );

  float f = fbm(p + 3.5 * r + vec2(t * 0.05, -t * 0.03));

  // Add a second high-detail layer for the tight concentric feel
  vec2 sp = uv * 5.5 + vec2(-t * 0.04, t * 0.06);
  vec2 sq = vec2(fbm(sp + vec2(2.1, 0.0)), fbm(sp + vec2(0.0, 3.3)));
  float f2 = fbm(sp + 2.8 * sq);

  // Blend: primary gives large swirls, secondary adds tight inner bands
  float field = mix(f, f2, 0.32);

  // High-frequency cycling — ~10 full color cycles across the field range
  float bandCount = 10.0;
  float phase = fract(field * bandCount + t * 0.04); // slow drift animation

  vec3 col = cyclePalette(phase);

  // Thin black outlines at cycle boundaries (at phase ≈ 0, 0.25, 0.5, 0.75)
  // Computed from distance to nearest multiple of 0.25 in phase space
  float phaseMod = fract(phase * 4.0); // 0→1 four times per cycle
  float edgeDist = min(phaseMod, 1.0 - phaseMod); // 0 at boundaries
  float outline  = smoothstep(0.06, 0.0, edgeDist);
  col = mix(col, vec3(0.02, 0.03, 0.03), outline * 0.92);

  // Very slight micro-grain to break any WebGL banding artifacts
  float grain = hash12(uvN * uResolution + fract(uTime) * 73.0) - 0.5;
  col += grain * 0.009;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class TealRedMarbleScreen extends Container {
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
