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

// ── Neon glitch circle ring ───────────────────────────────────────────────────
// Transparent-background circular cam border.
// A smooth circle ring sliced into horizontal glitch blocks — each block is
// displaced sideways by a random amount, creating the VHS / digital-glitch
// look. Chromatic aberration splits the ring into magenta + cyan offset copies.
const GLITCH_RING_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;

// ── Hash / noise ──────────────────────────────────────────────────────────────

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ── Glitch displacement ───────────────────────────────────────────────────────
// Returns a horizontal shift for the given normalised y coordinate.
// The time-seed makes blocks re-shuffle every ~0.12 s for a jittery feel.

float glitchX(float y, float t) {
  // Quantise y into "glitch scanline blocks" of varying heights
  float coarse = floor(y / 0.035) + floor(t * 8.0) * 0.371;
  float fine   = floor(y / 0.008) + floor(t * 18.0) * 0.517;

  float noiseC = hash11(coarse);
  float noiseF = hash11(fine);

  // Only a fraction of blocks are displaced
  float activeC = step(0.72, noiseC);   // 28 % coarse blocks displaced
  float activeF = step(0.88, noiseF);   // 12 % fine blocks displaced

  float shiftC = (noiseC - 0.86) * 2.0 * activeC * 0.28;
  float shiftF = (noiseF - 0.94) * 2.0 * activeF * 0.10;

  return shiftC + shiftF;
}

// ── Circle ring SDF ───────────────────────────────────────────────────────────

float ringAlpha(vec2 p, float R, float hw, float feather) {
  float d = abs(length(p) - R) - hw;
  return smoothstep(feather, -feather, d);
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2  uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2  p   = (uvN - 0.5) * vec2(asp, 1.0);
  float t   = uTime;

  const float R  = 0.280; // ring radius
  const float HW = 0.032; // half-width of ring body
  const float FT = 0.006; // feather (anti-alias width)

  // Per-pixel glitch displacement
  float dx = glitchX(p.y, t);

  // Three offset copies for chromatic aberration
  // — magenta (R+B channels): shifted slightly right
  // — cyan    (G+B channels): shifted slightly left
  // — core (all channels):    base displacement only
  float caShift = 0.012 + 0.006 * sin(t * 3.0);

  vec2 pCore  = p + vec2(dx,              0.0);
  vec2 pMag   = p + vec2(dx + caShift,    0.0);
  vec2 pCyan  = p + vec2(dx - caShift,    0.0);

  float rCore = ringAlpha(pCore, R, HW,        FT);
  float rMag  = ringAlpha(pMag,  R, HW * 0.80, FT);
  float rCyan = ringAlpha(pCyan, R, HW * 0.80, FT);

  // Thin bright inner edge (the tightest band, no glitch offset)
  float rInner = ringAlpha(p, R, HW * 0.22, FT * 0.5);

  // ── Colour composition ────────────────────────────────────────────────────
  // Magenta  = hot pink  (1, 0, 1)  but leaning toward pink
  // Cyan     = electric blue-cyan (0, 1, 1)
  // Core     = blue-purple blend
  // Inner    = bright white-cyan highlight

  vec3 colMag   = vec3(0.95, 0.05, 0.90);  // hot pink/magenta
  vec3 colCyan  = vec3(0.05, 0.80, 1.00);  // electric cyan
  vec3 colCore  = vec3(0.35, 0.10, 0.90);  // deep violet-blue
  vec3 colInner = vec3(0.70, 0.95, 1.00);  // bright cyan-white

  // Additive blend of all layers
  vec3 col = vec3(0.0);
  col += colMag   * rMag  * 0.80;
  col += colCyan  * rCyan * 0.80;
  col += colCore  * rCore * 0.50;
  col += colInner * rInner * 1.20;

  // Outer glow — very soft halo bleeding past ring
  float glowR = ringAlpha(pCore, R, HW * 3.5, HW * 0.6) * (1.0 - rCore);
  col += mix(colMag, colCyan, 0.5) * glowR * 0.30;

  // Occasional bright horizontal streak (glitch flash)
  float streakY = p.y;
  float streakNoise = hash11(floor(streakY / 0.006) + floor(t * 22.0) * 1.37);
  float streak = step(0.97, streakNoise)                      // rare
               * step(-R - HW * 3.0, p.x)                    // not outside ring
               * step(p.x, R + HW * 3.0)
               * smoothstep(HW * 4.0, HW, abs(length(p) - R)); // near ring
  col += mix(colCyan, colMag, hash12(p + t)) * streak * 1.5;

  // Alpha: union of all ring layers
  float alpha = clamp(
    rCore + rMag * 0.7 + rCyan * 0.7 + rInner + glowR * 0.5 + streak * 0.8,
    0.0, 1.0
  );

  // Pre-multiplied alpha output
  fragColor = vec4(col * alpha, alpha);
}`;

export class GlitchCircleRingCamScreen extends Container {
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
        fragment: GLITCH_RING_FRAG,
      }),
      resources: { glitchRingUniforms: this.uniforms },
    });

    this.quad = new Sprite(Texture.WHITE);
    this.quad.filters = [filter];
    this.addChild(this.quad);
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.quad.width = w;
    this.quad.height = h;
    this.resolution[0] = w;
    this.resolution[1] = h;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    this.uniforms.uniforms.uTime = this.time;
  }
}
