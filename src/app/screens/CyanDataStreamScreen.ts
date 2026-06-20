import { GlitchTerminalBase } from "./GlitchTerminalBase";

const HEX = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
];

export class CyanDataStreamScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#00ffe0",
      fgDim: "#006655",
      bg: "#00080a",
      blockColor: "#00ccbb",
      heavy: [...HEX, "|", ":", ";", "=", "≡"],
      light: [...HEX.slice(0, 8), "·", ".", ",", "-"],
      cell: 13,
      font: "13px 'Courier New', monospace",
      churnRate: 0.05, // faster data churn
      maxBlocks: 8,
      glitchInterval: [25, 90], // more frequent shifts
      blockAlpha: 0.55,
      densityField: (xn, yn) => {
        // Top-heavy: data streams fall from above
        return (
          0.7 +
          0.18 * Math.sin(xn * 12.7 + yn * 3.1) +
          0.1 * Math.sin(xn * 22.3 - yn * 8.5) -
          0.12 * Math.pow(Math.abs(xn - 0.5) * 2, 2.0) -
          0.25 * yn * yn
        );
      },
    });
  }
}
