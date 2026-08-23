import type { Container } from "pixi.js";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface TapeObj {
  container: Container;
  contentCont: Container; // holds label + icons; faded as a unit
  isMain: boolean;
  baseCX: number;
  baseCY: number;
  baseAngle: number;
  bounceAmp: number;
  bounceFreq: number;
  bouncePhase: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  fontSize: number;
  hh: number;
  state: "show" | "fade_out" | "fade_in";
  fadeTimer: number;
  showTimer: number;
  showDuration: number;
}

export interface NetDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  phase: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

export interface RainDrop {
  x: number;
  y: number;
  vy: number;
  length: number;
  alpha: number;
  color: number;
  width: number;
}

export interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  alpha: number;
  color: number;
  life: number;
  maxLife: number;
  trailAlpha: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  gravity: number;
}

export interface StainBlob {
  dx: number; // offset from stain centre
  dy: number;
  r: number; // current radius
  baseR: number; // rest radius
  pulsePhase: number;
  pulseSpeed: number;
  pulseAmp: number; // fraction of baseR
  driftVx: number; // slow drift velocity
  driftVy: number;
  colorB: number; // secondary color for lerp
  colorPhase: number;
  colorSpeed: number;
}

export interface Stain {
  x: number;
  y: number;
  alpha: number;
  color: number;
  blobs: StainBlob[];
}

export interface Drop {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  splat: number; // 0 = falling, >0 = splatting (radius grows)
  splatMax: number;
}

export interface FireParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  baseX: number;
  baseY: number;
  turbPhase: number;
  turbFreq: number;
  turbAmp: number;
}

export interface FireworkShell {
  x: number;
  y: number;
  vy: number; // rising velocity (negative = up)
  life: number;
  maxLife: number;
  burst: boolean; // has it exploded yet
  color: number;
  trailParticles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }>;
}

export interface MovingLine {
  x: number; // leading edge x (in screen coords, centre-origin)
  y: number;
  angle: number; // radians
  length: number;
  speed: number; // px/s along angle direction
  alpha: number;
  color: number;
  width: number;
}

export interface PulseDot {
  x: number;
  y: number;
  baseR: number;
  pulseAmp: number; // fraction of baseR
  pulsePhase: number;
  pulseSpeed: number;
  alpha: number;
  color: number;
  colorB: number;
  colorPhase: number;
  colorSpeed: number;
  ringAlpha: number; // outer ring opacity multiplier
}

export interface OrbitDot {
  angle: number; // current orbital angle
  speed: number; // rad/s
  radius: number; // orbit radius
  size: number;
  trailLen: number; // number of ghost circles in trail
  alpha: number;
  color: number;
}

export interface OrbitGroup {
  cx: number;
  cy: number;
  dots: OrbitDot[];
}

export interface YellowDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  phase: number;
  speed: number;
}
