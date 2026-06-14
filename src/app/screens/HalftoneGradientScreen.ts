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

// ── Halftone Gradient: drifting purple→pink→orange→yellow sweep printed
//    through an animated rotated halftone screen ──────────────────────────────
const HALFTONE_FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;

vec3 palette(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c0 = vec3(0.45, 0.12, 0.62); // purple
  vec3 c1 = vec3(0.83, 0.10, 0.45); // magenta
  vec3 c2 = vec3(0.95, 0.20, 0.40); // pink-red
  vec3 c3 = vec3(1.00, 0.45, 0.18); // orange
  vec3 c4 = vec3(1.00, 0.60, 0.12); // amber
  vec3 c5 = vec3(1.00, 0.78, 0.12); // yellow
  vec3 col = mix(c0, c1, smoothstep(0.00, 0.22, x));
  col = mix(col, c2, smoothstep(0.22, 0.45, x));
  col = mix(col, c3, smoothstep(0.45, 0.68, x));
  col = mix(col, c4, smoothstep(0.68, 0.86, x));
  col = mix(col, c5, smoothstep(0.86, 1.00, x));
  return col;
}

void main() {
  vec2 uv = vTextureCoord;
  float a = uv.x;        // 0 left .. 1 right
  float b = uv.y;        // 0 top  .. 1 bottom
  float flow = uTime * 0.6;

  // Diagonal sweep (pink/red bottom-left → yellow top-right) with slow swirl.
  float gc = a * 0.5 + (1.0 - b) * 0.5;
  gc += 0.18 * sin((a * 2.2 - b * 1.7) + flow * 0.6);
  gc += 0.06 * sin(b * 6.0 + flow);
  gc = clamp(gc, 0.0, 1.0);
  vec3 col = palette(gc);

  // Inject purple on the right edge and top-left corner.
  float pf = smoothstep(0.72, 1.0, a);
  pf = max(pf, smoothstep(0.78, 1.0, (1.0 - b) * 0.6 + (1.0 - a) * 0.6));
  col = mix(col, vec3(0.45, 0.14, 0.62), pf * 0.75);

  // Rotated halftone screen.
  float aspect = uResolution.x / uResolution.y;
  vec2 pc = vec2(uv.x * aspect, uv.y);
  float ca = cos(0.4);
  float sa = sin(0.4);
  vec2 rp = vec2(pc.x * ca - pc.y * sa, pc.x * sa + pc.y * ca);
  float grid = 64.0;
  vec2 f = fract(rp * grid) - 0.5;

  // Moving brightness field drives dot size + circle→square morph.
  float bwave = 0.5 + 0.5 * sin((a * 4.0 + b * 3.0) - flow * 1.4 + 6.0 * gc);
  float rad = mix(0.14, 0.5, bwave);
  float sq = smoothstep(0.4, 0.9, bwave);
  float dd = mix(length(f), max(abs(f.x), abs(f.y)), sq);
  float mask = smoothstep(rad, rad - 0.06, dd);

  vec3 gap = col * 0.82;
  vec3 dot = min(col * 1.12, vec3(1.0));
  vec3 outc = mix(gap, dot, mask);

  fragColor = vec4(outc, 1.0);
}`;

export class HalftoneGradientScreen extends Container {
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
        fragment: HALFTONE_FRAG,
      }),
      resources: { halftoneUniforms: this.uniforms },
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
