// ── Palette ───────────────────────────────────────────────────────────────────
export const TAPE_YELLOW = 0xf9e2af; // Catppuccin Mocha Yellow
export const TAPE_BLACK = 0x11111b; // Catppuccin Mocha Crust
export const CATT_MAUVE = 0xcba6f7;
export const CATT_PINK = 0xf38ba8;
export const CATT_PEACH = 0xfab387;
export const CATT_SKY = 0x89dceb;
export const CATT_YELLOW = 0xf9e2af;
export const WHITE = 0xffffff;
// Yellow-family variants for the new effects
export const CATT_GOLD = 0xe6c07b;
export const CATT_AMBER = 0xd4a04a;
export const CATT_LEMON = 0xfff0a0;
export const CATT_BUTTER = 0xfde8b0;
export const CATT_HONEY = 0xf2c97a;
// Fire ramp: dark core → hot yellow tip
export const FIRE_RED = 0xe64553; // Catppuccin Maroon-ish
export const FIRE_ORANGE = 0xfe640b; // Catppuccin Flamingo-orange
export const FIRE_YELLOW = 0xdf8e1d; // Catppuccin Yellow-orange
export const FIRE_TIP = 0xfff0a0; // pale lemon tip

export const PARTICLE_PALETTE = [
  CATT_MAUVE,
  CATT_PINK,
  CATT_PEACH,
  CATT_SKY,
  CATT_YELLOW,
  WHITE,
] as const;

export const YELLOW_PALETTE = [
  CATT_YELLOW,
  CATT_GOLD,
  CATT_AMBER,
  CATT_LEMON,
  CATT_BUTTER,
  CATT_HONEY,
  CATT_PEACH,
] as const;

// ── Main tape phrases ─────────────────────────────────────────────────────────
export const MAIN_PHRASES = [
  "STREAMER IS DEFINITELY NOT CRYING",
  "HIDING PASSWORDS IN PLAIN SIGHT",
  "IF YOU SAW THAT, YOU SAW NOTHING",
  "MY BOSS THINKS I AM WORKING",
  "CONFIDENTIAL: SALARY NEGOTIATION TACTICS",
  "CHAT DO NOT CLIP THIS. CHAT.",
  "DISCORD DM READING SIMULATOR",
  "GOOGLE SEARCH HISTORY: CLASSIFIED",
  "ABSOLUTELY NOT ONLINE SHOPPING",
  "STREAMER SWITCHING TO COMPETITOR",
  "TOP SECRET: ACTUALLY READING DOCS",
  "CTRL+Z CANNOT SAVE ME NOW",
  "YES THIS IS A WORK MEETING",
  "DO NOT TELL WIFE ABOUT THIS TAB",
  "STREAMER IS GOOGLING HOW TO CODE",
  "CLASSIFIED: TWITCH RIVAL RESEARCH",
  "TAX FRAUD SPEEDRUN IN PROGRESS",
  "NOTHING HAPPENED. GO WATCH ADS.",
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────
export const NET_DOT_COUNT = 45;
export const NET_MAX_DIST = 180;
export const PARTICLE_COUNT = 140;
export const RAIN_COUNT = 90;
export const METEOR_COUNT = 6;
export const SPARK_COUNT = 60;
export const STAIN_COUNT = 12;
export const DROP_COUNT = 40;
export const YELLOW_DOT_COUNT = 55;
export const FIRE_PARTICLE_COUNT = 420;
export const MOVING_LINE_COUNT = 28;
export const PULSE_DOT_COUNT = 22;
export const ORBIT_GROUP_COUNT = 6;
// Local half-width of each tape (must reach screen edges from centre at any rotation)
export const TAPE_HW = 1400;
export const TAPE_FADE_DURATION = 0.5;
export const TAPE_SHOW_MIN = 4.0;
export const TAPE_SHOW_MAX = 8.5;
