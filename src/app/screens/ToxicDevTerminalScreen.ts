import { GlitchTerminalBase } from "./GlitchTerminalBase";
import { DEV_ICON_SYMBOLS } from "./devIconSymbols";

export class ToxicDevTerminalScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#39ff14",
      fgDim: "#118c10",
      bg: "#000700",
      blockColor: "#24ff00",
      heavy: DEV_ICON_SYMBOLS,
      light: DEV_ICON_SYMBOLS.slice(0, 15),
      cell: 18,
      font: "16px SymbolsNF",
      churnRate: 0.03,
      maxBlocks: 12,
      glitchInterval: [42, 130],
      blockAlpha: 0.68,
      sparkColor: "#b7ff9d",
      densityField: (xn, yn) => {
        const centerFalloff = Math.pow(Math.abs(xn - 0.5) * 2, 1.35);
        return (
          0.66 +
          0.24 * Math.sin(xn * 8.6 + yn * 5.7) +
          0.13 * Math.sin(xn * 19.1 - yn * 12.4) +
          0.08 * Math.cos(xn * 4.8 + yn * 3.9) -
          0.22 * centerFalloff -
          0.08 * yn
        );
      },
    });
  }
}
