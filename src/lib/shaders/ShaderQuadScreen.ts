import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";

import { obsAudio } from "../obsAudio";
import { FILTER_VERT } from "./filterVertex";

/**
 * Shared full-screen shader quad boilerplate: owns Texture.WHITE, uTime /
 * uResolution uniforms, resize handling, and an optional uAudio (level,
 * bass, mid, high) uniform driven by the OBS audio bridge. Subclasses pass
 * their fragment shader source and whether they want audio reactivity.
 */
export abstract class ShaderQuadScreen extends Container {
  public static assetBundles: string[] = [];

  protected readonly quad: Sprite;
  protected readonly uniforms: UniformGroup;
  private readonly resolution = new Float32Array([1920, 1080]);
  private readonly audioVec = new Float32Array(4);

  protected time = 0;

  protected constructor(
    fragmentSource: string,
    private readonly reactive = false,
  ) {
    super();

    this.uniforms = this.reactive
      ? new UniformGroup({
          uTime: { value: 0, type: "f32" },
          uResolution: { value: this.resolution, type: "vec2<f32>" },
          uAudio: { value: this.audioVec, type: "vec4<f32>" },
        })
      : new UniformGroup({
          uTime: { value: 0, type: "f32" },
          uResolution: { value: this.resolution, type: "vec2<f32>" },
        });

    const filter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: fragmentSource,
      }),
      resources: { screenUniforms: this.uniforms },
    });

    this.quad = new Sprite(Texture.WHITE);
    this.quad.filters = [filter];
    this.addChild(this.quad);

    if (this.reactive) void obsAudio.connect();
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

    if (this.reactive) {
      obsAudio.update(dt);
      this.audioVec[0] = obsAudio.level;
      this.audioVec[1] = obsAudio.bass;
      this.audioVec[2] = obsAudio.mid;
      this.audioVec[3] = obsAudio.high;
    }
  }
}
