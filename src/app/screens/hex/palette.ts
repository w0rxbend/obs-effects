// Shared Catppuccin Mocha palette for the three hex webcam-border screens
// (HexCamScreen, HexLayerCamScreen and HexGridCamScreen), which each carried an
// identical private copy of this block. The values and the PALETTE ordering are
// copied verbatim from those files so the rendering is unchanged.

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
export const CATT_ROSEWATER = 0xf5e0dc;
export const CATT_FLAMINGO = 0xf2cdcd;
export const CATT_PINK = 0xf5c2e7;
export const CATT_MAUVE = 0xcba6f7;
export const CATT_RED = 0xf38ba8;
export const CATT_MAROON = 0xeba0ac;
export const CATT_PEACH = 0xfab387;
export const CATT_YELLOW = 0xf9e2af;
export const CATT_GREEN = 0xa6e3a1;
export const CATT_TEAL = 0x94e2d5;
export const CATT_SKY = 0x89dceb;
export const CATT_SAPPHIRE = 0x74c7ec;
export const CATT_BLUE = 0x89b4fa;
export const CATT_LAVENDER = 0xb4befe;
export const CATT_TEXT = 0xcdd6f4;

export const PALETTE = [
  CATT_ROSEWATER,
  CATT_FLAMINGO,
  CATT_PINK,
  CATT_MAUVE,
  CATT_RED,
  CATT_MAROON,
  CATT_PEACH,
  CATT_YELLOW,
  CATT_GREEN,
  CATT_TEAL,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_BLUE,
  CATT_LAVENDER,
] as const;

export function palColor(i: number): number {
  return PALETTE[Math.abs(Math.floor(i)) % PALETTE.length];
}
