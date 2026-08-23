// ── Data structures ───────────────────────────────────────────────────────────
export interface Electron {
  shell: number;
  angle: number;
  speed: number;
  orbitRx: number;
  orbitRy: number;
  tilt: number;
}

export interface Atom {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  protons: number;
  neutrons: number;
  symbol: string;
  name: string;
  color: number;
  electronColor: number;
  electrons: Electron[];
  nucleusR: number;
  maxOrbitR: number;
  dying: boolean;
  reacting: boolean;
  reactTimer: number;
  reactDuration: number;
  reactColor: number;
  flickerPhase: number;
  // Bonding
  bonds: number[]; // IDs of bonded atoms
  maxBonds: number; // valence (max bonds)
  bondPhase: number; // animation phase for bond glow
}

export interface Neutron {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}

export interface LightningArc {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  segments: Array<{ x: number; y: number }>;
  color: number;
  timer: number;
  maxTimer: number;
  width: number;
}

export interface ReactionEffect {
  id: number;
  x: number;
  y: number;
  type: "fission" | "fusion" | "scatter" | "absorb";
  timer: number;
  maxTimer: number;
  color: number;
  rings: number;
  particles: Particle[];
}
