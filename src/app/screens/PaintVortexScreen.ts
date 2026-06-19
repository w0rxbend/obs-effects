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

// ── Paint Vortex: rotating spiral of bold flat paint bands ───────────────────
// Palette: deep navy, vivid red, golden yellow, rich teal — thick bands
// separated by dark outlines, all swirling into a cream-white centre.
// Domain-warped FBM gives the rough brush-stroke / paint-splash texture.
const VORTEX_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

const float TAU = 6.28318530718;

// ── Noise ─────────────────────────────────────────────────────────────────────

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i),            hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p  = ROT * p * 2.02 + vec2(5.27, 2.14);
    a *= 0.50;
  }
  return v;
}

// ── Colour mapping ────────────────────────────────────────────────────────────
// t in [0, 1) → one full cycle of the spiral bands.
// 7 bold flat zones (navy → red → gold → navy → teal → red → gold → navy).

vec3 bandColor(float t) {
  vec3 navy = vec3(0.075, 0.050, 0.220);
  vec3 red  = vec3(0.870, 0.088, 0.065);
  vec3 gold = vec3(0.960, 0.715, 0.055);
  vec3 teal = vec3(0.055, 0.540, 0.525);

  float bw = 0.016; // transition width — keep it tight for bold flat look

  vec3 c = navy;
  c = mix(c, red,  smoothstep(0.10 - bw, 0.10 + bw, t));
  c = mix(c, gold, smoothstep(0.22 - bw, 0.22 + bw, t));
  c = mix(c, navy, smoothstep(0.36 - bw, 0.36 + bw, t));
  c = mix(c, teal, smoothstep(0.44 - bw, 0.44 + bw, t));
  c = mix(c, red,  smoothstep(0.55 - bw, 0.55 + bw, t));
  c = mix(c, gold, smoothstep(0.67 - bw, 0.67 + bw, t));
  c = mix(c, navy, smoothstep(0.82 - bw, 0.82 + bw, t));

  return c;
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2 uv = (uvN - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  // ── Double domain warp — gives the rough brush-stroke / sloshing feel ─────
  vec2 q = vec2(
    fbm(uv * 2.4 + vec2(t * 0.065, 0.0)),
    fbm(uv * 2.4 + vec2(3.5,  t * 0.072))
  );
  vec2 r2 = vec2(
    fbm(uv * 2.4 + 3.6 * q + vec2(t * 0.048, 1.7)),
    fbm(uv * 2.4 + 3.6 * q + vec2(6.2, t * 0.055))
  );
  vec2 p = uv + 0.11 * q + 0.045 * r2;

  // ── Spiral polar coords ───────────────────────────────────────────────────
  float radius = length(p);
  float angle  = atan(p.y, p.x);

  // k controls spiral tightness: k / TAU ≈ turns per unit radius.
  // With radius ~0.5 to edge: k=20 → ~1.6 full colour cycles visible.
  float k = 20.0;
  // Slow counter-clockwise rotation: one full turn every ~21 s
  float spiralAngle = angle - radius * k - t * 0.30;
  float bandPos = fract(spiralAngle / TAU);

  // ── Colour ────────────────────────────────────────────────────────────────
  vec3 col = bandColor(bandPos);

  // Cream-white core that fades out at the centre of the vortex
  vec3 cream = vec3(0.982, 0.958, 0.888);
  col = mix(col, cream, smoothstep(0.075, 0.018, radius));

  // Subtle inner glow ring just outside the white (cream-gold transition)
  float glow = smoothstep(0.14, 0.075, radius) * smoothstep(0.018, 0.075, radius);
  col = mix(col, vec3(0.980, 0.870, 0.420), glow * 0.35);

  // ── Vignette ─────────────────────────────────────────────────────────────
  float v = dot(uvN - 0.5, uvN - 0.5);
  col *= 1.0 - 0.55 * v * 2.8;

  // ── Grain ─────────────────────────────────────────────────────────────────
  col += (hash12(uvN * uResolution + fract(t) * 83.0) - 0.5) * 0.011;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class PaintVortexScreen extends Container {
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
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: VORTEX_FRAG }),
      resources: { vortexUniforms: this.uniforms },
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
