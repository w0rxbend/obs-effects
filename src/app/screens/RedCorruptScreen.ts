import { GlitchTerminalBase } from "./GlitchTerminalBase";

export class RedCorruptScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#ff2200",
      fgDim: "#770000",
      bg: "#080000",
      blockColor: "#ff1100",
      heavy: ["█", "▓", "▒", "░", "×", "⊗", "✕", "X", "■", "▪"],
      light: ["▒", "░", "x", "+", "-", "·", "▫"],
      cell: 14,
      font: "14px 'Courier New', monospace",
      churnRate: 0.04,
      maxBlocks: 20, // more aggressive block corruption
      glitchInterval: [15, 70], // high-frequency glitch
      blockAlpha: 1.0,
      densityField: (xn, yn) => {
        // Near-uniform heavy coverage — corrupted data everywhere
        return (
          0.72 +
          0.2 * Math.sin(xn * 8.5 + yn * 7.1) +
          0.1 * Math.sin(xn * 20.1 - yn * 14.3) +
          0.06 * Math.cos(xn * 5.2 - yn * 6.7)
        );
      },
    });
  }
}
