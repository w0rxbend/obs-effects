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

// ── Sunken Light: caustic ceiling, god rays, rising bioluminescent motes ─────
const SUNKEN_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

${HASH12_GLSL}

${VNOISE_GLSL}

// Iterated phase-warp caustic field — bright cells with filament edges
float caustic(vec2 uv, float t) {
  vec2 p = uv * 6.2831 - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float ft = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(ft - i.x) + sin(ft + i.y), sin(ft - i.y) + cos(ft + i.x));
    c += 1.0 /
      length(vec2(p.x / (sin(i.x + ft) / inten), p.y / (cos(i.y + ft) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  vec2 uvN = vTextureCoord;
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = vec2((uvN.x - 0.5) * aspect, uvN.y);

  float t = uTime;
  float depth = uvN.y; // 0 = surface, 1 = abyss

  // Water column: sunlit teal ceiling sinking into near-black abyss
  vec3 shallow = vec3(0.012, 0.230, 0.300);
  vec3 abyss = vec3(0.003, 0.016, 0.038);
  vec3 col = mix(shallow, abyss, pow(depth, 0.65));

  // Caustic ceiling: two scales, refracted slightly by drifting noise,
  // dying away with depth like real light through water
  vec2 drift = vec2(t * 0.012, t * 0.004);
  vec2 wobble = vec2(vnoise(uv * 2.0 + t * 0.05), vnoise(uv * 2.0 - t * 0.04));
  vec2 cuv = uv + (wobble - 0.5) * 0.08;
  float ca = caustic(cuv * 0.9 + drift, t * 0.30);
  float cb = caustic(cuv * 1.9 - drift * 1.6 + 7.3, t * 0.22);
  float causticFade = exp(-depth * 3.2);
  float causticMid = exp(-depth * 1.1) * 0.22;
  col += vec3(0.45, 0.95, 0.95) * ca * (causticFade * 0.85 + causticMid);
  col += vec3(0.25, 0.70, 0.80) * cb * (causticFade * 0.45 + causticMid * 0.6);

  // God rays: slanted shafts from a slowly wandering sun above the frame
  vec2 sun = vec2(0.35 * sin(t * 0.021), -0.45);
  vec2 toSun = uv - sun;
  float ang = atan(toSun.x, toSun.y);
  float rays =
    sin(ang * 14.0 + t * 0.30) * 0.5 + sin(ang * 31.0 - t * 0.22) * 0.30 +
    sin(ang * 53.0 + t * 0.16) * 0.20;
  rays = pow(clamp(rays * 0.5 + 0.5, 0.0, 1.0), 3.0);
  rays *= 0.4 + 0.6 * vnoise(vec2(ang * 5.0, t * 0.10));
  float rayFade = exp(-depth * 1.7) * smoothstep(2.2, 0.4, length(toSun));
  col += vec3(0.50, 0.85, 0.85) * rays * rayFade * 0.55;

  // Bright halo where the surface burns through
  col += vec3(0.55, 0.90, 0.85) * exp(-length(toSun) * 1.9) * 0.50;

  // Rising bioluminescent motes — three parallax layers swaying upward
  float motes = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 14.0 + fi * 12.0;
    float rise = t * (0.012 + fi * 0.008);
    vec2 sp = vec2(uv.x + sin(t * 0.10 + fi * 2.1) * 0.02, uvN.y + rise) * sc +
      fi * 31.0;
    vec2 cell = floor(sp);
    float h = hash12(cell);
    if (h > 0.982) {
      vec2 fr = fract(sp) - 0.5;
      vec2 jitter = (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.6;
      float d = length(fr + jitter);
      float pulse = 0.5 + 0.5 * sin(t * (0.8 + h * 2.5) + h * 40.0);
      motes += smoothstep(0.16, 0.0, d) * pulse * (1.0 - fi * 0.22);
    }
  }
  col += vec3(0.35, 0.95, 0.80) * motes * (0.25 + 0.55 * depth);

  // Cinematic finish: filmic curve, vignette, fine grain
  col = 1.0 - exp(-col * 2.1);

  vec2 vc = uvN - 0.5;
  col *= 1.0 - 1.0 * dot(vc, vc);

  float grain = hash12(uvN * uResolution + fract(t) * 100.0) - 0.5;
  col += grain * 0.014;

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

export class SunkenLightScreen extends Container {
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
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: SUNKEN_FRAG }),
      resources: { sunkenUniforms: this.uniforms },
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
