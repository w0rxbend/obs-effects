import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";

// ── Standard PixiJS v8 filter vertex ─────────────────────────────────────────
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

// ── Water splash ring shader ───────────────────────────────────────────────────
// A circular fluid-splash frame with transparent interior and exterior.
// Inner circle stays clean for the webcam viewport.
// Outer edge is domain-warped with noise-driven Gaussian splashes.
const SPLASH_RING_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

const float PI  = 3.14159265358979;
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

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p  = p * 2.03 + vec2(3.71, 1.43);
    a *= 0.50;
  }
  return v;
}

// ── Angular geometry ──────────────────────────────────────────────────────────

// Minimum angular distance in [0, PI]
float angDist(float a, float b) {
  return abs(mod(a - b + PI, TAU) - PI);
}

// Gaussian bump at a specific angle
float bump(float a, float centre, float hw, float h) {
  float d = angDist(a, centre);
  return h * exp(-(d * d) / (hw * hw));
}

// ── Outer splash profile ──────────────────────────────────────────────────────
// Returns extra radial distance the ring protrudes at angle a.
float outerProfile(float a, float t) {
  float rot = t * 0.07; // slow global rotation drives all splash positions

  // Fine multi-harmonic undulation (fluid membrane)
  float w  = 0.014 * sin(a * 2.0 + t * 0.28 + rot * 2.1);
       w += 0.010 * sin(a * 3.0 - t * 0.22 + rot * 1.7 + 1.1);
       w += 0.007 * sin(a * 5.0 + t * 0.40 + 2.4);
       w += 0.004 * sin(a * 9.0 - t * 0.55 + 0.9);
  w = max(0.0, w);

  // 5 large splashes rotating slowly with individual breath-pulse
  float s1 = bump(a, rot + 1.35, 0.42, 0.092 * (0.72 + 0.28 * sin(t * 0.80)));
  float s2 = bump(a, rot + 2.95, 0.30, 0.082 * (0.72 + 0.28 * sin(t * 0.65 + 1.4)));
  float s3 = bump(a, rot - 1.55, 0.36, 0.072 * (0.72 + 0.28 * sin(t * 0.90 + 2.2)));
  float s4 = bump(a, rot - 0.30, 0.22, 0.058 * (0.72 + 0.28 * sin(t * 0.75 + 0.7)));
  float s5 = bump(a, rot + 0.60, 0.14, 0.044 * (0.72 + 0.28 * sin(t * 1.10 + 3.1)));

  return w + s1 + s2 + s3 + s4 + s5;
}

// Slight inward waviness at the inner edge
float innerProfile(float a, float t) {
  float rot = t * 0.07;
  float w  = 0.008 * sin(a * 3.0 + t * 0.22 + rot * 1.8 + 0.5);
       w += 0.005 * sin(a * 5.0 - t * 0.34 + 1.8);
  return max(0.0, w);
}

// ── Droplets ──────────────────────────────────────────────────────────────────
// Small circles scattered just outside the ring, orbiting slowly.
float droplets(vec2 p, float t) {
  float d = 0.0;
  float rot = t * 0.06;
  for (int i = 0; i < 13; i++) {
    float fi = float(i);
    float da = fi * 0.4833 + rot + 0.16 * sin(t * 0.38 + fi * 1.73);
    float dr = 0.20 + 0.042 * sin(t * 0.92 + fi * 2.15);
    float ds = 0.0042 + 0.0022 * sin(t * 1.60 + fi * 1.44);
    vec2  dp = dr * vec2(cos(da), sin(da));
    d += smoothstep(ds, ds * 0.25, length(p - dp));
  }
  return min(d, 1.0);
}

// Fine tendrils: very thin radial filaments at splash tips
float tendrils(vec2 p, float t) {
  float d = 0.0;
  float rot = t * 0.07;
  float[5] bases;
  bases[0] = rot + 1.35;
  bases[1] = rot + 2.95;
  bases[2] = rot - 1.55;
  bases[3] = rot - 0.30;
  bases[4] = rot + 0.60;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ba = bases[i];
    float r = length(p);
    float a = atan(p.y, p.x);
    float ad = angDist(a, ba);
    float width = 0.008 + 0.003 * sin(t * 0.7 + fi);
    float taper = exp(-ad * ad / (width * width));
    float radMask = smoothstep(0.13, 0.15, r) * smoothstep(0.28, 0.22, r);
    d += taper * radMask * (0.6 + 0.4 * sin(t * 0.6 + fi * 1.9));
  }
  return clamp(d, 0.0, 1.0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 uvN = vTextureCoord;
  float asp = uResolution.x / uResolution.y;
  vec2 p  = (uvN - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  // Gentle domain warp for fluid surface motion
  vec2 wp = p + 0.018 * vec2(
    fbm(p * 3.6 + vec2(t * 0.074, 0.42)),
    fbm(p * 3.6 + vec2(0.91, t * 0.086))
  );

  float rC = length(p);        // clean radius — keeps inner hole circular
  float rW = length(wp);       // warped radius — organic outer edge
  float aW = atan(wp.y, wp.x); // warped angle for splash placement

  // Ring radii
  const float RR  = 0.155; // ring centre radius
  const float BHW = 0.022; // base half-width

  float outer = RR + BHW + outerProfile(aW, t);
  float inner = RR - BHW * 0.70 - innerProfile(aW, t);

  // Sharp inner circle (clean viewport) + organic outer (splash)
  float maskI = smoothstep(inner - 0.005, inner, rC);
  float maskO = smoothstep(outer + 0.012, outer, rW);
  float ring  = maskI * maskO;

  // Tendrils (in warped space)
  float tend  = tendrils(wp, t) * maskI;

  // Droplets in unwarped space
  float drops = droplets(p, t);

  float alpha = clamp(ring + tend + drops, 0.0, 1.0);

  // ── Colour ───────────────────────────────────────────────────────────────
  vec3 base  = vec3(0.12, 0.88, 0.18); // toxic green body
  vec3 lite  = vec3(0.68, 1.00, 0.30); // bright acid highlight

  // Directional specular — light from upper-left
  vec3 ldir  = normalize(vec3(-0.42, 0.65, 0.65));
  vec3 snorm = normalize(vec3(wp, 0.28));
  float spec = pow(max(0.0, dot(snorm, ldir)), 4.5);

  // Outer edge fresnel — very bright rim at the furthest protrusion tip
  float outerFresnel = smoothstep(0.018, 0.0, outer - rW) * maskI;

  // Inner edge rim glow — soft light leak facing the hole
  float innerRim = smoothstep(inner + 0.020, inner + 0.003, rC) * maskO;

  // Shadow: slightly darker toward lower-right (completes 3-D look)
  float shadow = dot(normalize(wp), vec2(0.35, -0.55));
  shadow = smoothstep(0.1, -0.20, shadow) * 0.22;

  vec3 col = base;
  col = mix(col, lite, spec * 0.55);
  col = mix(col, lite, outerFresnel * 0.45);
  col = mix(col, lite * 0.88, innerRim * 0.30);
  col = mix(col, col * 0.72, shadow);

  // Tendril and drops share the base blue but slightly brighter
  col = mix(col, lite * 0.90, (tend + drops) * 0.25 * (1.0 - ring));

  // ── Pre-multiplied alpha output ──────────────────────────────────────────
  fragColor = vec4(col * alpha, alpha);
}`;

export class WaterSplashRingCamScreen extends Container {
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
        fragment: SPLASH_RING_FRAG,
      }),
      resources: { splashRingUniforms: this.uniforms },
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
