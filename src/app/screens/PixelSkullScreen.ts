import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";

const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void){
  vec2 position=aPosition*uOutputFrame.zw+uOutputFrame.xy;
  position.x=position.x*(2.0/uOutputTexture.x)-1.0;
  position.y=position.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
  return vec4(position,0.0,1.0);}
vec2 filterTextureCoord(void){return aPosition*(uOutputFrame.zw*uInputSize.zw);}
void main(void){gl_Position=filterVertexPosition();vTextureCoord=filterTextureCoord();}`;

// Pixel-art skull with animated hue cycling and chromatic-aberration glitch
const FRAG = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;

float hash1(float n){ return fract(sin(n)*43758.5453); }
float hash2(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z); }

vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.,2./3.,1./3.,3.);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}

// ── Skull mask ────────────────────────────────────────────────────────────
// sp: skull-space coords. Origin = skull center, ±1 = half skull height.
// Returns: 0=void/bg, 1=skull face plate
float skullMask(vec2 sp) {

  // ── CRANIUM (upper rounded dome) ─────────────────────────────────────
  float cranium = length(sp / vec2(0.82, 0.70)) - 1.0;

  // ── JAW (lower rectangle, narrower than cranium) ──────────────────────
  // Jaw sits below y=0.10 and is capped at bottom y=0.85
  float jaw = length((sp - vec2(0.0, 0.55)) / vec2(0.56, 0.38)) - 1.0;

  // Union of cranium + jaw forms the outer skull silhouette
  float outer = min(cranium, jaw);
  if (outer > 0.04) return 0.0; // outside skull → background

  // ── VOIDS (carved out of skull) ──────────────────────────────────────

  // Left eye socket (square-ish in pixel art)
  vec2 lEye = sp - vec2(-0.30, -0.08);
  float lEyeVoid = max(abs(lEye.x) - 0.22, abs(lEye.y) - 0.20);

  // Right eye socket
  vec2 rEye = sp - vec2(0.30, -0.08);
  float rEyeVoid = max(abs(rEye.x) - 0.22, abs(rEye.y) - 0.20);

  // Nose cavity (small square, centered)
  vec2 noseP = sp - vec2(0.0, 0.28);
  float noseVoid = max(abs(noseP.x) - 0.11, abs(noseP.y) - 0.13);

  // Teeth gaps — three slots along the bottom of jaw
  // Left slot
  vec2 tL = sp - vec2(-0.28, 0.70);
  float toothL = max(abs(tL.x) - 0.09, abs(tL.y) - 0.10);
  // Center slot
  vec2 tC = sp - vec2(0.0, 0.70);
  float toothC = max(abs(tC.x) - 0.09, abs(tC.y) - 0.10);
  // Right slot
  vec2 tR = sp - vec2(0.28, 0.70);
  float toothR = max(abs(tR.x) - 0.09, abs(tR.y) - 0.10);

  // Combine voids: inside void = return 0
  float voids = min(min(lEyeVoid, rEyeVoid), min(noseVoid, min(toothL, min(toothC, toothR))));
  if (voids < 0.0) return 0.0;

  return 1.0; // solid skull face plate
}

// ── Pixel-grid skull sample ───────────────────────────────────────────────
// Snaps position to pixel grid and samples skull mask at cell center.
// pixSize: width of one "pixel" in screen pixels.
// chromaOff: horizontal offset (for RGB channel separation).
// Returns 0 or 1.
float pixelSkull(vec2 screenPx, float pixSize, float chromaOff, vec2 skullCenterPx, float skullScalePx) {
  // Snap to pixel grid
  vec2 cell   = floor((screenPx + vec2(chromaOff, 0.0)) / pixSize);
  vec2 cellCx = (cell + 0.5) * pixSize; // center of this pixel cell

  // Convert cell center to skull-space
  vec2 sp = (cellCx - skullCenterPx) / skullScalePx;

  return skullMask(sp);
}

// ── Glitch helpers ────────────────────────────────────────────────────────
float glitchBurst(float t) {
  float cycle = fract(t * 0.22);         // one cycle every ~4.5 s
  float burst  = step(0.78, cycle);      // active for last 22% of cycle
  float rnd    = hash1(floor(t * 5.0) * 17.3);
  return burst * rnd;
}

float scanDisplace(vec2 px, float t, float burst) {
  float row   = floor(px.y / 4.0);
  float rHash = hash1(row * 7.31 + floor(t * 14.0) * 53.1);
  float active= step(0.72, hash1(row * 3.71 + floor(t * 9.0)));
  return (rHash - 0.5) * uResolution.x * 0.05 * burst * active;
}

// ── Main ──────────────────────────────────────────────────────────────────
void main() {
  vec2 uvN = vTextureCoord;
  vec2 px  = uvN * uResolution;
  float t  = uTime;

  float burst   = glitchBurst(t);
  float PIXSIZE = 18.0;   // size of one art pixel in screen pixels

  // Skull center and scale
  vec2  skullCenter = uResolution * vec2(0.5, 0.48);
  float skullScale  = uResolution.y * 0.38; // half-height in pixels

  // Horizontal displacement from glitch scanlines
  float dispX = scanDisplace(px, t, burst);
  vec2  gPx   = px + vec2(dispX, 0.0);

  // ── CHROMATIC ABERRATION ─────────────────────────────────────────────
  // R, G, B channels sampled at slightly different horizontal offsets.
  // Always subtle; multiplied during glitch bursts.
  float baseChroma = PIXSIZE * (0.35 + burst * 2.2);

  float maskR = pixelSkull(gPx, PIXSIZE,  baseChroma, skullCenter, skullScale);
  float maskG = pixelSkull(gPx, PIXSIZE,  0.0,        skullCenter, skullScale);
  float maskB = pixelSkull(gPx, PIXSIZE, -baseChroma, skullCenter, skullScale);

  // ── PER-PIXEL COLOR ──────────────────────────────────────────────────
  // Cell center in skull-space (green channel = reference cell)
  vec2 refCell = floor(gPx / PIXSIZE);
  vec2 refCx   = (refCell + 0.5) * PIXSIZE;
  vec2 sp      = (refCx - skullCenter) / skullScale;

  // Unique seed per pixel cell
  float seed = hash2(refCell);

  // Distance from skull center for wave propagation
  float dist = length(sp) * 0.7;

  // Hue: slow wave outward + gentle per-pixel jitter
  float wave = fract(t * 0.14 - dist * 0.9 + seed * 0.08);

  // Saturation pulses: mostly desaturated (→ white) but periodic color surges
  float satPulse = pow(max(0., sin(t * 0.5 + seed * 6.28 + dist * 2.0)), 3.0);
  float sat = mix(0.05, 0.95, satPulse);

  // During glitch: some pixels spike to vivid accent colors
  float glitchSnap = step(0.68, hash1(seed * 31.7 + floor(t * 18.0) * 7.3)) * burst;
  float accentHue  = hash1(floor(t * 6.0) * 11.3 + seed);
  wave = mix(wave, accentHue, glitchSnap);
  sat  = mix(sat,  1.0,       glitchSnap);

  vec3 hsvR = vec3(wave + 0.0,   sat, 1.0);
  vec3 hsvG = vec3(wave + 0.02,  sat, 1.0);
  vec3 hsvB = vec3(wave - 0.02,  sat, 1.0);

  vec3 colR = hsv2rgb(hsvR);
  vec3 colG = hsv2rgb(hsvG);
  vec3 colB = hsv2rgb(hsvB);

  // Apply per-channel skull mask
  vec3 col = vec3(colR.r * maskR, colG.g * maskG, colB.b * maskB);

  // ── PIXEL EDGE THINNING (dark border between pixels) ─────────────────
  // Gives that clean pixel-art look: each block has a 1px dark border
  vec2 localPx = fract(gPx / PIXSIZE);
  float border  = min(min(localPx.x, 1.0-localPx.x), min(localPx.y, 1.0-localPx.y));
  float edgeMask = smoothstep(0.0, 0.06, border); // 0 at edge, 1 interior
  col *= mix(0.0, 1.0, edgeMask);

  // ── SCANLINE NOISE TEXTURE ───────────────────────────────────────────
  float sn = hash2(vec2(floor(px.y * 0.5), floor(t * 24.0))) * 0.06 * burst;
  col += sn * maskG;

  // ── BLOOM GLOW around skull ──────────────────────────────────────────
  // A faint colored halo bleeds out from the skull edge
  if (maskG < 0.5) {
    // How close is this pixel to the skull edge? Sample nearby cells.
    vec2 nbOffsets[4];
    nbOffsets[0] = vec2( PIXSIZE, 0);
    nbOffsets[1] = vec2(-PIXSIZE, 0);
    nbOffsets[2] = vec2(0,  PIXSIZE);
    nbOffsets[3] = vec2(0, -PIXSIZE);
    float nearSkull = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 nbCell = floor((gPx + nbOffsets[i]) / PIXSIZE);
      vec2 nbCx   = (nbCell + 0.5) * PIXSIZE;
      float nbMask = skullMask((nbCx - skullCenter) / skullScale);
      nearSkull = max(nearSkull, nbMask);
    }
    vec3 glowCol = hsv2rgb(vec3(wave, 0.8, 0.6));
    col += glowCol * nearSkull * 0.25 * (1.0 + burst * 1.5);
  }

  // ── VIGNETTE ─────────────────────────────────────────────────────────
  vec2 vc = uvN - 0.5;
  col *= 1.0 - dot(vc,vc) * 3.0;
  col = max(col, vec3(0.0));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class PixelSkullScreen extends Container {
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
      glProgram: new GlProgram({ vertex: VERT, fragment: FRAG }),
      resources: { skullUniforms: this.uniforms },
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
