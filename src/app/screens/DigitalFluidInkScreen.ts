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

const SIM_W = 256;
const SIM_H = 144;
const DYE_W = 1280;
const DYE_H = 720;

const VEL_DISSIPATION = 0.981;
const DYE_DISSIPATION = 0.9994;
const PRESSURE_ITERATIONS = 22;
const VORTICITY_STRENGTH = 38;

// Dark indigo ink — barely above black, giving structure without wash
const INK_DYE: [number, number, number] = [0.025, 0.042, 0.13];

// Vivid neon contaminants — the only real colour in the frame
const CONTAMINANTS: [number, number, number][] = [
  [0.0, 1.0, 0.42], // acid green
  [0.0, 0.72, 1.0], // electric cyan
  [1.0, 0.0, 0.68], // neon magenta
  [0.55, 0.0, 1.0], // UV purple
  [0.88, 1.0, 0.0], // toxic lime
];

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

// ── Semi-Lagrangian advection (velocity or dye) ───────────────────────────────
const ADVECT_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 vel = texture(uVelocity, vTextureCoord).xy * 0.0004;
  vec2 prev = clamp(vTextureCoord - vel * uDt, vec2(0.0), vec2(1.0));
  fragColor = texture(uTexture, prev) * uDissipation;
}`;

// ── Curl ω = ∂v/∂x − ∂u/∂y ───────────────────────────────────────────────────
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

// ── Vorticity confinement ─────────────────────────────────────────────────────
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

// ── Gaussian velocity splat ───────────────────────────────────────────────────
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
  vec4 cur = texture(uTexture, vTextureCoord);
  fragColor = vec4(cur.xy + d * uSplatVelocity, 0.0, 1.0);
}`;

// ── Gaussian dye splat — mix toward target colour ─────────────────────────────
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
  vec4 cur = texture(uTexture, vTextureCoord);
  float blend = clamp(d * uSplatColor.a, 0.0, 1.0);
  fragColor = vec4(mix(cur.rgb, uSplatColor.rgb, blend), 1.0);
}`;

// ── Velocity divergence ───────────────────────────────────────────────────────
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

// ── Jacobi pressure iteration ─────────────────────────────────────────────────
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

// ── Pressure gradient subtraction → divergence-free velocity ─────────────────
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

// ── Display: dark ink lift + contaminant bloom + vignette ─────────────────────
// uInputSize.zw = (1/inputWidth, 1/inputHeight) set automatically by PixiJS
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;

vec3 glow(vec2 uv) {
  // 25-tap Gaussian — halos around vivid contaminant areas
  vec2 ts = uInputSize.zw * 18.0;
  vec3 acc = vec3(0.0);
  float tw = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec3 s = texture(uTexture, uv + vec2(float(i), float(j)) * ts).rgb;
      float lum = dot(s, vec3(0.299, 0.587, 0.114));
      float w = exp(-float(i * i + j * j) * 0.28);
      acc += s * w * smoothstep(0.12, 0.6, lum);
      tw += w;
    }
  }
  return acc / tw;
}

void main() {
  vec3 col = texture(uTexture, vTextureCoord).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // Pull ink (lum ~0.04-0.12) above pure black so the swirl structure is visible
  float inkFactor = smoothstep(0.0, 0.055, lum) * (1.0 - smoothstep(0.055, 0.22, lum));
  vec3 lifted = col + col * inkFactor * 3.2;

  // Neon areas pass through at full intensity plus extra punch
  vec3 bright = max(col - vec3(0.14), vec3(0.0)) * 2.2;

  // Bloom halos
  vec3 bloom = glow(vTextureCoord) * 0.88;

  vec3 final = lifted + bright + bloom;

  // Vignette
  vec2 c = vTextureCoord - 0.5;
  final *= max(1.0 - dot(c, c) * 2.1, 0.0);

  // Gamma
  fragColor = vec4(pow(clamp(final, 0.0, 1.0), vec3(0.86)), 1.0);
}`;

// ── Emitter types ─────────────────────────────────────────────────────────────

interface InkEmitter {
  x: number;
  y: number;
  angle: number;
  angleSpeed: number;
  strength: number;
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
  isContaminant: boolean;
  color: [number, number, number];
}

interface Burst {
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

// ── Screen ────────────────────────────────────────────────────────────────────

export class DigitalFluidInkScreen extends Container {
  public static assetBundles: string[] = [];

  private velRT: [RenderTexture, RenderTexture] = [null!, null!];
  private prsRT: [RenderTexture, RenderTexture] = [null!, null!];
  private divRT: RenderTexture = null!;
  private curlRT: RenderTexture = null!;
  private dyeRT: [RenderTexture, RenderTexture] = [null!, null!];

  private simQuad!: Sprite;
  private dyeQuad!: Sprite;
  private displaySprite!: Sprite;

  private advectVelFilter!: Filter;
  private curlFilter!: Filter;
  private vorticityFilter!: Filter;
  private divergenceFilter!: Filter;
  private pressureFilter!: Filter;
  private gradSubFilter!: Filter;
  private splatVelFilter!: Filter;
  private splatDyeFilter!: Filter;
  private advectDyeFilter!: Filter;
  private displayFilter!: Filter;

  private velSplatUG!: UniformGroup;
  private dyeSplatUG!: UniformGroup;

  private emitters: InkEmitter[] = [];
  private bursts: Burst[] = [];

  private time = 0;
  private burstTimer = 2;
  private inkDropTimer = 8;

  private w = 1920;
  private h = 1080;

  public async show(): Promise<void> {
    this._initRTs();
    this._initFilters();
    this._initEmitters();
    this._buildDisplay();
    this._seedInitial();
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

  // ── Initialisation ──────────────────────────────────────────────────────────

  private _initRTs(): void {
    const sim = { width: SIM_W, height: SIM_H, format: "rgba16float" as const };
    const dye = { width: DYE_W, height: DYE_H, format: "rgba16float" as const };
    this.velRT = [RenderTexture.create(sim), RenderTexture.create(sim)];
    this.prsRT = [RenderTexture.create(sim), RenderTexture.create(sim)];
    this.divRT = RenderTexture.create(sim);
    this.curlRT = RenderTexture.create(sim);
    this.dyeRT = [RenderTexture.create(dye), RenderTexture.create(dye)];
    this.simQuad = new Sprite(Texture.WHITE);
    this.simQuad.width = SIM_W;
    this.simQuad.height = SIM_H;
    this.dyeQuad = new Sprite(Texture.WHITE);
    this.dyeQuad.width = DYE_W;
    this.dyeQuad.height = DYE_H;
  }

  private _initFilters(): void {
    const simTs = new Float32Array([1 / SIM_W, 1 / SIM_H]);

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

    this.curlFilter = new Filter({
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: CURL_FRAG }),
      resources: {
        curlUniforms: new UniformGroup({
          uTexelSize: { value: simTs, type: "vec2<f32>" },
        }),
      },
    });

    this.vorticityFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: VORTICITY_FRAG,
      }),
      resources: {
        vorticityUniforms: new UniformGroup({
          uTexelSize: { value: simTs, type: "vec2<f32>" },
          uVorticity: { value: VORTICITY_STRENGTH, type: "f32" },
        }),
        uCurl: this.curlRT.source,
      },
    });

    this.divergenceFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: DIVERGENCE_FRAG,
      }),
      resources: {
        divUniforms: new UniformGroup({
          uTexelSize: { value: simTs, type: "vec2<f32>" },
        }),
      },
    });

    this.pressureFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: PRESSURE_FRAG,
      }),
      resources: {
        prsUniforms: new UniformGroup({
          uTexelSize: { value: simTs, type: "vec2<f32>" },
        }),
        uDivergence: this.divRT.source,
      },
    });

    this.gradSubFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: GRAD_SUB_FRAG,
      }),
      resources: {
        gradUniforms: new UniformGroup({
          uTexelSize: { value: simTs, type: "vec2<f32>" },
        }),
        uPressure: this.prsRT[0].source,
      },
    });

    const splatVelPoint = new Float32Array([0.5, 0.5]);
    const splatVelVelocity = new Float32Array([0, 0]);
    this.velSplatUG = new UniformGroup({
      uSplatPoint: { value: splatVelPoint, type: "vec2<f32>" },
      uSplatVelocity: { value: splatVelVelocity, type: "vec2<f32>" },
      uSplatRadius: { value: 0.001, type: "f32" },
    });
    this.splatVelFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: SPLAT_VEL_FRAG,
      }),
      resources: { velSplatUG: this.velSplatUG },
    });

    const splatDyePoint = new Float32Array([0.5, 0.5]);
    const splatDyeColor = new Float32Array([0, 0, 0, 0]);
    this.dyeSplatUG = new UniformGroup({
      uSplatPoint: { value: splatDyePoint, type: "vec2<f32>" },
      uSplatColor: { value: splatDyeColor, type: "vec4<f32>" },
      uSplatRadius: { value: 0.001, type: "f32" },
    });
    this.splatDyeFilter = new Filter({
      glProgram: new GlProgram({
        vertex: FILTER_VERT,
        fragment: SPLAT_DYE_FRAG,
      }),
      resources: { dyeSplatUG: this.dyeSplatUG },
    });

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

    // Display filter: ink lift + neon bloom + vignette (no extra uniforms needed)
    this.displayFilter = new Filter({
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: DISPLAY_FRAG }),
    });
  }

  private _initEmitters(): void {
    for (let i = 0; i < 5; i++) this.emitters.push(this._newEmitter(false));
    for (let i = 0; i < 4; i++) this.emitters.push(this._newEmitter(true));
  }

  private _newEmitter(isContaminant: boolean): InkEmitter {
    const color: [number, number, number] = isContaminant
      ? CONTAMINANTS[Math.floor(Math.random() * CONTAMINANTS.length)]
      : INK_DYE;
    return {
      x: Math.random(),
      y: Math.random(),
      angle: Math.random() * Math.PI * 2,
      angleSpeed: (Math.random() - 0.5) * (isContaminant ? 0.04 : 0.015),
      strength: isContaminant
        ? 0.08 + Math.random() * 0.18
        : 0.15 + Math.random() * 0.28,
      life: 0,
      maxLife: isContaminant ? 3 + Math.random() * 6 : 7 + Math.random() * 12,
      velRadius: isContaminant
        ? 0.0004 + Math.random() * 0.0006
        : 0.0007 + Math.random() * 0.001,
      dyeRadius: isContaminant
        ? 0.00018 + Math.random() * 0.00025
        : 0.0005 + Math.random() * 0.0008,
      ax: 0.28 + Math.random() * 0.44,
      ay: 0.22 + Math.random() * 0.36,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      freqX: 0.018 + Math.random() * 0.05,
      freqY: 0.022 + Math.random() * 0.045,
      isContaminant,
      color,
    };
  }

  private _seedInitial(): void {
    // Splash several ink blobs so the field isn't empty at frame 0
    for (let i = 0; i < 7; i++) {
      this.bursts.push({
        x: Math.random(),
        y: Math.random(),
        angle: Math.random() * Math.PI * 2,
        strength: 0.5 + Math.random() * 0.6,
        velRadius: 0.003 + Math.random() * 0.004,
        dyeRadius: 0.005 + Math.random() * 0.006,
        color: INK_DYE,
        life: 2.2,
        maxLife: 2.2,
      });
    }
    // Two early contaminant injections for immediate visual interest
    for (let i = 0; i < 2; i++) {
      const col = CONTAMINANTS[i % CONTAMINANTS.length];
      this.bursts.push({
        x: 0.25 + Math.random() * 0.5,
        y: 0.25 + Math.random() * 0.5,
        angle: Math.random() * Math.PI * 2,
        strength: 0.3 + Math.random() * 0.3,
        velRadius: 0.0015 + Math.random() * 0.002,
        dyeRadius: 0.001 + Math.random() * 0.0015,
        color: col,
        life: 1.6,
        maxLife: 1.6,
      });
    }
  }

  private _buildDisplay(): void {
    this.displaySprite = new Sprite(this.dyeRT[0]);
    this.displaySprite.width = this.w;
    this.displaySprite.height = this.h;
    this.displaySprite.filters = [this.displayFilter];
    this.addChild(this.displaySprite);
  }

  // ── Per-frame simulation ────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    this.time += dt;
    this.burstTimer -= dt;
    this.inkDropTimer -= dt;

    if (this.burstTimer <= 0) {
      this._spawnBurst(Math.random() < 0.38);
      this.burstTimer = 2 + Math.random() * 5;
    }
    if (this.inkDropTimer <= 0) {
      this._spawnBurst(false);
      this._spawnBurst(false);
      this.inkDropTimer = 9 + Math.random() * 13;
    }

    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      e.life += dt;
      if (e.life >= e.maxLife) {
        this.emitters[i] = this._newEmitter(e.isContaminant);
        continue;
      }
      e.x = 0.5 + e.ax * 0.5 * Math.sin(e.freqX * this.time + e.phaseX);
      e.y = 0.5 + e.ay * 0.5 * Math.sin(e.freqY * this.time + e.phaseY);
      e.angle += e.angleSpeed;
    }

    this.bursts = this.bursts.filter((b) => {
      b.life -= dt;
      return b.life > 0;
    });

    const r = engine().renderer;

    // 1. Advect velocity
    this.advectVelFilter.resources.uVelocity = this.velRT[0].source;
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.advectVelFilter];
    r.render({ container: this.simQuad, target: this.velRT[1] });
    this._swapVel();

    // 2a. Curl
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.curlFilter];
    r.render({ container: this.simQuad, target: this.curlRT });

    // 2b. Vorticity confinement
    this.vorticityFilter.resources.uCurl = this.curlRT.source;
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.vorticityFilter];
    r.render({ container: this.simQuad, target: this.velRT[1] });
    this._swapVel();

    // 3. Inject splats
    this._injectSplats();

    // 4. Divergence
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.divergenceFilter];
    r.render({ container: this.simQuad, target: this.divRT });

    // 5. Pressure Jacobi
    this.pressureFilter.resources.uDivergence = this.divRT.source;
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      this.simQuad.texture = this.prsRT[0];
      this.simQuad.filters = [this.pressureFilter];
      r.render({ container: this.simQuad, target: this.prsRT[1] });
      this._swapPrs();
    }

    // 6. Gradient subtraction
    this.gradSubFilter.resources.uPressure = this.prsRT[0].source;
    this.simQuad.texture = this.velRT[0];
    this.simQuad.filters = [this.gradSubFilter];
    r.render({ container: this.simQuad, target: this.velRT[1] });
    this._swapVel();

    // 7. Advect dye
    this.advectDyeFilter.resources.uVelocity = this.velRT[0].source;
    this.dyeQuad.texture = this.dyeRT[0];
    this.dyeQuad.filters = [this.advectDyeFilter];
    r.render({ container: this.dyeQuad, target: this.dyeRT[1] });
    this._swapDye();

    // 8. Display (filter applied during PixiJS scene render)
    this.displaySprite.texture = this.dyeRT[0];
  }

  // ── Splat injection ─────────────────────────────────────────────────────────

  private _injectSplats(): void {
    type Src = {
      x: number;
      y: number;
      angle: number;
      strength: number;
      velR: number;
      dyeR: number;
      color: [number, number, number];
      alpha: number;
    };

    const sources: Src[] = [];

    for (const e of this.emitters) {
      const alpha = e.isContaminant
        ? 0.028 + e.strength * 0.048
        : 0.012 + e.strength * 0.025;
      sources.push({
        x: e.x,
        y: e.y,
        angle: e.angle,
        strength: e.strength * 0.35,
        velR: e.velRadius,
        dyeR: e.dyeRadius,
        color: e.color,
        alpha,
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
        alpha: t * 0.5,
      });
    }

    const r = engine().renderer;

    for (const src of sources) {
      this.velSplatUG.uniforms.uSplatPoint = [src.x, src.y];
      this.velSplatUG.uniforms.uSplatVelocity = [
        Math.cos(src.angle) * src.strength,
        Math.sin(src.angle) * src.strength,
      ];
      this.velSplatUG.uniforms.uSplatRadius = src.velR;
      this.simQuad.texture = this.velRT[0];
      this.simQuad.filters = [this.splatVelFilter];
      r.render({ container: this.simQuad, target: this.velRT[1] });
      this._swapVel();

      this.dyeSplatUG.uniforms.uSplatPoint = [src.x, src.y];
      this.dyeSplatUG.uniforms.uSplatColor = [
        src.color[0],
        src.color[1],
        src.color[2],
        src.alpha,
      ];
      this.dyeSplatUG.uniforms.uSplatRadius = src.dyeR;
      this.dyeQuad.texture = this.dyeRT[0];
      this.dyeQuad.filters = [this.splatDyeFilter];
      r.render({ container: this.dyeQuad, target: this.dyeRT[1] });
      this._swapDye();
    }
  }

  private _spawnBurst(isContaminant: boolean): void {
    const color: [number, number, number] = isContaminant
      ? CONTAMINANTS[Math.floor(Math.random() * CONTAMINANTS.length)]
      : INK_DYE;
    const life = isContaminant
      ? 1.0 + Math.random() * 0.8
      : 2.5 + Math.random() * 1.8;
    this.bursts.push({
      x: Math.random(),
      y: Math.random(),
      angle: Math.random() * Math.PI * 2,
      strength: isContaminant
        ? 0.28 + Math.random() * 0.38
        : 0.6 + Math.random() * 0.85,
      velRadius: isContaminant
        ? 0.002 + Math.random() * 0.003
        : 0.005 + Math.random() * 0.006,
      dyeRadius: isContaminant
        ? 0.0012 + Math.random() * 0.002
        : 0.006 + Math.random() * 0.007,
      color,
      life,
      maxLife: life,
    });
  }

  // ── Ping-pong helpers ───────────────────────────────────────────────────────

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
