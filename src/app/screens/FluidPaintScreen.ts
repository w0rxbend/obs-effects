import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  RenderTexture,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";
import { engine } from "../getEngine";

// ── Simulation resolution (velocity / pressure / divergence fields) ────────
const SIM_W = 256;
const SIM_H = 144;

// ── Dye field resolution ───────────────────────────────────────────────────
const DYE_W = 1280;
const DYE_H = 720;

// ── Simulation tuning ──────────────────────────────────────────────────────
const VEL_DISSIPATION = 0.989;
const DYE_DISSIPATION = 0.998;
const PRESSURE_ITERATIONS = 20;
const VORTICITY_STRENGTH = 22;

// ── Catppuccin Mocha palette [r, g, b] (0–1) ──────────────────────────────
const PALETTE: [number, number, number][] = [
  [0.796, 0.651, 0.969], // Mauve
  [0.537, 0.706, 0.98], // Blue
  [0.58, 0.886, 0.835], // Teal
  [0.98, 0.702, 0.529], // Peach
  [0.651, 0.89, 0.631], // Green
  [0.961, 0.761, 0.906], // Pink
  [0.961, 0.878, 0.863], // Rosewater
  [0.537, 0.863, 0.922], // Sky
  [0.976, 0.886, 0.686], // Yellow
  [0.953, 0.545, 0.659], // Red
];

// ── PixiJS v8 standard filter vertex (matches defaultFilter.vert exactly) ──
// uOutputTexture.z handles the Y-flip needed when rendering to RenderTextures.
// GlProgram will auto-prepend `#version 300 es` because the fragment has it.
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

// ── Pass 1 & 7: Semi-Lagrangian advection (velocity or dye) ───────────────
// uTexture  = field to advect (sprite texture = read RT)
// uVelocity = velocity field (extra sampler, updated each pass)
const ADVECT_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uDissipation;
void main() {
  // Velocity is in float texture (actual UV displacement); 0.0004 keeps motion slow
  vec2 vel = texture(uVelocity, vTextureCoord).xy * 0.0004;
  vec2 prevTextureCoord = clamp(vTextureCoord - vel * uDt, vec2(0.0), vec2(1.0));
  fragColor = texture(uTexture, prevTextureCoord) * uDissipation;
}`;

// ── Pass 2a: Compute curl (ω = ∂v/∂x − ∂u/∂y) ────────────────────────────
const CURL_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uTexelSize;
void main() {
  float vL = texture(uTexture, vTextureCoord - vec2(uTexelSize.x, 0.0)).y;
  float vR = texture(uTexture, vTextureCoord + vec2(uTexelSize.x, 0.0)).y;
  float uT = texture(uTexture, vTextureCoord + vec2(0.0, uTexelSize.y)).x;
  float uB = texture(uTexture, vTextureCoord - vec2(0.0, uTexelSize.y)).x;
  fragColor = vec4(0.5 * (vR - vL - uT + uB), 0.0, 0.0, 1.0);
}`;

// ── Pass 2b: Vorticity confinement force ──────────────────────────────────
const VORTICITY_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uVorticity;
void main() {
  float cL = abs(texture(uCurl, vTextureCoord - vec2(uTexelSize.x, 0.0)).r);
  float cR = abs(texture(uCurl, vTextureCoord + vec2(uTexelSize.x, 0.0)).r);
  float cT = abs(texture(uCurl, vTextureCoord + vec2(0.0, uTexelSize.y)).r);
  float cB = abs(texture(uCurl, vTextureCoord - vec2(0.0, uTexelSize.y)).r);
  float C  = texture(uCurl, vTextureCoord).r;
  vec2 force = 0.5 * vec2(cT - cB, cR - cL);
  float len = max(length(force), 1e-5);
  force = (force / len) * uVorticity * C * 0.0003;
  vec2 vel = texture(uTexture, vTextureCoord).xy;
  fragColor = vec4(vel + force, 0.0, 1.0);
}`;

// ── Pass 3a: Gaussian velocity splat (one emitter per pass) ───────────────
const SPLAT_VEL_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uSplatPoint;
uniform vec2 uSplatVelocity;
uniform float uSplatRadius;
void main() {
  vec2 p = vTextureCoord - uSplatPoint;
  p.x *= float(${SIM_W}) / float(${SIM_H});
  float d = exp(-dot(p, p) / uSplatRadius);
  vec4 current = texture(uTexture, vTextureCoord);
  fragColor = vec4(current.xy + d * uSplatVelocity, 0.0, 1.0);
}`;

// ── Pass 3b: Gaussian dye splat — mix toward palette colour ───────────────
// mix() keeps values in [0,1]: no white saturation regardless of emitter count.
const SPLAT_DYE_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uSplatPoint;
uniform vec4 uSplatColor;
uniform float uSplatRadius;
void main() {
  vec2 p = vTextureCoord - uSplatPoint;
  p.x *= float(${DYE_W}) / float(${DYE_H});
  float d = exp(-dot(p, p) / uSplatRadius);
  vec4 current = texture(uTexture, vTextureCoord);
  float blend = clamp(d * uSplatColor.a, 0.0, 1.0);
  fragColor = vec4(mix(current.rgb, uSplatColor.rgb, blend), 1.0);
}`;

// ── Pass 4: Divergence of velocity field ──────────────────────────────────
const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uTexelSize;
void main() {
  float L = texture(uTexture, vTextureCoord - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uTexture, vTextureCoord + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uTexture, vTextureCoord + vec2(0.0, uTexelSize.y)).y;
  float B = texture(uTexture, vTextureCoord - vec2(0.0, uTexelSize.y)).y;
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

// ── Pass 5: Jacobi pressure iteration ─────────────────────────────────────
const PRESSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
void main() {
  float L = texture(uTexture, vTextureCoord - vec2(uTexelSize.x, 0.0)).r;
  float R = texture(uTexture, vTextureCoord + vec2(uTexelSize.x, 0.0)).r;
  float T = texture(uTexture, vTextureCoord + vec2(0.0, uTexelSize.y)).r;
  float B = texture(uTexture, vTextureCoord - vec2(0.0, uTexelSize.y)).r;
  float div = texture(uDivergence, vTextureCoord).r;
  fragColor = vec4((L + R + T + B - div) * 0.25, 0.0, 0.0, 1.0);
}`;

// ── Pass 6: Subtract pressure gradient → divergence-free velocity ──────────
const GRAD_SUB_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform sampler2D uPressure;
uniform vec2 uTexelSize;
void main() {
  float pL = texture(uPressure, vTextureCoord - vec2(uTexelSize.x, 0.0)).r;
  float pR = texture(uPressure, vTextureCoord + vec2(uTexelSize.x, 0.0)).r;
  float pT = texture(uPressure, vTextureCoord + vec2(0.0, uTexelSize.y)).r;
  float pB = texture(uPressure, vTextureCoord - vec2(0.0, uTexelSize.y)).r;
  vec2 vel = texture(uTexture, vTextureCoord).xy;
  fragColor = vec4(vel - 0.5 * vec2(pR - pL, pT - pB), 0.0, 1.0);
}`;

// ── Emitter types ──────────────────────────────────────────────────────────
interface Emitter {
  x: number;
  y: number;
  angle: number;
  angleSpeed: number;
  strength: number;
  strengthPhase: number;
  color: [number, number, number];
  colorIdx: number;
  life: number;
  maxLife: number;
  velRadius: number;
  dyeRadius: number;
  ax: number;
  ay: number;
  phaseX: number;
  phaseY: number;
  freqX: number;
  freqY: number;
}

interface BurstEmitter {
  x: number;
  y: number;
  angle: number;
  strength: number;
  velRadius: number;
  dyeRadius: number;
  color: [number, number, number];
  life: number;
  maxLife: number;
}

export class FluidPaintScreen extends Container {
  public static assetBundles: string[] = [];

  private velRT: [RenderTexture, RenderTexture] = [null!, null!];
  private prsRT: [RenderTexture, RenderTexture] = [null!, null!];
  private divRT: RenderTexture = null!;
  private curlRT: RenderTexture = null!;
  private dyeRT: [RenderTexture, RenderTexture] = [null!, null!];

  private simQuad!: Sprite; // SIM_W × SIM_H
  private dyeQuad!: Sprite; // DYE_W × DYE_H
  private displaySprite!: Sprite;

  // Filters
  private advectVelFilter!: Filter;
  private curlFilter!: Filter;
  private vorticityFilter!: Filter;
  private divergenceFilter!: Filter;
  private pressureFilter!: Filter;
  private gradSubFilter!: Filter;
  private splatVelFilter!: Filter;
  private splatDyeFilter!: Filter;
  private advectDyeFilter!: Filter;

  // Mutable uniform buffers (Float32Arrays updated in-place each frame)
  private splatVelPoint!: Float32Array;
  private splatVelVelocity!: Float32Array;

  private splatDyePoint!: Float32Array;
  private splatDyeColor!: Float32Array;

  private emitters: Emitter[] = [];
  private bursts: BurstEmitter[] = [];

  private time = 0;
  private burstTimer = 5;

  private w = 1920;
  private h = 1080;

  constructor() {
    super();
  }

  public async show(): Promise<void> {
    this._initRenderTextures();
    this._initFilters();
    this._initEmitters();
    this._buildDisplaySprite();
  }

  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    if (this.displaySprite) {
      this.displaySprite.width = width;
      this.displaySprite.height = height;
    }
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  private _initRenderTextures(): void {
    // Float textures: velocity needs signed floats; dye needs > 8-bit so
    // accumulated colour doesn't clamp and saturate to white.
    const simOpts = {
      width: SIM_W,
      height: SIM_H,
      format: "rgba16float" as const,
    };
    const dyeOpts = {
      width: DYE_W,
      height: DYE_H,
      format: "rgba16float" as const,
    };

    this.velRT = [RenderTexture.create(simOpts), RenderTexture.create(simOpts)];
    this.prsRT = [RenderTexture.create(simOpts), RenderTexture.create(simOpts)];
    this.divRT = RenderTexture.create(simOpts);
    this.curlRT = RenderTexture.create(simOpts);
    this.dyeRT = [RenderTexture.create(dyeOpts), RenderTexture.create(dyeOpts)];

    this.simQuad = new Sprite(Texture.WHITE);
    this.simQuad.width = SIM_W;
    this.simQuad.height = SIM_H;

    this.dyeQuad = new Sprite(Texture.WHITE);
    this.dyeQuad.width = DYE_W;
    this.dyeQuad.height = DYE_H;
  }

  private _initFilters(): void {
    const simTexelSize = new Float32Array([1 / SIM_W, 1 / SIM_H]);

    // ── Advect velocity ────────────────────────────────────────────────────
    this.advectVelFilter = new Filter({
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: ADVECT_FRAG }),
      resources: {
        advectUniforms: new UniformGroup({
          uDt: { value: 1.0, type: "f32" },
          uDissipation: { value: VEL_DISSIPATION, type: "f32" },
        }),
        uVelocity: this.velRT[0].source,
      },
    });

    // ── Curl ──────────────────────────────────────────────────────────────
    this.curlFilter = new Filter({
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: CURL_FRAG }),
      resources: {
        curlUniforms: new UniformGroup({
          uTexelSize: { value: simTexelSize, type: "vec2<f32>" },
        }),
      },
    });

    // ── Vorticity confinement ──────────────────────────────────────────────
    this.vorticityFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: VORTICITY_FRAG,
      }),
      resources: {
        vorticityUniforms: new UniformGroup({
          uTexelSize: { value: simTexelSize, type: "vec2<f32>" },
          uVorticity: { value: VORTICITY_STRENGTH, type: "f32" },
        }),
        uCurl: this.curlRT.source,
      },
    });

    // ── Divergence ────────────────────────────────────────────────────────
    this.divergenceFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: DIVERGENCE_FRAG,
      }),
      resources: {
        divUniforms: new UniformGroup({
          uTexelSize: { value: simTexelSize, type: "vec2<f32>" },
        }),
      },
    });

    // ── Pressure jacobi ───────────────────────────────────────────────────
    this.pressureFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: PRESSURE_FRAG,
      }),
      resources: {
        prsUniforms: new UniformGroup({
          uTexelSize: { value: simTexelSize, type: "vec2<f32>" },
        }),
        uDivergence: this.divRT.source,
      },
    });

    // ── Gradient subtraction ───────────────────────────────────────────────
    this.gradSubFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: GRAD_SUB_FRAG,
      }),
      resources: {
        gradUniforms: new UniformGroup({
          uTexelSize: { value: simTexelSize, type: "vec2<f32>" },
        }),
        uPressure: this.prsRT[0].source,
      },
    });

    // ── Velocity splat ─────────────────────────────────────────────────────
    // Float32Arrays held as references so mutation is picked up by UniformGroup
    this.splatVelPoint = new Float32Array([0.5, 0.5]);
    this.splatVelVelocity = new Float32Array([0, 0]);
    const velSplatUG = new UniformGroup({
      uSplatPoint: { value: this.splatVelPoint, type: "vec2<f32>" },
      uSplatVelocity: { value: this.splatVelVelocity, type: "vec2<f32>" },
      uSplatRadius: { value: 0.001, type: "f32" },
    });
    this.splatVelFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: SPLAT_VEL_FRAG,
      }),
      resources: { velSplatUG },
    });
    // Store reference to the UniformGroup so we can update it
    (
      this.splatVelFilter as Filter & { _velSplatUG: UniformGroup }
    )._velSplatUG = velSplatUG;

    // ── Dye splat ─────────────────────────────────────────────────────────
    this.splatDyePoint = new Float32Array([0.5, 0.5]);
    this.splatDyeColor = new Float32Array([0, 0, 0, 0]);
    const dyeSplatUG = new UniformGroup({
      uSplatPoint: { value: this.splatDyePoint, type: "vec2<f32>" },
      uSplatColor: { value: this.splatDyeColor, type: "vec4<f32>" },
      uSplatRadius: { value: 0.001, type: "f32" },
    });
    this.splatDyeFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: SPLAT_DYE_FRAG,
      }),
      resources: { dyeSplatUG },
    });
    (
      this.splatDyeFilter as Filter & { _dyeSplatUG: UniformGroup }
    )._dyeSplatUG = dyeSplatUG;
    // ── Advect dye ────────────────────────────────────────────────────────
    this.advectDyeFilter = new Filter({
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: ADVECT_FRAG }),
      resources: {
        advectUniforms: new UniformGroup({
          uDt: { value: 1.0, type: "f32" },
          uDissipation: { value: DYE_DISSIPATION, type: "f32" },
        }),
        uVelocity: this.velRT[0].source,
      },
    });
  }

  private _initEmitters(): void {
    for (let i = 0; i < 9; i++) {
      this.emitters.push(this._newEmitter(i));
    }
  }

  private _newEmitter(colorOffset = 0): Emitter {
    const colorIdx =
      (colorOffset * 3 + Math.floor(Math.random() * 2)) % PALETTE.length;
    return {
      x: Math.random(),
      y: Math.random(),
      angle: Math.random() * Math.PI * 2,
      angleSpeed: (Math.random() - 0.5) * 0.02,
      strength: 0.1 + Math.random() * 0.35,
      strengthPhase: Math.random() * Math.PI * 2,
      color: PALETTE[colorIdx],
      colorIdx,
      life: 0,
      maxLife: 4 + Math.random() * 8,
      velRadius: 0.0006 + Math.random() * 0.0008,
      dyeRadius: 0.0003 + Math.random() * 0.0005,
      ax: 0.3 + Math.random() * 0.4,
      ay: 0.3 + Math.random() * 0.4,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      freqX: 0.03 + Math.random() * 0.07,
      freqY: 0.04 + Math.random() * 0.06,
    };
  }

  private _buildDisplaySprite(): void {
    this.displaySprite = new Sprite(this.dyeRT[0]);
    this.displaySprite.width = this.w;
    this.displaySprite.height = this.h;
    this.addChild(this.displaySprite);
  }

  // ── Per-frame simulation pipeline ─────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS / 1000;
    this.time += dt;
    this.burstTimer -= dt;

    if (this.burstTimer <= 0) {
      this._spawnBurst();
      this.burstTimer = 3 + Math.random() * 5;
    }

    // Advance emitter positions via Lissajous drift
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      e.life += dt;
      if (e.life >= e.maxLife) {
        this.emitters[i] = this._newEmitter(e.colorIdx + 3);
        continue;
      }
      e.x = 0.5 + e.ax * 0.5 * Math.sin(e.freqX * this.time + e.phaseX);
      e.y = 0.5 + e.ay * 0.5 * Math.sin(e.freqY * this.time + e.phaseY);
      e.angle += e.angleSpeed;
      e.strengthPhase += 0.03;
    }

    this.bursts = this.bursts.filter((b) => {
      b.life -= dt;
      return b.life > 0;
    });

    const r = engine().renderer;

    // ── 1. Advect velocity ─────────────────────────────────────────────────
    this.advectVelFilter.resources.uVelocity = this.velRT[0].source;
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.advectVelFilter];
    r.render({ container: this.simQuad, target: this.velRT[1] });
    this._swapVel();

    // ── 2a. Curl ───────────────────────────────────────────────────────────
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.curlFilter];
    r.render({ container: this.simQuad, target: this.curlRT });

    // ── 2b. Vorticity confinement ──────────────────────────────────────────
    this.vorticityFilter.resources.uCurl = this.curlRT.source;
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.vorticityFilter];
    r.render({ container: this.simQuad, target: this.velRT[1] });
    this._swapVel();

    // ── 3. Inject velocity + dye splats ───────────────────────────────────
    this._injectSplats();

    // ── 4. Divergence ──────────────────────────────────────────────────────
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.divergenceFilter];
    r.render({ container: this.simQuad, target: this.divRT });

    // ── 5. Pressure (Jacobi) ───────────────────────────────────────────────
    this.pressureFilter.resources.uDivergence = this.divRT.source;
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      this.simQuad.texture = this.prsRT[0];
      this.simQuad.filters = [this.pressureFilter];
      r.render({ container: this.simQuad, target: this.prsRT[1] });
      this._swapPrs();
    }

    // ── 6. Gradient subtraction ────────────────────────────────────────────
    this.gradSubFilter.resources.uPressure = this.prsRT[0].source;
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.gradSubFilter];
    r.render({ container: this.simQuad, target: this.velRT[1] });
    this._swapVel();

    // ── 7. Advect dye ──────────────────────────────────────────────────────
    this.advectDyeFilter.resources.uVelocity = this.velRT[0].source;
    this.dyeQuad.texture = this.dyeRT[0];
    this.dyeQuad.filters = [this.advectDyeFilter];
    r.render({ container: this.dyeQuad, target: this.dyeRT[1] });
    this._swapDye();

    // ── 8. Composite ───────────────────────────────────────────────────────
    this.displaySprite.texture = this.dyeRT[0];
  }

  // ── Splat injection ────────────────────────────────────────────────────────

  private _injectSplats(): void {
    type SplatSrc = {
      x: number;
      y: number;
      angle: number;
      strength: number;
      velR: number;
      dyeR: number;
      color: [number, number, number];
      alpha: number;
    };

    const sources: SplatSrc[] = [];

    for (const e of this.emitters) {
      const s = e.strength * (0.6 + 0.4 * Math.sin(e.strengthPhase));
      sources.push({
        x: e.x,
        y: e.y,
        angle: e.angle,
        strength: s * 0.4,
        velR: e.velRadius,
        dyeR: e.dyeRadius,
        color: e.color,
        // Low per-frame alpha so mix() blends slowly — painterly accumulation
        alpha: 0.04 + s * 0.06,
      });
    }

    for (const b of this.bursts) {
      const t = b.life / b.maxLife;
      sources.push({
        x: b.x,
        y: b.y,
        angle: b.angle,
        strength: b.strength * t,
        velR: b.velRadius * t,
        dyeR: b.dyeRadius * t,
        color: b.color,
        alpha: t * 0.45, // burst can be more vivid but still won't saturate with mix()
      });
    }

    const r = engine().renderer;
    const velUG = (
      this.splatVelFilter as Filter & { _velSplatUG: UniformGroup }
    )._velSplatUG;
    const dyeUG = (
      this.splatDyeFilter as Filter & { _dyeSplatUG: UniformGroup }
    )._dyeSplatUG;

    for (const src of sources) {
      // Velocity splat onto sim RT
      velUG.uniforms.uSplatPoint = [src.x, src.y];
      velUG.uniforms.uSplatVelocity = [
        Math.cos(src.angle) * src.strength,
        Math.sin(src.angle) * src.strength,
      ];
      velUG.uniforms.uSplatRadius = src.velR;

      this.simQuad.texture = this.velRT[0];
      this.simQuad.filters = [this.splatVelFilter];
      r.render({ container: this.simQuad, target: this.velRT[1] });
      this._swapVel();

      // Dye splat onto dye RT
      dyeUG.uniforms.uSplatPoint = [src.x, src.y];
      dyeUG.uniforms.uSplatColor = [
        src.color[0],
        src.color[1],
        src.color[2],
        src.alpha,
      ];
      dyeUG.uniforms.uSplatRadius = src.dyeR;

      this.dyeQuad.texture = this.dyeRT[0];
      this.dyeQuad.filters = [this.splatDyeFilter];
      r.render({ container: this.dyeQuad, target: this.dyeRT[1] });
      this._swapDye();
    }
  }

  private _spawnBurst(): void {
    const colorIdx = Math.floor(Math.random() * PALETTE.length);
    const life = 1.5 + Math.random() * 0.5;
    this.bursts.push({
      x: Math.random(),
      y: Math.random(),
      angle: Math.random() * Math.PI * 2,
      strength: 0.5 + Math.random() * 0.5,
      velRadius: 0.003 + Math.random() * 0.004,
      dyeRadius: 0.002 + Math.random() * 0.003,
      color: PALETTE[colorIdx],
      life,
      maxLife: life,
    });
  }

  // ── Ping-pong helpers ──────────────────────────────────────────────────────

  private _swapVel(): void {
    [this.velRT[0], this.velRT[1]] = [this.velRT[1], this.velRT[0]];
  }

  private _swapPrs(): void {
    [this.prsRT[0], this.prsRT[1]] = [this.prsRT[1], this.prsRT[0]];
  }

  private _swapDye(): void {
    [this.dyeRT[0], this.dyeRT[1]] = [this.dyeRT[1], this.dyeRT[0]];
  }
}
