// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  color: number;
}

export interface StarCluster {
  x: number;
  y: number;
  radius: number;
  color: number;
  stars: Array<{
    dx: number;
    dy: number;
    size: number;
    alpha: number;
    phase: number;
  }>;
}

export interface Galaxy {
  x: number;
  y: number;
  angle: number; // orientation angle
  scaleX: number;
  scaleY: number;
  color: number;
  alpha: number;
  rotation: number; // slow rotation
  rotSpeed: number;
  arms: number;
}

export interface Moon {
  angle: number;
  speed: number;
  orbitR: number;
  size: number;
  color: number;
}

// Keplerian orbit: ellipse with semi-major axis a, eccentricity e
// The focus (sun) is at one of the ellipse foci: focus offset = a*e from centre
export interface PlanetDef {
  semiMajorFrac: number; // fraction of max orbit radius
  eccentricity: number; // 0 = circle, <1 = ellipse
  inclination: number; // rotation of orbit ellipse (radians)
  period: number; // orbital period in sim seconds
  size: number;
  color: number;
  atmoColor: number;
  hasRings: boolean;
  ringColor: number;
  trailLen: number;
  moons: Array<{
    orbitFrac: number;
    period: number;
    size: number;
    color: number;
  }>;
}

export interface Planet {
  // Keplerian params
  a: number; // semi-major axis (px)
  b: number; // semi-minor axis (px)
  e: number; // eccentricity
  inc: number; // inclination (rotation of ellipse)
  foci: number; // distance from centre to focus = a*e
  meanAnomaly: number; // current mean anomaly (advances linearly)
  meanMotion: number; // rad/s
  // visual
  size: number;
  color: number;
  atmoColor: number;
  hasRings: boolean;
  ringColor: number;
  pulsePhase: number;
  moons: Moon[];
  trail: Array<{ x: number; y: number }>;
  trailLen: number;
  // cached current position (sun at origin)
  px: number;
  py: number;
}

export interface Asteroid {
  a: number; // semi-major axis
  e: number; // eccentricity
  inc: number;
  meanAnomaly: number;
  meanMotion: number;
  offsetR: number; // extra radial jitter
  size: number;
  alpha: number;
  color: number;
}

export interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  trailPoints: Array<{ x: number; y: number }>;
}

// ── Black hole / Boids ────────────────────────────────────────────────────────

export interface BlackHole {
  x: number;
  y: number;
  accretionPhase: number; // slow rotation for accretion disk
  swallowFlashes: Array<{ angle: number; life: number; color: number }>;
}

export interface Admiral {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: 0 | 1;
  health: number;
  maxHealth: number;
  wanderAngle: number;
  wanderTimer: number; // seconds until next heading change
  shootTimer: number;
  shieldPhase: number;
}

export interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: 0 | 1;
  health: number;
  shootTimer: number;
  wanderAngle: number;
  size: number;
  isOffspring: boolean;
}

export interface Laser {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: 0 | 1;
  life: number;
}

export interface BoidExplosion {
  x: number;
  y: number;
  life: number;
  color: number;
  sparks: Array<{ vx: number; vy: number; size: number; color: number }>;
}

export interface Pulsar {
  x: number;
  y: number;
  phase: number; // current rotation phase
  rotSpeed: number; // rad/s — pulsars spin very fast
  beamLen: number;
  color: number;
  pulseTimer: number; // time since last radio burst
  pulsePeriod: number; // seconds between bursts
  burstAlpha: number; // fades after each burst
  size: number;
}

export interface Quasar {
  x: number;
  y: number;
  color: number;
  coreColor: number;
  size: number;
  jetAngle: number;
  jetLen: number;
  phase: number;
  flickerSpeed: number;
  alpha: number;
  diskAngle: number;
}
