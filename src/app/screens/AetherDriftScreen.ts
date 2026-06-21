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

// ── Aether Drift: double domain-warped FBM silk with iridescent sheen ────────
const AETHER_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

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

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = ROT * p * 2.03 + vec2(11.7, 5.3);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uvN = vTextureCoord;
  vec2 uv = (uvN - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime;

  // Glacial camera drift with a slow breathing zoom
  float zoom = 1.0 + 0.06 * sin(t * 0.05);
  vec2 cam = vec2(0.015 * t, 0.012 * sin(t * 0.07));
  vec2 p = uv * 2.4 * zoom + cam;

  // Double domain warp — the folded silk structure
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 w1 = p + 3.6 * q + vec2(1.7 + 0.09 * t, 9.2 - 0.06 * t);
  vec2 r = vec2(fbm(w1), fbm(w1 + vec2(8.3, 2.8)));
  float f = fbm(p + 3.2 * r);

  // Base grade: near-black abyss through indigo, teal undercurrent,
  // violet folds, warm light catching the crests
  vec3 deep = vec3(0.010, 0.014, 0.032);
  vec3 abyss = vec3(0.043, 0.073, 0.150);
  vec3 teal = vec3(0.000, 0.430, 0.520);
  vec3 violet = vec3(0.470, 0.160, 0.640);
  vec3 ember = vec3(1.000, 0.690, 0.400);

  vec3 col = mix(deep, abyss, clamp(f * f * 2.4, 0.0, 1.0));
  col = mix(col, teal, 0.55 * clamp(length(q) * 0.85, 0.0, 1.0));
  col = mix(col, violet, 0.50 * clamp(r.x * r.x * 1.5, 0.0, 1.0));

  float crest = smoothstep(0.58, 0.92, f);
  col += ember * crest * 0.38;

  // Silk sheen: shade the relief with a slowly orbiting light,
  // tint the specular with a thin-film iridescence cycle
  float px = uResolution.y * 0.0125;
  vec3 nrm = normalize(vec3(-dFdx(f) * px, -dFdy(f) * px, 1.0));
  vec3 ldir = normalize(vec3(0.6 * cos(t * 0.06), 0.6 * sin(t * 0.047), 0.55));
  float diff = clamp(dot(nrm, ldir), 0.0, 1.0);
  float spec = pow(diff, 24.0);

  vec3 irid =
    0.5 + 0.5 * cos(6.28318 * (f * 1.6 + t * 0.012 + vec3(0.0, 0.33, 0.67)));
  col += irid * spec * 0.45;
  col += vec3(0.90, 0.95, 1.00) * pow(diff, 90.0) * 0.35;

  // Drifting ember dust — three parallax layers of twinkling glints
  float dust = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 18.0 + fi * 14.0;
    vec2 sp = uv * sc + vec2(t * (0.25 + fi * 0.18), t * (0.05 + fi * 0.03)) +
      fi * 17.0;
    vec2 cell = floor(sp);
    float h = hash12(cell);
    if (h > 0.985) {
      vec2 fr = fract(sp) - 0.5;
      vec2 jitter = (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.6;
      float d = length(fr + jitter);
      float tw = 0.5 + 0.5 * sin(t * (1.5 + h * 4.0) + h * 40.0);
      dust += smoothstep(0.10, 0.0, d) * tw * (1.0 - fi * 0.25);
    }
  }
  col += vec3(0.95, 0.85, 0.70) * dust * 0.5;

  // Soft wandering glow, like distant light behind the veil
  vec2 gpos = vec2(0.42 * sin(t * 0.031), -0.22 + 0.10 * cos(t * 0.023));
  col += vec3(0.10, 0.13, 0.22) * exp(-2.1 * length(uv - gpos));

  // Cinematic finish: filmic curve, vignette, fine grain
  col = 1.0 - exp(-col * 2.0);

  vec2 vc = uvN - 0.5;
  col *= 1.0 - 1.1 * dot(vc, vc);

  float grain = hash12(uvN * uResolution + fract(t) * 100.0) - 0.5;
  col += grain * 0.015;

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

const RAZER_AETHER_FRAG = AETHER_FRAG.replace(
  `vec3 deep = vec3(0.010, 0.014, 0.032);
  vec3 abyss = vec3(0.043, 0.073, 0.150);
  vec3 teal = vec3(0.000, 0.430, 0.520);
  vec3 violet = vec3(0.470, 0.160, 0.640);
  vec3 ember = vec3(1.000, 0.690, 0.400);`,
  `vec3 deep = vec3(0.000, 0.010, 0.000);
  vec3 abyss = vec3(0.000, 0.055, 0.014);
  vec3 teal = vec3(0.000, 0.760, 0.260);
  vec3 violet = vec3(0.210, 1.000, 0.000);
  vec3 ember = vec3(0.690, 1.000, 0.000);`,
)
  .replace(
    `col += irid * spec * 0.45;
  col += vec3(0.90, 0.95, 1.00) * pow(diff, 90.0) * 0.35;`,
    `col += mix(vec3(0.210, 1.000, 0.000), vec3(0.000, 1.000, 0.560), irid) * spec * 0.42;
  col += vec3(0.75, 1.00, 0.45) * pow(diff, 90.0) * 0.32;`,
  )
  .replace(
    `col += vec3(0.95, 0.85, 0.70) * dust * 0.5;`,
    `col += vec3(0.55, 1.00, 0.08) * dust * 0.62;`,
  )
  .replace(
    `col += vec3(0.10, 0.13, 0.22) * exp(-2.1 * length(uv - gpos));`,
    `col += vec3(0.02, 0.18, 0.04) * exp(-2.1 * length(uv - gpos));`,
  );

export class AetherDriftScreen extends Container {
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
        fragment: this.fragmentSource,
      }),
      resources: { aetherUniforms: this.uniforms },
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

  protected get fragmentSource(): string {
    return AETHER_FRAG;
  }
}

export class RazerAetherDriftScreen extends AetherDriftScreen {
  protected override get fragmentSource(): string {
    return RAZER_AETHER_FRAG;
  }
}
