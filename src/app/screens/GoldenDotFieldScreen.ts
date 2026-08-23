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

// Golden dot field: regular dot grid on dark navy, dot radius driven by animated FBM noise
const DOT_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}

${VNOISE_GLSL}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = ROT * p * 2.01 + vec2(5.2, 3.7);
    amp *= 0.50;
  }
  return v;
}

// Two-level domain-warped FBM for the large organic blob shapes
float warpedField(vec2 p) {
  vec2 q = vec2(fbm(p), fbm(p + vec2(4.3, 1.7)));
  vec2 w = vec2(
    fbm(p + 3.8 * q + vec2(1.9, 8.1)),
    fbm(p + 3.8 * q + vec2(7.3, 2.8))
  );
  return fbm(p + 3.2 * w);
}

void main() {
  vec2 uvN = vTextureCoord;
  // Pixel coordinates
  vec2 px = uvN * uResolution;

  // --- DOT GRID SETUP ---
  // Cell size in pixels. ~14px gives the dot density visible in the ref.
  float cellPx = 14.0;
  vec2 cell     = floor(px / cellPx);         // which cell
  vec2 cellUV   = fract(px / cellPx) - 0.5;  // [-0.5, 0.5] within cell

  // Center of this cell in UV space (for noise sampling)
  vec2 cellCenter = (cell + 0.5) * cellPx / uResolution;

  // --- NOISE FIELD ---
  // Slow upward drift for the "rising ember / heat shimmer" feel
  float t = uTime * 0.14;
  vec2 noiseCoord = cellCenter * vec2(2.8, 3.4) + vec2(t * 0.12, -t * 0.22);

  float field = warpedField(noiseCoord);

  // Remap noise [0,1] → dot radius [0, maxR] as fraction of half-cell
  // field > threshold → visible dot; below → background only
  float threshold = 0.28;
  float dotVal = smoothstep(threshold, 0.85, field);

  // Max radius = 0.48 × half-cell so dots nearly touch at peak
  float maxR  = 0.48;
  float r     = dotVal * maxR;

  // Signed distance from cell center (in cell-unit coords where 0.5 = half cell)
  float dist  = length(cellUV);

  // Smooth circle edge (1px antialiasing in cell-unit space)
  float aaW   = 1.0 / cellPx;
  float circle = 1.0 - smoothstep(r - aaW, r + aaW, dist);

  // --- PALETTE ---
  vec3 navy  = vec3(0.060, 0.098, 0.196); // #0F1932 dark navy
  vec3 amber = vec3(0.949, 0.639, 0.063); // #F2A310 golden amber

  // Slightly brighter/lighter amber at the densest dot clusters
  vec3 dotColor = mix(amber, amber * 1.15 + vec3(0.05, 0.02, 0.0), dotVal * dotVal);

  vec3 col = mix(navy, dotColor, circle);

  // Very subtle background grain to break up the flat navy
  float bgGrain = hash12(cell + vec2(floor(uTime * 7.0), 0.0)) * 0.018;
  col += bgGrain * (1.0 - circle) * 0.5;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class GoldenDotFieldScreen extends Container {
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
        fragment: DOT_FRAG,
      }),
      resources: { dotUniforms: this.uniforms },
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
