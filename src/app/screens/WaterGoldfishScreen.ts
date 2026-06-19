import type { Ticker } from "pixi.js";
import {
  Container,
  Filter,
  GlProgram,
  Graphics,
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

// ── Realistic water: caustics (animated Voronoi), god rays, depth gradient ───
const WATER_FRAG = `#version 300 es
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

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Animated Voronoi: photons focusing at surface ripple troughs
float voronoi(vec2 p, float t) {
  vec2 pi = floor(p);
  vec2 pf = fract(p);
  float md = 8.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(pi + g);
      o = 0.5 + 0.45 * sin(t * (0.65 + o.x * 0.35) + 6.2832 * o);
      md = min(md, length(g + o - pf));
    }
  }
  return md;
}

float caustics(vec2 p, float t) {
  float v1 = voronoi(p * 4.2, t);
  float v2 = voronoi(p * 4.2 + vec2(2.8, 1.5), t * 1.18 + 1.1);
  return pow(max(0.0, 1.0 - v1 * 2.4), 5.0)
       + pow(max(0.0, 1.0 - v2 * 2.4), 5.0);
}

float surfNoise(vec2 p, float t) {
  float n  = sin(p.x * 5.8 + t * 1.05) * sin(p.y * 4.1 + t * 0.80);
       n += sin(p.x * 8.7 - t * 0.92) * sin(p.y * 6.5 + t * 1.28) * 0.50;
       n += sin((p.x - p.y) * 4.4 + t * 0.61) * 0.35;
  return n * 0.45 + 0.55;
}

void main() {
  vec2 uvN   = vTextureCoord;
  float asp  = uResolution.x / uResolution.y;
  vec2 uv    = (uvN - 0.5) * vec2(asp, 1.0);
  float t    = uTime;
  float dep  = uvN.y; // 0 = surface top, 1 = deep bottom

  // ── Depth gradient ──────────────────────────────────────────────────────
  vec3 cSurf = vec3(0.06, 0.49, 0.66);
  vec3 cMid  = vec3(0.02, 0.24, 0.45);
  vec3 cDeep = vec3(0.01, 0.08, 0.23);
  vec3 col   = mix(cSurf, cMid, smoothstep(0.0, 0.40, dep));
  col        = mix(col,   cDeep, smoothstep(0.28, 0.92, dep));

  // ── Caustics ─────────────────────────────────────────────────────────────
  float cFade = smoothstep(0.05, 0.22, dep) * smoothstep(1.0, 0.38, dep);
  float c = caustics(uv + vec2(t * 0.013, dep * 0.07), t);
  col += vec3(0.46, 0.90, 1.00) * c * cFade * 0.60;

  // ── God rays (six light shafts from surface) ──────────────────────────────
  float rays = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi   = float(i);
    float base = (fi - 2.5) * 0.185;
    float xpos = base + 0.038 * sin(t * 0.20 + fi * 1.87);
    xpos      += dep * 0.044 * sin(t * 0.12 + fi);
    float rw   = 0.022 + 0.010 * sin(t * 0.40 + fi * 2.2);
    float ray  = exp(-pow((uv.x - xpos) / rw, 2.0));
    rays      += ray * (0.60 + 0.40 * sin(t * (1.3 + fi * 0.50) + fi * 4.0));
  }
  col += vec3(0.34, 0.73, 0.90) * rays * exp(-dep * 2.9) * 0.17;

  // ── Surface band ─────────────────────────────────────────────────────────
  float surf = smoothstep(0.12, 0.0, dep);
  float sn   = surfNoise(uv * 2.8, t);
  col += vec3(0.80, 0.96, 1.00) * surf * (0.60 + 0.40 * sn);
  col += vec3(1.00, 1.00, 0.96) * caustics(uv * 1.8, t) * surf * 0.55;

  // ── Vignette ─────────────────────────────────────────────────────────────
  col *= 1.0 - 1.25 * dot(uvN - 0.5, uvN - 0.5);

  // ── Film grain ───────────────────────────────────────────────────────────
  col += (hash12(uvN * uResolution + t * 53.0) - 0.5) * 0.007;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fish state
// ─────────────────────────────────────────────────────────────────────────────

interface FishState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number;
  depthPhase: number;
  depthRate: number;
  phase: number;
  phaseRate: number;
  shimmer: number;
  shimmerRate: number;
  size: number; // half body-height in local px (before depth scale)
}

// ─────────────────────────────────────────────────────────────────────────────
// GoldFish: Container with a local Graphics, drawn facing +x
// ─────────────────────────────────────────────────────────────────────────────

class GoldFish extends Container {
  public readonly state: FishState;
  private readonly g: Graphics;

  constructor(state: FishState) {
    super();
    this.state = state;
    this.g = new Graphics();
    this.addChild(this.g);
  }

  redraw(dt: number): void {
    const s = this.state;

    // Advance all phases
    s.phase += s.phaseRate * dt;
    s.shimmer += s.shimmerRate * dt;
    s.depthPhase += s.depthRate * dt;
    s.depth = 0.06 + 0.88 * (0.5 + 0.5 * Math.sin(s.depthPhase));

    // Position, rotation, depth-based scale and alpha
    this.x = s.x;
    this.y = s.y;
    this.rotation = Math.atan2(s.vy, s.vx);
    const sc = lerp(1.0, 0.34, s.depth * 0.8);
    this.scale.set(sc);
    this.alpha = lerp(0.96, 0.42, s.depth * 0.74);
    // Deeper fish paint behind shallower fish
    this.zIndex = Math.round((1.0 - s.depth) * 100);

    const L = s.size; // local half-height
    const d = s.depth;

    // Depth-tinted colour: gold-orange → desaturated blue
    const bodyCol = colorRGB(
      lerp(232, 70, d * 0.76),
      lerp(128, 90, d * 0.62),
      lerp(18, 118, d * 0.88),
    );
    const finCol = colorRGB(
      lerp(250, 86, d * 0.76),
      lerp(158, 108, d * 0.62),
      lerp(28, 122, d * 0.88),
    );

    const wiggle = Math.sin(s.phase);
    const tailWig = wiggle * 0.4;
    const shimA = Math.max(0, Math.sin(s.shimmer));
    const shimA2 = Math.max(0, Math.sin(s.shimmer * 1.32 + 1.1));
    const shimA3 = Math.max(0, Math.sin(s.shimmer * 0.71 + 2.4));

    this.g.clear();

    // ── TAIL: two forked lobes ──────────────────────────────────────────────
    const TJX = -L * 1.15; // tail-junction x
    const TL = L * 1.1; // lobe reach
    const TS = L * 0.98; // max y spread

    // Upper lobe
    this.g
      .moveTo(TJX, 0)
      .bezierCurveTo(
        TJX - TL * 0.5 + tailWig * L * 0.38,
        -TS * 0.52,
        TJX - TL + tailWig * L * 0.52,
        -TS,
        TJX - TL + tailWig * L * 0.52,
        -TS,
      )
      .bezierCurveTo(
        TJX - TL * 0.44 + tailWig * L * 0.26,
        -TS * 0.3,
        TJX,
        -L * 0.06,
        TJX,
        0,
      )
      .fill({ color: finCol, alpha: 0.84 });

    // Lower lobe
    this.g
      .moveTo(TJX, 0)
      .bezierCurveTo(
        TJX - TL * 0.5 - tailWig * L * 0.38,
        TS * 0.52,
        TJX - TL - tailWig * L * 0.52,
        TS,
        TJX - TL - tailWig * L * 0.52,
        TS,
      )
      .bezierCurveTo(
        TJX - TL * 0.44 - tailWig * L * 0.26,
        TS * 0.3,
        TJX,
        L * 0.06,
        TJX,
        0,
      )
      .fill({ color: finCol, alpha: 0.84 });

    // ── BODY: plump goldfish oval ───────────────────────────────────────────
    const bend = wiggle * 0.07;
    this.g
      .moveTo(TJX, 0)
      .bezierCurveTo(
        -L * 0.72 + bend * L,
        -L * 0.94,
        -L * 0.05,
        -L * 1.04,
        L * 0.82,
        -L * 0.22,
      )
      .bezierCurveTo(L * 1.1, -L * 0.08, L * 1.1, L * 0.08, L * 0.82, L * 0.22)
      .bezierCurveTo(
        -L * 0.05,
        L * 1.06,
        -L * 0.72 + bend * L,
        L * 0.96,
        TJX,
        0,
      )
      .fill({ color: bodyCol });

    // Pale belly sheen
    this.g
      .ellipse(L * 0.08, L * 0.5, L * 0.52, L * 0.3)
      .fill({ color: 0xffee99, alpha: 0.22 + shimA3 * 0.12 });

    // Caustic shimmer patches (dancing light on scales)
    this.g
      .ellipse(-L * 0.1 + shimA * L * 0.24, -L * 0.42, L * 0.3, L * 0.16)
      .fill({ color: 0xffffff, alpha: shimA * 0.24 });
    this.g
      .ellipse(L * 0.3 + shimA2 * L * 0.18, -L * 0.36, L * 0.2, L * 0.12)
      .fill({ color: 0xffffff, alpha: shimA2 * 0.18 });
    this.g
      .ellipse(L * 0.54, -L * 0.22 + shimA3 * L * 0.1, L * 0.13, L * 0.09)
      .fill({ color: 0xffffff, alpha: shimA3 * 0.14 });

    // ── DORSAL FIN (tall, flowing, gentle sway) ─────────────────────────────
    const df = wiggle * 0.08;
    this.g
      .moveTo(-L * 0.4, -L * 0.92)
      .bezierCurveTo(
        -L * 0.22 + df * L,
        -L * 1.74,
        L * 0.2 + df * L,
        -L * 1.64,
        L * 0.48,
        -L * 0.92,
      )
      .bezierCurveTo(
        L * 0.2,
        -L * 1.06,
        -L * 0.22,
        -L * 1.06,
        -L * 0.4,
        -L * 0.92,
      )
      .fill({ color: finCol, alpha: 0.62 });

    // ── PECTORAL FIN (side, soft flap) ─────────────────────────────────────
    const pFlap = Math.sin(s.phase * 0.68) * 0.2;
    this.g
      .moveTo(L * 0.22, L * 0.18)
      .bezierCurveTo(
        L * 0.36 + pFlap * L * 0.3,
        L * 0.66,
        L * 0.05,
        L * 0.9,
        -L * 0.1,
        L * 0.76,
      )
      .bezierCurveTo(
        -L * 0.12,
        L * 0.52,
        L * 0.06,
        L * 0.33,
        L * 0.22,
        L * 0.18,
      )
      .fill({ color: finCol, alpha: 0.53 });

    // ── ANAL FIN (small lower lobe) ─────────────────────────────────────────
    this.g
      .moveTo(-L * 0.35, L * 0.94)
      .bezierCurveTo(
        -L * 0.48,
        L * 1.38,
        -L * 0.68,
        L * 1.28,
        -L * 0.72,
        L * 0.94,
      )
      .bezierCurveTo(
        -L * 0.62,
        L * 1.05,
        -L * 0.42,
        L * 1.02,
        -L * 0.35,
        L * 0.94,
      )
      .fill({ color: finCol, alpha: 0.5 });

    // ── GILL LINE ───────────────────────────────────────────────────────────
    this.g
      .moveTo(L * 0.5, -L * 0.6)
      .bezierCurveTo(L * 0.42, 0, L * 0.42, L * 0.15, L * 0.5, L * 0.62)
      .stroke({ color: 0x000000, alpha: 0.13, width: L * 0.026 });

    // ── EYE ────────────────────────────────────────────────────────────────
    this.g.circle(L * 0.74, -L * 0.18, L * 0.12).fill({ color: 0x111111 });
    this.g
      .circle(L * 0.77, -L * 0.23, L * 0.05)
      .fill({ color: 0xffffff, alpha: 0.8 });

    // ── MOUTH ──────────────────────────────────────────────────────────────
    this.g
      .circle(L * 1.08, L * 0.06, L * 0.055)
      .fill({ color: 0xcc7755, alpha: 0.8 });
  }
}

function colorRGB(r: number, g: number, b: number): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bubbles
// ─────────────────────────────────────────────────────────────────────────────

interface Bubble {
  x: number;
  y: number;
  vy: number;
  r: number;
  alpha: number;
  wobble: number;
  wobbleAmp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export class WaterGoldfishScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly waterQuad: Sprite;
  private readonly waterUniforms: UniformGroup;
  private readonly resolution = new Float32Array([1920, 1080]);
  private readonly fishLayer: Container;
  private readonly bubbleGfx: Graphics;
  private readonly fish: GoldFish[] = [];
  private readonly bubbles: Bubble[] = [];
  private time = 0;
  private w = 1920;
  private h = 1080;

  constructor() {
    super();

    // Water background shader
    this.waterUniforms = new UniformGroup({
      uTime: { value: 0, type: "f32" },
      uResolution: { value: this.resolution, type: "vec2<f32>" },
    });
    const wf = new Filter({
      glProgram: new GlProgram({ vertex: FILTER_VERT, fragment: WATER_FRAG }),
      resources: { waterUniforms: this.waterUniforms },
    });
    this.waterQuad = new Sprite(Texture.WHITE);
    this.waterQuad.filters = [wf];
    this.addChild(this.waterQuad);

    // Fish layer — sortable so deeper fish render behind
    this.fishLayer = new Container();
    this.fishLayer.sortableChildren = true;
    this.addChild(this.fishLayer);

    // Bubbles always above fish
    this.bubbleGfx = new Graphics();
    this.addChild(this.bubbleGfx);

    this.spawnFish(20);
    this.spawnBubbles(30);
  }

  private spawnFish(n: number): void {
    for (let i = 0; i < n; i++) {
      // Seed three loose groups for initial flocking structure
      const grp = i % 3;
      const cx = [380, 960, 1540][grp];
      const cy = [300, 640, 380][grp];
      const angle = Math.random() * Math.PI * 2;
      const spd = 44 + Math.random() * 54;
      const state: FishState = {
        x: cx + (Math.random() - 0.5) * 240,
        y: cy + (Math.random() - 0.5) * 240,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        depth: Math.random(),
        depthPhase: Math.random() * Math.PI * 2,
        depthRate: 0.07 + Math.random() * 0.11,
        phase: Math.random() * Math.PI * 2,
        phaseRate: 3.5 + Math.random() * 2.8,
        shimmer: Math.random() * Math.PI * 2,
        shimmerRate: 1.5 + Math.random() * 3.2,
        size: 36 + Math.random() * 28,
      };
      const fish = new GoldFish(state);
      this.fish.push(fish);
      this.fishLayer.addChild(fish);
    }
  }

  private spawnBubbles(n: number): void {
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        vy: 16 + Math.random() * 42,
        r: 2 + Math.random() * 10,
        alpha: 0.07 + Math.random() * 0.18,
        wobble: Math.random() * Math.PI * 2,
        wobbleAmp: 4 + Math.random() * 14,
      });
    }
  }

  // ── Boids ─────────────────────────────────────────────────────────────────

  private updateBoids(dt: number): void {
    const fs = this.fish;
    const N = fs.length;
    const PERC = 148;
    const SEP = 64;
    const MAX = 112;
    const MIN = 28;

    for (let i = 0; i < N; i++) {
      const s = fs[i].state;
      let sx = 0,
        sy = 0,
        sn = 0;
      let ax = 0,
        ay = 0;
      let cx = 0,
        cy = 0,
        an = 0;

      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const o = fs[j].state;
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist < SEP) {
          // Separation: push away from close neighbours
          sx -= dx / (dist + 0.01);
          sy -= dy / (dist + 0.01);
          sn++;
        }
        if (dist < PERC) {
          // Alignment + cohesion radius
          ax += o.vx;
          ay += o.vy;
          cx += o.x;
          cy += o.y;
          an++;
        }
      }

      let fx = 0,
        fy = 0;

      if (sn > 0) {
        const sl = Math.hypot(sx, sy) + 0.01;
        fx += (sx / sl) * MAX * 1.6 * dt;
        fy += (sy / sl) * MAX * 1.6 * dt;
      }
      if (an > 0) {
        // Alignment: steer toward average heading
        ax /= an;
        ay /= an;
        fx += (ax - s.vx) * 0.95 * dt;
        fy += (ay - s.vy) * 0.95 * dt;
        // Cohesion: steer toward flock centroid
        cx /= an;
        cy /= an;
        fx += (cx - s.x) * 0.11 * dt;
        fy += (cy - s.y) * 0.11 * dt;
      }

      // Soft screen boundary push
      const mar = 108;
      if (s.x < mar) fx += (mar - s.x) * 1.4 * dt;
      if (s.x > this.w - mar) fx -= (s.x - (this.w - mar)) * 1.4 * dt;
      if (s.y < mar) fy += (mar - s.y) * 1.4 * dt;
      if (s.y > this.h - mar) fy -= (s.y - (this.h - mar)) * 1.4 * dt;

      s.vx += fx;
      s.vy += fy;

      const spd = Math.hypot(s.vx, s.vy);
      if (spd > MAX) {
        s.vx *= MAX / spd;
        s.vy *= MAX / spd;
      } else if (spd < MIN && spd > 0) {
        s.vx *= MIN / spd;
        s.vy *= MIN / spd;
      } else if (spd === 0) {
        s.vx = MIN;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  // ── Bubbles ───────────────────────────────────────────────────────────────

  private drawBubbles(dt: number): void {
    this.bubbleGfx.clear();
    for (const b of this.bubbles) {
      b.wobble += dt * 1.7;
      b.y -= b.vy * dt;
      b.x += Math.sin(b.wobble) * b.wobbleAmp * dt;
      if (b.y < -20) {
        b.y = this.h + 15;
        b.x = Math.random() * this.w;
      }
      const a = b.alpha * (0.65 + 0.35 * Math.sin(b.wobble * 0.65));
      this.bubbleGfx
        .circle(b.x, b.y, b.r)
        .stroke({ color: 0xaaeeff, alpha: a, width: 0.9 });
      // Specular highlight inside bubble
      this.bubbleGfx
        .circle(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.28)
        .fill({ color: 0xffffff, alpha: a * 0.46 });
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.waterQuad.width = w;
    this.waterQuad.height = h;
    this.resolution[0] = w;
    this.resolution[1] = h;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    this.waterUniforms.uniforms.uTime = this.time;

    this.updateBoids(dt);

    // redraw() updates depth → zIndex; sortableChildren handles paint order
    for (const f of this.fish) f.redraw(dt);

    this.drawBubbles(dt);
  }
}
