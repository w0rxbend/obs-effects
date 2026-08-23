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

// Psychedelic marble: bold pink, orange, and dark navy swirling bands
const MARBLE_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}

${VNOISE_GLSL}

const mat2 ROT2 = mat2(0.76, 0.65, -0.65, 0.76);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    v += amp * vnoise(p);
    p = ROT2 * p * 2.01 + vec2(7.4, 3.1);
    amp *= 0.48;
  }
  return v;
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 uv = (uvN - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime * 0.18;

  // Scale and drift the coordinate space for a slow pan
  vec2 p = uv * 2.8 + vec2(t * 0.07, t * 0.05);

  // Three-level domain warp to get groovy swirling
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(5.2, 1.3))
  );

  vec2 w = vec2(
    fbm(p + 3.5 * q + vec2(1.7 + t * 0.12, 9.2 - t * 0.08)),
    fbm(p + 3.5 * q + vec2(8.3 + t * 0.05, 2.8 + t * 0.09))
  );

  vec2 r = vec2(
    fbm(p + 2.8 * w + vec2(-3.1, 6.7)),
    fbm(p + 2.8 * w + vec2(4.5, -2.3))
  );

  float f = fbm(p + 3.2 * r + vec2(t * 0.06, -t * 0.04));

  // Create bold sinusoidal bands from the warp field
  // Multiple frequencies create the layered marble look
  float swirl = fbm(p + 4.0 * q + vec2(0.0, t * 0.07));
  float band = sin((f * 4.8 + swirl * 2.2) * 3.14159);

  // A secondary fast-swirling layer adds the enclosed teardrop blobs
  vec2 sp = uv * 3.6 + vec2(-t * 0.06, t * 0.09);
  vec2 sq = vec2(fbm(sp), fbm(sp + vec2(3.1, 7.4)));
  float blob = fbm(sp + 2.6 * sq);
  float blobBand = sin(blob * 5.0 * 3.14159 + t * 0.3);

  // Blend primary and secondary
  float b = mix(band, blobBand, 0.28);

  // Palette: deep navy, hot pink, golden orange
  vec3 navy  = vec3(0.082, 0.078, 0.220);
  vec3 pink  = vec3(0.953, 0.157, 0.494);
  vec3 orange = vec3(0.961, 0.639, 0.082);

  // Map [-1,1] band value → color
  // Negative → navy, low positive → pink, high positive → orange
  vec3 col;
  float bSigned = b; // -1 to +1

  // Smooth stepped mapping into three zones
  float t1 = smoothstep(-1.0, -0.05, bSigned); // dark → pink
  float t2 = smoothstep(0.18, 0.58, bSigned);   // pink → orange
  float t3 = smoothstep(0.72, 0.90, bSigned);   // orange back to dark edge

  col = mix(navy, pink, t1);
  col = mix(col, orange, t2);
  col = mix(col, navy * 0.4, t3);

  // Dark outline at band boundaries — gives the groovy inked-outline look
  float edgePink   = abs(bSigned + 0.05);
  float edgeOrange = abs(bSigned - 0.38);
  float outline    = smoothstep(0.07, 0.0, edgePink) + smoothstep(0.07, 0.0, edgeOrange);
  col = mix(col, navy * 0.15, clamp(outline * 1.8, 0.0, 1.0));

  // Soft inner glow on pink zones to make them pop
  float pinkMask = smoothstep(0.0, 0.5, t1) * (1.0 - t2);
  col += pink * 0.08 * pinkMask;

  // Subtle vignette
  vec2 vc = uvN - 0.5;
  col *= 1.0 - 0.55 * dot(vc, vc);

  // Very slight grain to avoid banding
  float grain = hash12(uvN * uResolution + fract(uTime) * 71.0) - 0.5;
  col += grain * 0.012;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class PsychedelicMarbleScreen extends Container {
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
