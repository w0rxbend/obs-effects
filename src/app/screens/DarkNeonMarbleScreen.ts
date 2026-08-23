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

// Dark neon marble: near-black navy base, hot-pink/magenta/purple/orange-red veins, white highlights
const MARBLE_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}

${VNOISE_GLSL}

// Rotation biased toward diagonal flow
const mat2 ROT2 = mat2(0.62, 0.78, -0.78, 0.62);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 7; i++) {
    v += amp * vnoise(p);
    p = ROT2 * p * 2.03 + vec2(5.1, 2.7);
    amp *= 0.46;
  }
  return v;
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 uv = (uvN - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime * 0.12;

  // Diagonal skew to match the reference image's diagonal bias
  vec2 p = uv * 3.2 + vec2(t * 0.04, t * 0.03);
  p = mat2(0.85, 0.53, -0.53, 0.85) * p; // ~32° tilt

  // Three-level domain warp
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(4.8, 1.7))
  );

  vec2 w = vec2(
    fbm(p + 4.2 * q + vec2(1.9 + t * 0.08, 8.3 - t * 0.06)),
    fbm(p + 4.2 * q + vec2(7.1 + t * 0.04, 3.5 + t * 0.07))
  );

  vec2 r = vec2(
    fbm(p + 3.1 * w + vec2(-2.8, 5.9)),
    fbm(p + 3.1 * w + vec2(3.7, -1.9))
  );

  float f = fbm(p + 3.8 * r + vec2(t * 0.05, -t * 0.03));

  // Sharper sinusoidal banding for the marble vein look
  float swirl = fbm(p + 5.0 * q + vec2(0.0, t * 0.05));
  float band = sin((f * 5.6 + swirl * 2.8) * 3.14159);

  // Secondary layer for the enclosed teardrop / enclosed loop shapes
  vec2 sp = uv * 4.2 + vec2(-t * 0.05, t * 0.07);
  sp = mat2(0.85, 0.53, -0.53, 0.85) * sp;
  vec2 sq = vec2(fbm(sp + vec2(1.1, 0.0)), fbm(sp + vec2(0.0, 2.8)));
  float blob = fbm(sp + 3.0 * sq);
  float blobBand = sin(blob * 6.0 * 3.14159 + t * 0.25);

  float b = mix(band, blobBand, 0.22);

  // Palette
  vec3 dark    = vec3(0.052, 0.055, 0.145); // near-black navy
  vec3 purple  = vec3(0.380, 0.078, 0.580); // deep purple
  vec3 pink    = vec3(0.960, 0.078, 0.498); // hot pink
  vec3 magenta = vec3(0.780, 0.030, 0.650); // deep magenta
  vec3 orange  = vec3(0.930, 0.270, 0.090); // orange-red
  vec3 white   = vec3(0.960, 0.950, 0.980); // cool white highlight

  // Map band to zones — dark is dominant, veins appear as bright stripes
  float bN = b * 0.5 + 0.5; // remap to [0,1]

  // Zone transitions (tuned so dark dominates ~65% of surface)
  float tPurple  = smoothstep(0.58, 0.65, bN);
  float tMagenta = smoothstep(0.65, 0.72, bN);
  float tPink    = smoothstep(0.72, 0.80, bN);
  float tOrange  = smoothstep(0.80, 0.88, bN);
  float tWhite   = smoothstep(0.90, 0.96, bN);

  vec3 col = dark;
  col = mix(col, purple,  tPurple);
  col = mix(col, magenta, tMagenta);
  col = mix(col, pink,    tPink);
  col = mix(col, orange,  tOrange);
  col = mix(col, white,   tWhite);

  // Sharp dark outline at the vein edges — the inked-outline marble look
  float edge1 = abs(bN - 0.64);
  float edge2 = abs(bN - 0.79);
  float edge3 = abs(bN - 0.89);
  float outline = smoothstep(0.025, 0.0, edge1)
                + smoothstep(0.020, 0.0, edge2)
                + smoothstep(0.015, 0.0, edge3);
  col = mix(col, dark * 0.3, clamp(outline * 2.2, 0.0, 1.0));

  // Glow bloom on the pink band
  float pinkGlow = smoothstep(0.0, 1.0, tPink) * (1.0 - tOrange);
  col += pink * 0.12 * pinkGlow;

  // Subtle vignette (stronger to push edges very dark)
  vec2 vc = uvN - 0.5;
  col *= 1.0 - 0.70 * dot(vc, vc) * 2.2;
  col = max(col, vec3(0.0));

  // Micro grain to break banding
  float grain = hash12(uvN * uResolution + fract(uTime) * 97.0) - 0.5;
  col += grain * 0.010;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class DarkNeonMarbleScreen extends Container {
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
