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

// Monochrome triangle grid + sparkle stars
// Each rectangle cell is split diagonally — upper-left and lower-right triangles get
// independently noise-driven brightness values. Sparkle particles are scattered on top.
const FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

// ── Hash / noise helpers ────────────────────────────────────────────────────
float hash1(float n) { return fract(sin(n) * 43758.5453); }

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

float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + vec2(5.2, 3.7);
    a *= 0.50;
  }
  return v;
}

// ── Triangle grid ───────────────────────────────────────────────────────────
float triangleBrightness(vec2 cellIdx, float triId, float t) {
  // Large-scale noise blob — drives which areas cluster bright vs dark
  vec2 nc = cellIdx * 0.07 + vec2(t * 0.035, t * 0.018);
  float large = fbm(nc);

  // Per-triangle unique seed for micro-variation
  float seed = hash2(cellIdx * 31.7 + vec2(triId * 17.3, triId * 5.9));

  // Combine: large pattern with per-cell detail sprinkled in
  float raw = mix(large, seed, 0.40);
  raw = clamp(raw, 0.0, 1.0);

  // Power curve: push distribution toward black (like the ref — mostly dark)
  float bright = pow(raw, 1.6);

  // Slow individual flicker per triangle
  float flicker = sin(t * (0.4 + seed * 1.8) + seed * 6.283) * 0.5 + 0.5;
  bright = mix(bright, bright * (0.7 + 0.3 * flicker), 0.12);

  return clamp(bright, 0.0, 1.0);
}

// ── Sparkle star shape ──────────────────────────────────────────────────────
// Returns glow+star intensity for a single sparkle at position sparklePx
float sparkle(vec2 px, vec2 sparklePx, float size, float twinkle) {
  vec2 d = px - sparklePx;
  float dist = length(d);

  // Radial soft glow
  float glow = exp(-dist * dist / (size * size * 1.2)) * twinkle;

  // 4-point star spike: bright along both axes, falls off diagonally
  // Uses cross-shaped spike function
  if (dist < size * 2.2) {
    vec2 sd = d / size;
    float sdLen = length(sd);

    // Spike along X and Y axes — creates the 4-point cross star
    float spikeX = exp(-sd.y * sd.y * 12.0) * exp(-sdLen * 0.5);
    float spikeY = exp(-sd.x * sd.x * 12.0) * exp(-sdLen * 0.5);
    float star = max(spikeX, spikeY) * twinkle * 0.9;

    // Tiny bright core
    float core = smoothstep(0.18, 0.0, sdLen) * twinkle;

    glow = max(glow, max(star, core));
  }

  return glow;
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 px  = uvN * uResolution;
  float t  = uTime;

  // ── TRIANGLE GRID ─────────────────────────────────────────────────────────
  float cellSize = 54.0; // pixels per cell

  vec2 cellIdx  = floor(px / cellSize);
  vec2 localUV  = fract(px / cellSize); // [0,1] local to cell

  // Diagonal split: upper-left triangle if x+y < 1
  float triId  = (localUV.x + localUV.y < 1.0) ? 0.0 : 1.0;
  float bright = triangleBrightness(cellIdx, triId, t);

  // Thin dark seam between triangles along the split diagonal
  float diagDist = abs(localUV.x + localUV.y - 1.0) * cellSize; // pixels from diagonal
  float seam = smoothstep(1.2, 0.0, diagDist) * 0.7;

  // Also thin grid lines along cell borders
  float bx = min(localUV.x, 1.0 - localUV.x) * cellSize;
  float by = min(localUV.y, 1.0 - localUV.y) * cellSize;
  float gridLine = smoothstep(1.2, 0.0, min(bx, by)) * 0.65;

  float lineMask = max(seam, gridLine);
  bright = mix(bright, 0.0, lineMask);

  vec3 col = vec3(bright);

  // ── SPARKLE PARTICLES ─────────────────────────────────────────────────────
  // 50 sparkle points procedurally scattered, slowly drifting
  float sparkleAccum = 0.0;

  for (int i = 0; i < 50; i++) {
    float fi = float(i);

    // Base position & drift speed (all unique per sparkle)
    float bx0 = hash1(fi * 7.39 + 0.13);
    float by0 = hash1(fi * 3.71 + 0.57);
    float dx   = (hash1(fi * 11.31) - 0.5) * 0.025;
    float dy   = (hash1(fi * 5.17)  - 0.5) * 0.020;

    vec2 sPos = vec2(
      fract(bx0 + dx * t) * uResolution.x,
      fract(by0 + dy * t) * uResolution.y
    );

    // Individual twinkle phase — raised to power for sharp on/off feel
    float phase = hash1(fi * 2.37) * 6.283;
    float freq  = 1.0 + hash1(fi * 4.13) * 2.5;
    float tw    = pow(max(0.0, sin(t * freq + phase)), 3.0);

    if (tw < 0.04) continue; // skip dim sparkles entirely

    float sz = 10.0 + hash1(fi * 1.77) * 16.0;
    sparkleAccum += sparkle(px, sPos, sz, tw);
  }

  // Add sparkles as additive white light
  col += vec3(clamp(sparkleAccum, 0.0, 1.0));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class TriangleSparkleScreen extends Container {
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
      resources: { triUniforms: this.uniforms },
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
