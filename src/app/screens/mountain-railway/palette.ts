// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
export const CP_OVERLAY0 = 0x6c7086;
export const CP_YELLOW = 0xf9e2af;
export const CP_PEACH = 0xfab387;

// ── Sky ───────────────────────────────────────────────────────────────────────
export const SKY_TOP = 0x06060f;
export const SKY_HORIZON = 0x14142a;

// ── Mountains ─────────────────────────────────────────────────────────────────
export const MTN_FAR = 0x10112a;
export const MTN_MID = 0x0b0c20;
export const MTN_NEAR = 0x080916;

// ── Scene ─────────────────────────────────────────────────────────────────────
export const GROUND_COLOR = 0x06060d;
export const CLOUD_COLOR = 0x131328;
export const STAR_COLOR = 0xdce9ff;
export const MOON_COLOR = 0xf0eadb;
export const MOON_GLOW_COLOR = 0xc4deff;
export const RAIL_COLOR = 0x45475a;
export const TIE_COLOR = 0x28293a;
export const BALLAST_COLOR = 0x13142a;

// ── Train (modern speed train) ────────────────────────────────────────────────
export const TRAIN_BODY = 0x1c1e32;
export const TRAIN_ROOF = 0x14162a;
export const TRAIN_STRIPE = 0x2d4a88; // blue accent stripe along body
export const TRAIN_UNDERBELLY = 0x101220;
export const BOGIE_COLOR = 0x1a1b2c;
export const BOGIE_FRAME = 0x252640;
export const WHEEL_COLOR = 0x585b70;
export const HEADLIGHT_COLOR = 0xeef6ff; // cool white LED
export const TAILLIGHT_COLOR = 0xff4444; // red tail
export const WINDOW_DARK = 0x0f1022;
export const GLASS_COLOR = 0x3355aa; // cab windshield tint

// ── Trees ─────────────────────────────────────────────────────────────────────
export const TREE_PALETTE = [
  [8, 9, 20],
  [9, 10, 22],
  [7, 8, 17],
  [10, 11, 24],
  [8, 10, 19],
  [6, 7, 15],
  [9, 9, 21],
  [7, 9, 18],
] as const;

export const TREE_W = 175;
export const TREE_H = 255;
export const TREE_COLS = 16;
export const TREE_ROWS = 6;
export const STAR_COUNT = 280;
export const TRAIN_SPEED = 520; // px/s — high-speed rail
export const WIND_COUNT = 42; // atmospheric speed streaks
