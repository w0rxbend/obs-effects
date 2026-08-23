import { CP_PEACH, CP_YELLOW } from "./palette";

// Sized so (1920 + 80 + TRAIN_LENGTH + 80) / 100 ≈ 30 s
export const LOCO_W = 180;
export const LOCO_H = 55; // body height above wheels
export const LOCO_NOSE = 44; // length of tapered nose section
export const WAGON_W = 200;
export const WAGON_H = 50;
export const CAR_GAP = 2;
export const NUM_WAGONS = 15;
export const WAGON_WINDOWS = 10;
export const BOGIE_OFFSET = 14; // how far bogies sit from car ends
export const WHEEL_R = 5; // wheel radius (modern train, smaller than steam)
// TRAIN_LENGTH = 180 + 15*(200+2) + 2 = 3212
export const TRAIN_LENGTH = LOCO_W + NUM_WAGONS * (WAGON_W + CAR_GAP) + CAR_GAP;

export const WINDOW_COLORS = [CP_YELLOW, CP_PEACH, 0xffe4a0] as const;
