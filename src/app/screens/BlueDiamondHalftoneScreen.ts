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

// Blue diamond halftone
// Technique: dot grid where radius is driven by sin(u)*sin(v) in 45°-rotated space,
// which naturally tiles as overlapping rotated squares (diamonds).
const FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i), hash2(i + vec2(1,0)), u.x),
    mix(hash2(i + vec2(0,1)), hash2(i + vec2(1,1)), u.x),
    u.y);
}

// Diamond pattern value at pixel position px, animated with time t
// Returns [0, 1]: 1 = center of diamond, 0 = gap between diamonds
float diamondField(vec2 px, float t) {
  // Rotate to diagonal axes
  vec2 diag = vec2(px.x + px.y, px.x - px.y);

  // Slow diagonal drift
  diag += vec2(t * 22.0, t * 14.0);

  // Primary diamond period (~145px between diamond centers)
  float period = 145.0;
  const float PI = 3.14159265;

  float u = diag.x / period;
  float v = diag.y / period;

  // sin(u*PI)*sin(v*PI) produces the tiled overlapping-diamond pattern.
  // Range: -1 to 1; remap so centers are bright, gaps are dark.
  float primary = sin(u * PI) * sin(v * PI);

  // Secondary finer frequency adds inner diamond detail visible in the ref
  float secondary = sin(u * PI * 2.0) * sin(v * PI * 2.0);

  float field = primary * 0.75 + secondary * 0.25;

  // Remap [-1,1] → [0,1], bias curve so gaps stay dark
  float normalized = field * 0.5 + 0.5;
  return pow(normalized, 1.2);
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 px  = uvN * uResolution;
  float t  = uTime;

  // ── DOT GRID ──────────────────────────────────────────────────────────────
  float dotSpacing = 11.0; // pixels between dot centers

  vec2 dotCell    = floor(px / dotSpacing);
  vec2 dotLocal   = fract(px / dotSpacing) - 0.5; // [-0.5, 0.5]

  // Evaluate diamond field at the dot center (not the fragment position)
  // so all pixels in the same dot cell get the same radius → clean flat circles
  vec2 dotCenterPx = (dotCell + 0.5) * dotSpacing;
  float field = diamondField(dotCenterPx, t);

  // Slow global pulse (breath) — the whole pattern gently swells and recedes
  float breathe = sin(t * 0.38) * 0.5 + 0.5;
  field = mix(field, field * (0.7 + 0.3 * breathe), 0.18);
  field = clamp(field, 0.0, 1.0);

  // Map field to dot radius (as fraction of half-cell)
  // Low threshold so the darkest diamond regions produce no dot at all
  float threshold = 0.22;
  float radius = smoothstep(threshold, 0.88, field) * 0.46;

  // Anti-aliased circle
  float aaW   = 0.8 / dotSpacing;
  float dist  = length(dotLocal);
  float circle = 1.0 - smoothstep(radius - aaW, radius + aaW, dist);

  // ── PALETTE ───────────────────────────────────────────────────────────────
  vec3 bg       = vec3(0.018, 0.022, 0.040); // near-black navy
  vec3 dotDark  = vec3(0.125, 0.278, 0.455); // #204773 dark steel blue
  vec3 dotBright= vec3(0.220, 0.490, 0.722); // #387DB8 brighter steel blue

  // Slightly brighter dots at field peaks (creates luminance depth)
  vec3 dotColor = mix(dotDark, dotBright, smoothstep(0.55, 0.95, field));

  vec3 col = mix(bg, dotColor, circle);

  // Subtle large-scale darkening at the very edges of the screen (vignette)
  vec2 vc = uvN - 0.5;
  col *= 1.0 - 0.55 * dot(vc, vc) * 3.5;
  col = max(col, vec3(0.0));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class BlueDiamondHalftoneScreen extends Container {
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
        fragment: FRAG,
      }),
      resources: { htUniforms: this.uniforms },
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
