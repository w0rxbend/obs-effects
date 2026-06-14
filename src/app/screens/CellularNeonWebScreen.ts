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

const CELLULAR_WEB_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform float uVariant;
uniform vec2 uResolution;

#define TAU 6.28318530718

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

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

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);

  for (int i = 0; i < 5; i++) {
    value += amplitude * vnoise(p);
    p = rot * p * 2.03 + vec2(19.13, 7.17);
    amplitude *= 0.52;
  }

  return value;
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 lavaPalette(float t) {
  vec3 ember = palette(
    t,
    vec3(0.78, 0.23, 0.08),
    vec3(0.38, 0.24, 0.12),
    vec3(1.0, 0.74, 0.42),
    vec3(0.02, 0.18, 0.35)
  );
  vec3 hot = vec3(1.0, 0.50, 0.05);
  vec3 rose = vec3(0.95, 0.16, 0.38);
  return mix(ember, mix(hot, rose, smoothstep(0.50, 1.0, t)), 0.68);
}

vec3 prismPalette(float t) {
  return palette(
    t,
    vec3(0.58, 0.58, 0.56),
    vec3(0.48, 0.42, 0.44),
    vec3(1.00, 0.88, 0.72),
    vec3(0.00, 0.18, 0.36)
  );
}

vec3 glassPalette(float t) {
  vec3 cyan = vec3(0.00, 0.94, 0.78);
  vec3 blue = vec3(0.06, 0.38, 1.00);
  vec3 violet = vec3(0.55, 0.12, 1.00);
  vec3 pink = vec3(1.00, 0.06, 0.78);
  vec3 orange = vec3(1.00, 0.36, 0.04);
  vec3 cool = mix(cyan, blue, smoothstep(0.18, 0.48, t));
  vec3 neon = mix(cool, mix(violet, pink, smoothstep(0.50, 0.86, t)), smoothstep(0.34, 0.76, t));
  return mix(neon, orange, smoothstep(0.88, 1.0, t) * 0.72);
}

vec3 veinPalette(float t) {
  vec3 base = mix(vec3(0.00, 0.82, 0.78), vec3(0.10, 0.42, 1.00), smoothstep(0.22, 0.76, t));
  vec3 pulse = mix(vec3(1.00, 0.08, 0.68), vec3(1.00, 0.42, 0.08), smoothstep(0.62, 1.0, t));
  return mix(base, pulse, smoothstep(0.78, 1.0, t) * 0.55);
}

struct VoronoiResult {
  float first;
  float second;
  float cell;
  vec2 point;
};

VoronoiResult voronoi(vec2 p, float t, float jitter) {
  vec2 base = floor(p);
  vec2 f = fract(p);
  float first = 100.0;
  float second = 100.0;
  float cell = 0.0;
  vec2 point = vec2(0.0);

  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 cellId = base + g;
      vec2 rnd = hash22(cellId);
      vec2 orbit = vec2(
        sin(t * (0.23 + rnd.x * 0.11) + rnd.y * TAU),
        cos(t * (0.19 + rnd.y * 0.12) + rnd.x * TAU)
      );
      vec2 feature = g + 0.5 + (rnd - 0.5) * jitter + orbit * (0.12 + jitter * 0.05);
      vec2 delta = feature - f;
      float d = dot(delta, delta);

      if (d < first) {
        second = first;
        first = d;
        cell = hash12(cellId + 17.0);
        point = cellId + feature;
      } else if (d < second) {
        second = d;
      }
    }
  }

  return VoronoiResult(sqrt(first), sqrt(second), cell, point);
}

vec3 membraneColor(float chroma, float variant, vec2 uv, vec2 p, float t) {
  float grain = fbm(p * 1.45 + vec2(t * 0.07, -t * 0.045));
  float brushed = fbm(vec2(p.x * 4.4 + t * 0.18, p.y * 0.72 - t * 0.06));
  float tone = fract(chroma + grain * 0.18 + brushed * 0.08);

  if (variant < 0.5) {
    tone = fract(0.05 + p.y * 0.08 - p.x * 0.035 + grain * 0.24 + t * 0.035);
    return lavaPalette(tone);
  }

  if (variant < 1.5) {
    tone = fract(0.56 + uv.x * 0.52 - uv.y * 0.66 + grain * 0.20 + t * 0.025);
    return prismPalette(tone);
  }

  if (variant < 2.5) {
    tone = fract(0.44 + uv.y * 0.70 - uv.x * 0.20 + grain * 0.14 + t * 0.018);
    return glassPalette(tone);
  }

  tone = fract(0.38 + p.x * 0.04 + p.y * 0.08 + grain * 0.18 + t * 0.06);
  return veinPalette(tone);
}

float diagonalMask(vec2 uv, float variant) {
  float d0 = smoothstep(-0.46, 0.30, uv.y + uv.x * 0.35);
  float d1 = 1.0 - smoothstep(0.70, 1.08, uv.y - uv.x * 0.18);
  float sparse = d0 * d1;

  if (variant < 0.5) {
    return mix(0.70, 1.08, sparse);
  }

  if (variant > 2.5) {
    float lane = abs(uv.y - 0.12 - uv.x * 0.50);
    float lane2 = abs(uv.y + 0.34 + uv.x * 0.26);
    return max(smoothstep(0.62, 0.12, lane), smoothstep(0.45, 0.10, lane2));
  }

  return 1.0;
}

void main() {
  vec2 uv01 = vTextureCoord;
  vec2 uv = uv01 - 0.5;
  uv.x *= uResolution.x / uResolution.y;

  float variant = uVariant;
  float t = uTime;
  float scale = 4.15;
  float thickness = 0.135;
  float softness = 0.036;
  float jitter = 0.92;
  vec2 stretch = vec2(1.24, 0.82);
  float rotation = -0.42;

  if (variant > 0.5 && variant < 1.5) {
    scale = 5.35;
    thickness = 0.122;
    softness = 0.034;
    jitter = 0.84;
    stretch = vec2(1.04, 0.98);
    rotation = -0.10;
  } else if (variant > 1.5 && variant < 2.5) {
    scale = 3.55;
    thickness = 0.112;
    softness = 0.028;
    jitter = 0.72;
    stretch = vec2(1.42, 0.76);
    rotation = -0.72;
  } else if (variant > 2.5) {
    scale = 3.85;
    thickness = 0.072;
    softness = 0.024;
    jitter = 1.08;
    stretch = vec2(1.58, 0.64);
    rotation = -0.62;
  }

  float breath = sin(t * 0.37) * 0.035;
  mat2 rot = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  vec2 warp = vec2(
    fbm(uv * 1.7 + vec2(t * 0.035, 4.2)),
    fbm(uv * 1.7 + vec2(-3.1, t * 0.028))
  ) - 0.5;
  vec2 p = rot * (uv + warp * 0.18) * stretch * scale;
  p += vec2(t * 0.035, -t * 0.024);

  VoronoiResult v = voronoi(p, t, jitter);
  float borderDistance = v.second - v.first;
  float local = fbm(v.point * 0.58 + t * 0.04);
  float widthMod = 0.78 + local * 0.52 + breath;
  float laneMask = diagonalMask(uv, variant);
  float membrane = smoothstep(thickness * widthMod + softness, thickness * widthMod - softness, borderDistance);

  float innerMembrane = smoothstep(thickness * 0.48, thickness * 0.05, borderDistance);
  float edgeLine = smoothstep(thickness * 0.90, thickness * 0.60, borderDistance) -
    smoothstep(thickness * 0.42, thickness * 0.18, borderDistance);
  float microPore = smoothstep(0.030, 0.0, abs(vnoise(p * 5.8 + t * 0.08) - 0.72)) *
    smoothstep(thickness * 0.78, thickness * 0.08, borderDistance);

  if (variant > 2.5) {
    membrane *= laneMask;
    innerMembrane *= laneMask;
    edgeLine *= laneMask;
    microPore *= laneMask;
  } else {
    membrane *= laneMask;
  }

  float chroma = fract(v.cell + fbm(p * 0.36 + t * 0.02) * 0.35);
  vec3 color = membraneColor(chroma, variant, uv01, p, t);

  float texture = fbm(p * 3.7 + vec2(t * 0.13, -t * 0.09));
  float brush = fbm(vec2(p.x * 6.2 + t * 0.22, p.y * 0.9));
  color *= 0.84 + texture * 0.30 + brush * 0.12;
  color += color * innerMembrane * 0.32;
  color += vec3(1.0, 0.92, 0.78) * edgeLine * 0.12;

  if (variant < 0.5) {
    color += vec3(1.0, 0.20, 0.04) * microPore * 0.35;
  } else if (variant > 0.5 && variant < 1.5) {
    color += vec3(0.95, 1.0, 0.88) * microPore * 0.28;
  }

  float glow = smoothstep(thickness * 2.15, 0.0, borderDistance);
  float pulse = 0.5 + 0.5 * sin(t * 1.35 + v.cell * TAU + p.x * 0.45);
  glow *= 0.36 + pulse * 0.16;

  vec3 bg = vec3(0.0);

  if (variant > 1.5 && variant < 2.5) {
    vec2 backP = rot * (uv * vec2(1.18, 0.76) * 2.9 + vec2(t * -0.012, t * 0.016));
    VoronoiResult back = voronoi(backP, t * 0.42, 0.68);
    float shadowWeb = smoothstep(0.115, 0.020, back.second - back.first);
    float panel = fbm(uv * 5.0 + vec2(t * 0.015, 0.0));
    bg += vec3(0.016, 0.017, 0.019) + vec3(0.07) * shadowWeb * (0.18 + panel * 0.24);
  }

  if (variant > 2.5) {
    vec2 backP = uv * vec2(1.3, 0.7) * 3.0 + vec2(t * 0.010, -t * 0.018);
    VoronoiResult back = voronoi(backP, t * 0.32, 0.94);
    float ghost = smoothstep(0.070, 0.012, back.second - back.first);
    bg += vec3(0.010, 0.013, 0.016) + vec3(0.030, 0.042, 0.050) * ghost * 0.34;
  }

  float membraneMix = clamp(membrane, 0.0, 1.0);
  vec3 col = mix(bg, color, membraneMix);
  col += color * glow * (variant > 2.5 ? 0.42 : 0.26);

  if (variant < 0.5) {
    col += vec3(0.10, 0.02, 0.00) * smoothstep(0.42, 0.0, borderDistance) * 0.35;
  }

  if (variant > 2.5) {
    float signal = smoothstep(0.965, 1.0, sin(t * 0.9 + v.cell * 18.0 + v.point.x * 1.3));
    col += color * signal * smoothstep(thickness * 0.95, 0.0, borderDistance) * 0.62;
  }

  vec2 vignetteUv = uv01 - 0.5;
  float vignette = 1.0 - dot(vignetteUv, vignetteUv) * (variant > 0.5 && variant < 1.5 ? 0.58 : 0.94);
  col *= max(vignette, 0.0);

  float grain = hash12(uv01 * uResolution + fract(t) * 131.0) - 0.5;
  col += grain * (variant > 0.5 && variant < 1.5 ? 0.018 : 0.012);
  col = 1.0 - exp(-max(col, vec3(0.0)) * 1.38);

  fragColor = vec4(col, 1.0);
}`;

export class CellularNeonWebScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly quad: Sprite;
  private readonly uniforms: UniformGroup;
  private readonly resolution = new Float32Array([1920, 1080]);
  private time = 0;

  protected constructor(variant: number) {
    super();

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: "f32" },
      uVariant: { value: variant, type: "f32" },
      uResolution: { value: this.resolution, type: "vec2<f32>" },
    });

    const filter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: CELLULAR_WEB_FRAG,
      }),
      resources: { cellularUniforms: this.uniforms },
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
