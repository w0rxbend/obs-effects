import {
  C_BLUE,
  C_FLAMINGO,
  C_GREEN,
  C_LAVENDER,
  C_MAUVE,
  C_OVERLAY0,
  C_PEACH,
  C_PINK,
  C_ROSEWATER,
  C_SAPPHIRE,
  C_SKY,
  C_SUBTEXT,
  C_TEAL,
  C_YELLOW,
} from "./palette";

// ── Element definitions ───────────────────────────────────────────────────────
export interface ElementDef {
  symbol: string;
  name: string;
  protons: number;
  neutrons: number;
  color: number;
  electronColor: number;
}

export const ELEMENT_TABLE: ElementDef[] = [
  {
    symbol: "H",
    name: "Hydrogen",
    protons: 1,
    neutrons: 0,
    color: C_FLAMINGO,
    electronColor: C_SKY,
  },
  {
    symbol: "D",
    name: "Deuterium",
    protons: 1,
    neutrons: 1,
    color: C_FLAMINGO,
    electronColor: C_SKY,
  },
  {
    symbol: "T",
    name: "Tritium",
    protons: 1,
    neutrons: 2,
    color: C_PINK,
    electronColor: C_MAUVE,
  },
  {
    symbol: "He",
    name: "Helium",
    protons: 2,
    neutrons: 2,
    color: C_YELLOW,
    electronColor: C_PEACH,
  },
  {
    symbol: "Li",
    name: "Lithium",
    protons: 3,
    neutrons: 4,
    color: C_GREEN,
    electronColor: C_TEAL,
  },
  {
    symbol: "C",
    name: "Carbon",
    protons: 6,
    neutrons: 6,
    color: C_TEAL,
    electronColor: C_BLUE,
  },
  {
    symbol: "N",
    name: "Nitrogen",
    protons: 7,
    neutrons: 7,
    color: C_SKY,
    electronColor: C_SAPPHIRE,
  },
  {
    symbol: "O",
    name: "Oxygen",
    protons: 8,
    neutrons: 8,
    color: C_BLUE,
    electronColor: C_LAVENDER,
  },
  {
    symbol: "Fe",
    name: "Iron",
    protons: 26,
    neutrons: 30,
    color: C_PEACH,
    electronColor: C_YELLOW,
  },
  {
    symbol: "Kr",
    name: "Krypton",
    protons: 36,
    neutrons: 48,
    color: C_MAUVE,
    electronColor: C_PINK,
  },
  {
    symbol: "Ba",
    name: "Barium",
    protons: 56,
    neutrons: 82,
    color: C_ROSEWATER,
    electronColor: C_FLAMINGO,
  },
  {
    symbol: "U",
    name: "Uranium-235",
    protons: 92,
    neutrons: 143,
    color: C_LAVENDER,
    electronColor: C_MAUVE,
  },
];

export function elementByZ(z: number, n?: number): ElementDef {
  const match = ELEMENT_TABLE.find((e) => e.protons === z);
  if (match) {
    return { ...match, neutrons: n ?? match.neutrons };
  }
  return {
    symbol: "X",
    name: "Unknown",
    protons: z,
    neutrons: n ?? Math.round(z * 1.3),
    color: C_SUBTEXT,
    electronColor: C_OVERLAY0,
  };
}

export function electronsPerShell(z: number): number[] {
  const maxShell = [2, 8, 18, 32, 32, 18, 8, 2];
  const shells: number[] = [];
  let rem = z;
  for (const cap of maxShell) {
    if (rem <= 0) break;
    shells.push(Math.min(rem, cap));
    rem -= cap;
  }
  return shells;
}

// Visual cap: don't draw every electron for heavy atoms
export const VISUAL_CAP = [2, 8, 8, 6, 4];

export function valenceFor(z: number): number {
  if (z === 2 || z === 10 || z === 18 || z === 36) return 0; // noble gases
  if (z === 1) return 1; // H
  if (z === 3) return 1; // Li
  if (z === 6) return 4; // C
  if (z === 7) return 3; // N
  if (z === 8) return 2; // O
  if (z === 26) return 2; // Fe
  if (z === 56) return 2; // Ba
  if (z >= 40) return 0; // heavy/radioactive — no stable bonds
  return Math.max(0, Math.min(4, 8 - (z % 8)));
}
