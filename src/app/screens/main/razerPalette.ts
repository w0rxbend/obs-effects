// ── Palette ───────────────────────────────────────────────────────────────────
// Razer signature greens + LoL blues/purples + toxic black-green-violet

export const RAZER_GREEN = 0x00ff41;
export const LIME_GREEN = 0x44d62c;
export const TOXIC_GREEN = 0x39ff14;
export const TOXIC_LIME = 0x7fff00;
export const LOL_BLUE = 0x0bc4e3;
export const LOL_TEAL = 0x00f0d0;
export const LOL_VIOLET = 0xc050ff;
export const LOL_PURPLE = 0x7b2fbe;
export const DEEP_BLUE = 0x1a4adb;
export const TOXIC_VIOLET = 0x8b00ff;
export const TOXIC_PURPLE = 0x5f00a8;
// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
export const CATT_MAUVE = 0xcba6f7;
export const CATT_PINK = 0xf38ba8;
export const CATT_PEACH = 0xfab387;
export const CATT_YELLOW = 0xf9e2af;
export const CATT_SKY = 0x89dceb;
export const CATT_SAPPHIRE = 0x74c7ec;
export const CATT_LAVENDER = 0xb4befe;
export const CATT_TEAL_CAT = 0x94e2d5;
export const DARK_CRUST = 0x11111b; // Catppuccin Mocha — deepest near-black
export const INK_BLACK = 0x000000;

// Catppuccin-only subset for orbit dots
export const CATT_PALETTE = [
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_YELLOW,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
  CATT_TEAL_CAT,
] as const;

export type CattColor = (typeof CATT_PALETTE)[number];

export function randomCatt(): CattColor {
  return CATT_PALETTE[Math.floor(Math.random() * CATT_PALETTE.length)];
}

export const PALETTE = [
  RAZER_GREEN,
  LIME_GREEN,
  TOXIC_GREEN,
  TOXIC_LIME,
  LOL_BLUE,
  LOL_TEAL,
  LOL_VIOLET,
  LOL_PURPLE,
  DEEP_BLUE,
  TOXIC_VIOLET,
  TOXIC_PURPLE,
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_YELLOW,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
  CATT_TEAL_CAT,
] as const;

export type PaletteColor = (typeof PALETTE)[number];

export interface WaveConfig {
  color: number;
  waveCount: number;
  baseAmplitude: number;
  speed: number;
  radiusScale: number;
  phaseOffset: number;
  lineWidth: number; // base core stroke width in px
  breatheMode: "calm" | "bass" | "electric" | "fluid";
}

// ── Wave configs — TrapNation neon-tube style ─────────────────────────────────

export const WAVE_CONFIGS: WaveConfig[] = [
  // ── Catppuccin structural ring (1 anchor) ────────────────────────────────
  {
    color: CATT_TEAL_CAT,
    waveCount: 2,
    baseAmplitude: 4,
    speed: 0.02,
    radiusScale: 0.87,
    phaseOffset: 0.0,
    lineWidth: 8,
    breatheMode: "bass",
  },
  // ── Colorful rings ────────────────────────────────────────────────────────
  {
    color: CATT_PINK,
    waveCount: 8,
    baseAmplitude: 6,
    speed: -0.36,
    radiusScale: 0.9,
    phaseOffset: 1.6,
    lineWidth: 1.2,
    breatheMode: "electric",
  },
  {
    color: TOXIC_VIOLET,
    waveCount: 12,
    baseAmplitude: 3,
    speed: 0.74,
    radiusScale: 0.93,
    phaseOffset: 1.8,
    lineWidth: 2.0,
    breatheMode: "electric",
  },
  {
    color: LOL_VIOLET,
    waveCount: 9,
    baseAmplitude: 5,
    speed: 0.18,
    radiusScale: 0.96,
    phaseOffset: 2.3,
    lineWidth: 1.5,
    breatheMode: "fluid",
  },
  {
    color: RAZER_GREEN,
    waveCount: 7,
    baseAmplitude: 7,
    speed: 0.4,
    radiusScale: 0.99,
    phaseOffset: 0.0,
    lineWidth: 2.5,
    breatheMode: "bass",
  },
  {
    color: TOXIC_GREEN,
    waveCount: 3,
    baseAmplitude: 14,
    speed: -0.11,
    radiusScale: 1.02,
    phaseOffset: 0.7,
    lineWidth: 3.0,
    breatheMode: "bass",
  },
  {
    color: LOL_BLUE,
    waveCount: 5,
    baseAmplitude: 9,
    speed: -0.26,
    radiusScale: 1.05,
    phaseOffset: 1.1,
    lineWidth: 1.5,
    breatheMode: "calm",
  },
  {
    color: CATT_MAUVE,
    waveCount: 4,
    baseAmplitude: 11,
    speed: 0.22,
    radiusScale: 1.09,
    phaseOffset: 0.4,
    lineWidth: 2.0,
    breatheMode: "fluid",
  },
];

export const WAVE_STEPS = 240;

export function randomPalette(): PaletteColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

/** Build a jagged lightning path between two points. */
export function jaggedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  segments = 8,
  jaggedness = 22,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [[x1, y1]];
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len,
    py = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const offset = (Math.random() - 0.5) * jaggedness;
    pts.push([x1 + dx * t + px * offset, y1 + dy * t + py * offset]);
  }
  pts.push([x2, y2]);
  return pts;
}
