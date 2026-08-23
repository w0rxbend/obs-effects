export interface StarNode {
  orbitAngle: number;
  orbitRadius: number;
  size: number;
  alpha: number;
  twinkle: number;
  phase: number;
  glow: number;
  pulse: number;
  bright: boolean;
}

export interface CloudPuff {
  dx: number;
  dy: number;
  radius: number;
}

export interface CloudBand {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  speed: number;
  phase: number;
  depth: number;
  puffs: CloudPuff[];
}

export interface WindowLight {
  x: number;
  y: number;
  w: number;
  h: number;
  on: boolean;
  timer: number;
  interval: number;
  color: number;
}

export interface SmokeSource {
  x: number;
  y: number;
  layerDepth: number;
  timer: number;
  nextSpawn: number;
}

export interface Building {
  x: number;
  width: number;
  height: number;
  kind: "tower" | "slab" | "midrise" | "walkup";
  roof: "flat" | "step" | "antenna";
  bodyInset: number;
  podiumHeight: number;
  podiumInset: number;
  crownHeight: number;
  crownInset: number;
  windowDensity: number;
  windows: WindowLight[];
  smokeSources: SmokeSource[];
}

export interface BuildingLayer {
  depth: number;
  baseY: number;
  color: number;
  edge: number;
  windowAlpha: number;
  buildings: Building[];
}

export interface SmokePuff {
  x: number;
  y: number;
  size: number;
  age: number;
  life: number;
  drift: number;
  rise: number;
  alpha: number;
  phase: number;
  layerDepth: number;
}

export interface WindLine {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  thickness: number;
  phase: number;
}

export interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  age: number;
  life: number;
  alpha: number;
  thickness: number;
}

export interface TextMeshPoint {
  x: number;
  y: number;
  phase: number;
  size: number;
}

export interface TextMeshSegment {
  a: number;
  b: number;
  strength: number;
}

export interface TreeCluster {
  x: number;
  width: number;
  type: "broadleaf" | "poplar" | "conifer";
  trunkWidth: number;
  trunkHeight: number;
  canopyWidth: number;
  canopyHeight: number;
  phase: number;
  lean: number;
  crownLift: number;
  crownLeft: number;
  crownRight: number;
  lobeCount: number;
  bushLeft: number;
  bushRight: number;
  bushY: number;
}
