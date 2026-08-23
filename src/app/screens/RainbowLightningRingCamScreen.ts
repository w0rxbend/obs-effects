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

// ── Rainbow lightning ring ─────────────────────────────────────────────────────
// Transparent-background circular cam border.
// A jagged, spiky ring with full rainbow colour mapped radially
// (violet at outermost spike tips → red/magenta at inner edge).
// The inner circle stays clean so the webcam shows through.
const RAINBOW_RING_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;

const float PI  = 3.14159265358979;
const float TAU = 6.28318530718;

// ── Colour helpers ────────────────────────────────────────────────────────────

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

// ── Noise ─────────────────────────────────────────────────────────────────────

${HASH12_GLSL}

${VNOISE_GLSL}

// ── Spike profile at angle a ──────────────────────────────────────────────────
// How far the ring protrudes radially at this angle.
// Uses multi-octave |sin| zigzag → sharp, irregular lightning spikes.

float spikeProfile(float a, float t) {
  float rot = t * 0.09; // slow rotation

  // 3 layers of jagged zigzag spikes
  float z1 = abs(sin(a * 32.0 + rot * 3.1));  // primary fine spikes
  float z2 = abs(sin(a * 18.0 - rot * 2.3));  // medium spikes
  float z3 = abs(sin(a * 9.0  + rot * 1.7));  // large-scale envelope

  // Combine: large envelope shapes the medium spikes, medium shapes the fine
  float spike = pow(z1, 0.6) * pow(z2, 0.5) * z3;
  spike *= 0.14;

  // Extra tall occasional spikes (the dramatic lightning bolts)
  float tall1 = pow(abs(sin(a * 7.0 + rot * 1.4)), 5.0) * 0.100;
  float tall2 = pow(abs(sin(a * 5.0 - rot * 1.1 + 1.0)), 6.0) * 0.078;

  // Fine micro-jagging on top
  float micro = abs(sin(a * 65.0 + t * 4.0)) * 0.016;

  return spike + tall1 + tall2 + micro;
}

// Inward jagging on the inner edge — prominent, matches reference image
float innerJag(float a, float t) {
  float rot = t * 0.09;
  float z1 = abs(sin(a * 28.0 + rot * 2.5));
  float z2 = abs(sin(a * 14.0 - rot * 1.8));
  float z3 = abs(sin(a * 8.0  + rot * 1.2));
  float spike = pow(z1, 0.7) * pow(z2, 0.5) * z3 * 0.075;
  float tall  = pow(abs(sin(a * 6.0 + rot * 1.0)), 5.0) * 0.055;
  float micro = abs(sin(a * 50.0 + t * 3.5)) * 0.012;
  return spike + tall + micro;
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2 p   = (uvN - 0.5) * vec2(asp, 1.0);
  float t  = uTime;

  float rC = length(p);
  float a  = atan(p.y, p.x);

  // Ring parameters
  const float RR  = 0.310; // ring centre radius
  const float BHW = 0.042; // base half-width

  float outerR = RR + BHW + spikeProfile(a, t);
  float innerR = RR - BHW * 0.70 - innerJag(a, t);

  // Inner mask — jagged inner edge matches reference
  float maskI = smoothstep(innerR - 0.006, innerR, rC);
  // Outer mask — sharp zigzag edge
  float maskO = smoothstep(outerR + 0.006, outerR, rC);
  float ring  = maskI * maskO;

  // ── Outer glow / halo beyond spike tips ────────────────────────────────────
  // Soft coloured aura that bleeds past the hard outer edge
  float glowR  = outerR + 0.055;
  float glowMask = smoothstep(glowR, outerR - 0.005, rC) * maskI * (1.0 - maskO);

  // ── Scattered micro-droplets ───────────────────────────────────────────────
  float drops = 0.0;
  float rot0 = t * 0.08;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float da = fi * 0.628 + rot0 + 0.14 * sin(t * 0.4 + fi * 1.9);
    float dr = RR + 0.19 + 0.08 * sin(t * 1.1 + fi * 2.3);
    float ds = 0.0038 + 0.0018 * sin(t * 2.0 + fi * 1.6);
    vec2  dp = dr * vec2(cos(da), sin(da));
    drops += smoothstep(ds, ds * 0.2, length(p - dp));
  }
  drops = min(drops, 1.0);

  float alpha = clamp(ring + glowMask * 0.6 + drops, 0.0, 1.0);

  // ── Rainbow colour mapping ──────────────────────────────────────────────────
  // ringDepth = 0 at inner edge, 1 at outer spike tip
  float ringDepth = clamp((rC - innerR) / max(outerR - innerR, 0.001), 0.0, 1.0);

  // Spectrum: inner = red/magenta (hue ≈ 0), outer = violet (hue ≈ 0.78)
  // We also shift slowly with time for a rotating rainbow
  float hue = ringDepth * 0.80 + t * 0.04;
  float sat = 1.0;
  float lum = 0.50 + 0.08 * ringDepth; // slightly brighter at outer edge

  vec3 rainbowCol = hsl2rgb(fract(hue), sat, lum);

  // Glow colour: slightly lighter, same hue at the distance
  float glowHue = outerR > 0.0 ? fract((rC / outerR) * 0.80 + t * 0.04) : hue;
  vec3 glowCol  = hsl2rgb(glowHue, 1.0, 0.62);

  // Drops take the hue of their position
  float dropHue = fract(atan(p.y, p.x) / TAU + t * 0.05);
  vec3  dropCol = hsl2rgb(dropHue, 1.0, 0.60);

  // Blend layers
  vec3 col = rainbowCol;
  col = mix(col, glowCol,  glowMask * 0.6 / max(alpha, 0.001));
  col = mix(col, dropCol,  drops    * 0.9 / max(alpha, 0.001));

  // Brighten outermost spike tips (they flare white-ish)
  float tipBright = smoothstep(outerR - 0.010, outerR, rC) * maskI;
  col = mix(col, vec3(1.0), tipBright * 0.55);

  // Inner edge dark ring (strengthens the clean hole appearance)
  float innerDark = smoothstep(innerR + 0.022, innerR + 0.003, rC) * maskO;
  col = mix(col, col * 0.30, innerDark * 0.60);

  // Pre-multiplied alpha
  fragColor = vec4(col * alpha, alpha);
}`;

export class RainbowLightningRingCamScreen extends Container {
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
        fragment: RAINBOW_RING_FRAG,
      }),
      resources: { rainbowRingUniforms: this.uniforms },
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
