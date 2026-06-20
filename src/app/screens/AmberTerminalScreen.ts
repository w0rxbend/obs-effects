import { GlitchTerminalBase } from "./GlitchTerminalBase";

export class AmberTerminalScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#ffb000",
      fgDim: "#7a4800",
      bg: "#060300",
      blockColor: "#ff8800",
      heavy: ["◆", "▲", "▼", "■", "●", "◉", "⊕", "⊗", "○", "□"],
      light: ["+", "·", "-", "*", "×", "x", "o", "'", "`"],
      cell: 14,
      font: "14px 'Courier New', monospace",
      churnRate: 0.025,
      maxBlocks: 10,
      glitchInterval: [50, 160],
      blockAlpha: 0.85,
      densityField: (xn, yn) => {
        // Warmer center bias, fades toward edges
        const cx = Math.abs(xn - 0.5) * 2;
        return (
          0.6 +
          0.22 * Math.sin(xn * 7.3 + yn * 5.1) +
          0.12 * Math.sin(xn * 15.4 - yn * 10.9) +
          0.07 * Math.cos(xn * 3.8 + yn * 4.2) -
          0.25 * Math.pow(cx, 1.2) -
          0.1 * yn
        );
      },
    });
  }
}
