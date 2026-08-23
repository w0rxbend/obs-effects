// ── Palette (Catppuccin Mocha) ────────────────────────────────────────────────
export const SUN_CORE = 0xf9e2af;
export const SUN_MID = 0xfab387;
export const SUN_CORONA = 0xfe640b;
export const CATT_ROSEWATER = 0xf5e0dc;
export const CATT_FLAMINGO = 0xf2cdcd;
export const CATT_PEACH = 0xfab387;
export const CATT_YELLOW = 0xf9e2af;
export const CATT_GREEN = 0xa6e3a1;
export const CATT_RED = 0xf38ba8;
export const CATT_SKY = 0x89dceb;
export const CATT_BLUE = 0x89b4fa;
export const CATT_MAUVE = 0xcba6f7;
export const CATT_LAVENDER = 0xb4befe;
export const CATT_TEAL = 0x94e2d5;
export const CATT_OVERLAY0 = 0x6c7086;
export const CATT_SURFACE0 = 0x313244;
export const CATT_BASE = 0x1e1e2e;
export const CATT_CRUST = 0x11111b;

export const STAR_COLORS = [
  0xffffff,
  0xcdd6f4,
  CATT_LAVENDER,
  CATT_BLUE,
  CATT_SKY,
  CATT_ROSEWATER,
  CATT_YELLOW,
  0xffe9b0,
] as const;

export const GALAXY_COLORS = [
  CATT_MAUVE,
  CATT_BLUE,
  CATT_SKY,
  CATT_TEAL,
  CATT_LAVENDER,
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
export const STAR_COUNT = 280;
export const DEEP_CLUSTER_COUNT = 6;
export const GALAXY_COUNT = 4;
export const ASTEROID_COUNT = 90;
export const KUIPER_COUNT = 60;
export const INNER_BELT_COUNT = 50;
export const PULSAR_COUNT = 3;
export const QUASAR_COUNT = 4;
// Orbital scale: semi-major axes are fractions of this * min(w,h)*0.5
export const SOLAR_SCALE = 0.88;
// Dot dash segment length for orbit trajectories (px)
export const DASH_LEN = 6;
export const GAP_LEN = 10;

// ── Black hole ────────────────────────────────────────────────────────────────
export const BH_GRAVITY = 600000; // gravitational pull strength (px·px/s²)
export const BH_SWALLOW_R = 28; // boids inside this radius get swallowed (= event horizon)
export const BH_EVENT_HORIZON = 28; // visual event horizon radius

// ── Boids / Space Battle ──────────────────────────────────────────────────────
export const BOIDS_PER_TEAM = 38;
export const BOID_MAX_SPEED = 115;
export const BOID_MAX_FORCE = 220;
export const SEP_RADIUS = 24; // push apart within this distance
export const ALI_RADIUS = 58; // match heading within this distance
export const COH_RADIUS = 80; // steer toward centroid within this distance
export const DETECT_RANGE = 190; // switch to attack when enemy within this range
export const FIRE_RANGE = 115; // fire laser when enemy within this range
export const SHOOT_INTERVAL = 1.6; // seconds between shots per boid
export const LASER_SPEED = 400;
export const LASER_LIFE = 0.32;
export const BOID_HEALTH = 4;
export const REINFORCE_INTERVAL = 12; // seconds between reinforcement waves
export const REINFORCE_COUNT = 6; // boids added per wave per team
export const SPLIT_CHANCE = 0.3; // probability a dying boid splits into 2 offspring
export const ADMIRAL_HEALTH = 30;
export const ADMIRAL_SPEED = 38;
export const ADMIRAL_SIZE = 9; // draw radius
export const ADMIRAL_SPAWN_RADIUS = 55; // boids spawn within this distance of admiral
export const ADMIRAL_WANDER_INTERVAL = 4; // seconds between heading changes
export const ADMIRAL_SHOOT_INTERVAL = 0.9;

export const TEAM_RED = 0 as const;
export const TEAM_BLUE = 1 as const;
export const TEAM_COLOR = [0xf38ba8, 0x89b4fa] as const; // CATT_RED, CATT_BLUE
export const TEAM_ENGINE = [0xfab387, 0x89dceb] as const; // CATT_PEACH, CATT_SKY
export const TEAM_LASER_COLOR = [0xff6e6e, 0x74c7ec] as const;
