// ── Palette ───────────────────────────────────────────────────────────────────
export const DEEP = 0x0a0e2a;
export const MID = 0x0d2040;
export const SURFACE = 0x1a4a6b;
export const CAUSTIC = 0x4ab8c8;
export const FOAM = 0xc9eaf5;
export const TEAL = 0x94e2d5;
export const SKY = 0x89dceb;
export const BLUE = 0x89b4fa;
export const MAUVE = 0xcba6f7;
export const GREEN = 0xa6e3a1;
export const YELLOW = 0xf9e2af;
export const PEACH = 0xfab387;
export const RED = 0xf38ba8;
export const WHITE = 0xffffff;
export const SAND = 0xe8d5a3;
export const CORAL1 = 0xff6b6b;
export const CORAL2 = 0xff9f43;
export const DARK = 0x11111b;

// ── Fish types ────────────────────────────────────────────────────────────────
export enum FishType {
  SARDINE,
  TROPICAL,
  ANGEL,
  PUFFER,
  SHARK,
  MANTA,
  SUBMARINE,
  PIRANHA,
  HAMMERHEAD,
  JELLYFISH,
  SEA_SNAKE,
  CROCODILE,
  SHRIMP,
}

export interface FishColors {
  body: number;
  accent: number;
  fin: number;
  belly: number;
  eye: number;
  stripe?: number;
}

// ── Fish palettes ─────────────────────────────────────────────────────────────
export const SARDINE_PALETTES: FishColors[] = [
  {
    body: 0x7db9e8,
    accent: 0x5ba0d0,
    fin: 0x89b4fa,
    belly: 0xd6eaf8,
    eye: DARK,
  },
  { body: 0x94e2d5, accent: 0x4db6a0, fin: TEAL, belly: 0xd5f5f0, eye: DARK },
  {
    body: 0xbac2de,
    accent: 0x9399b2,
    fin: 0xa6adc8,
    belly: 0xe8eaf2,
    eye: DARK,
  },
];
export const TROPICAL_PALETTES: FishColors[] = [
  {
    body: 0xf97316,
    accent: 0xea580c,
    fin: 0xfb923c,
    belly: WHITE,
    eye: DARK,
    stripe: WHITE,
  },
  {
    body: 0x3b82f6,
    accent: 0x2563eb,
    fin: 0x60a5fa,
    belly: 0xdbeafe,
    eye: DARK,
    stripe: YELLOW,
  },
  {
    body: RED,
    accent: 0xe0445c,
    fin: PEACH,
    belly: WHITE,
    eye: DARK,
    stripe: 0xffd700,
  },
  {
    body: YELLOW,
    accent: PEACH,
    fin: 0xfcd34d,
    belly: WHITE,
    eye: DARK,
    stripe: 0x1e40af,
  },
];
export const ANGEL_PALETTES: FishColors[] = [
  {
    body: 0xc0c8d8,
    accent: 0x8899aa,
    fin: 0xa0b8d0,
    belly: WHITE,
    eye: DARK,
    stripe: DARK,
  },
  {
    body: YELLOW,
    accent: PEACH,
    fin: 0xfcd34d,
    belly: WHITE,
    eye: DARK,
    stripe: DARK,
  },
  {
    body: MAUVE,
    accent: 0x9b59b6,
    fin: 0xd7bde2,
    belly: WHITE,
    eye: DARK,
    stripe: DARK,
  },
];
export const PUFFER_PALETTES: FishColors[] = [
  { body: 0xd4e157, accent: 0xafb42b, fin: 0xcddc39, belly: WHITE, eye: DARK },
  { body: 0xffb347, accent: CORAL2, fin: PEACH, belly: WHITE, eye: DARK },
  { body: TEAL, accent: 0x26a69a, fin: GREEN, belly: WHITE, eye: DARK },
];
export const SHARK_PALETTES: FishColors[] = [
  {
    body: 0x607d8b,
    accent: 0x455a64,
    fin: 0x546e7a,
    belly: 0xeceff1,
    eye: DARK,
  },
  { body: 0x78909c, accent: 0x546e7a, fin: 0x607d8b, belly: WHITE, eye: DARK },
  {
    body: 0x37474f,
    accent: 0x263238,
    fin: 0x455a64,
    belly: 0xcfd8dc,
    eye: DARK,
  },
];
export const MANTA_PALETTES: FishColors[] = [
  {
    body: 0x1a237e,
    accent: 0x0d47a1,
    fin: 0x3949ab,
    belly: 0xe8eaf6,
    eye: DARK,
  },
  {
    body: 0x1b5e20,
    accent: 0x2e7d32,
    fin: 0x388e3c,
    belly: 0xe8f5e9,
    eye: DARK,
  },
  { body: DARK, accent: 0x212121, fin: 0x37474f, belly: 0xf5f5f5, eye: DARK },
];
export const SUB_PALETTES: FishColors[] = [
  { body: TEAL, accent: 0x26a69a, fin: GREEN, belly: 0x00796b, eye: YELLOW },
  { body: MAUVE, accent: 0x7e57c2, fin: BLUE, belly: 0x512da8, eye: YELLOW },
  { body: BLUE, accent: 0x1565c0, fin: SKY, belly: 0x0d47a1, eye: YELLOW },
];
export const PIRANHA_PALETTES: FishColors[] = [
  {
    body: 0x8faa78,
    accent: 0x5a7040,
    fin: 0x6b9660,
    belly: 0xff3c3c,
    eye: DARK,
    stripe: 0x4a6030,
  },
  {
    body: 0xa09868,
    accent: 0x685838,
    fin: 0x78885a,
    belly: 0xff5533,
    eye: DARK,
  },
  {
    body: 0x708870,
    accent: 0x486048,
    fin: 0x587058,
    belly: 0xff2222,
    eye: DARK,
  },
];
export const CRAB_PALETTES: FishColors[] = [
  {
    body: 0xd44400,
    accent: 0xb03000,
    fin: 0xf07840,
    belly: 0xffd0a0,
    eye: DARK,
  },
  {
    body: 0x1e6888,
    accent: 0x104858,
    fin: 0x3090b0,
    belly: 0x90d0e0,
    eye: DARK,
  },
  {
    body: 0x7a5a30,
    accent: 0x5a3a18,
    fin: 0xa07848,
    belly: 0xe8c880,
    eye: DARK,
  },
  {
    body: 0x7030a0,
    accent: 0x501878,
    fin: 0x9050c0,
    belly: 0xd0a8e8,
    eye: DARK,
  },
  {
    body: 0x406030,
    accent: 0x284018,
    fin: 0x608040,
    belly: 0xb0d880,
    eye: DARK,
  },
];
export const HAMMERHEAD_PALETTES: FishColors[] = [
  {
    body: 0x546e7a,
    accent: 0x37474f,
    fin: 0x607d8b,
    belly: 0xe0e0e0,
    eye: DARK,
  },
  { body: 0x78909c, accent: 0x546e7a, fin: 0x607d8b, belly: WHITE, eye: DARK },
];
export const JELLYFISH_PALETTES: FishColors[] = [
  {
    body: 0x4ab8d8,
    accent: 0x2a98b8,
    fin: 0x7ad8f0,
    belly: 0xd0f0ff,
    eye: 0x1a7898,
  },
  {
    body: 0xd080c8,
    accent: 0xb060a8,
    fin: 0xe8a8e0,
    belly: 0xffe0ff,
    eye: DARK,
  },
  {
    body: 0xe0eef8,
    accent: 0xb8cce0,
    fin: 0xf0f8ff,
    belly: WHITE,
    eye: 0x809098,
  },
  {
    body: 0x80d0a0,
    accent: 0x50a878,
    fin: 0xb0e8c8,
    belly: 0xd8f8e8,
    eye: DARK,
  },
];
export const SEA_SNAKE_PALETTES: FishColors[] = [
  {
    body: 0x202020,
    accent: 0x141414,
    fin: 0x303030,
    belly: 0xd8c820,
    eye: 0x60c030,
    stripe: YELLOW,
  },
  {
    body: 0x1c3c14,
    accent: 0x102010,
    fin: 0x2a5420,
    belly: 0x70b050,
    eye: DARK,
    stripe: DARK,
  },
  {
    body: 0x1c2850,
    accent: 0x101830,
    fin: 0x2c4080,
    belly: 0x7090c8,
    eye: DARK,
    stripe: DARK,
  },
  {
    body: 0x503010,
    accent: 0x301808,
    fin: 0x704828,
    belly: 0xd09050,
    eye: DARK,
    stripe: 0xc07030,
  },
];
export const CROCODILE_PALETTES: FishColors[] = [
  {
    body: 0x2d5016,
    accent: 0x1e380e,
    fin: 0x3d6820,
    belly: 0x90a840,
    eye: 0xd4a017,
  },
  {
    body: 0x4a5828,
    accent: 0x303818,
    fin: 0x5a6838,
    belly: 0x8a9050,
    eye: 0xc8a820,
  },
  {
    body: 0x485850,
    accent: 0x303838,
    fin: 0x586870,
    belly: 0x788878,
    eye: 0xd0c010,
  },
];
export const SHRIMP_PALETTES: FishColors[] = [
  { body: 0xf8a0a0, accent: 0xd05050, fin: 0xf8c0c0, belly: WHITE, eye: DARK },
  { body: 0xf8a060, accent: 0xd07030, fin: 0xf8c880, belly: YELLOW, eye: DARK },
  { body: 0xd0e8f0, accent: 0x88b0c8, fin: 0xe0f0f8, belly: WHITE, eye: DARK },
  { body: 0xe8c8a0, accent: 0xb89060, fin: 0xf0dcc0, belly: WHITE, eye: DARK },
];

// ── Plant types ───────────────────────────────────────────────────────────────
export enum PlantType {
  KELP,
  SEA_FAN,
  ANEMONE,
  BUBBLE_ALGAE,
  SEA_GRASS,
  FERN,
}

export interface PlantDef {
  type: PlantType;
  nx: number; // normalised x (0-1)
  phase: number;
  speed: number;
  height: number;
  color: number;
  color2: number;
  scale: number;
}

// ── Bottom decoration types ───────────────────────────────────────────────────
export enum DecoType {
  ROCK,
  STARFISH,
  SEA_URCHIN,
  SHELL,
  ANCHOR,
  TREASURE_CHEST,
}

export interface DecoDef {
  type: DecoType;
  x: number; // absolute world x (set in resize)
  nx: number; // normalised
  ny: number; // normalised (y on/near sand)
  color: number;
  scale: number;
  phase: number;
  openSpeed: number; // chest: lid oscillation speed
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
