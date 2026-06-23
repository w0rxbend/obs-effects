import { GlitchTerminalBase } from "./GlitchTerminalBase";
import { DEV_ICON_SYMBOLS } from "./devIconSymbols";

export class ToxicDevCorruptScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#39ff14",
      fgDim: "#0f7f10",
      bg: "#000500",
      blockColor: "#1fff00",
      heavy: DEV_ICON_SYMBOLS,
      light: DEV_ICON_SYMBOLS.slice(0, 18),
      cell: 17,
      font: "16px SymbolsNF",
      churnRate: 0.045,
      maxBlocks: 20,
      glitchInterval: [15, 70],
      blockAlpha: 0.92,
      sparkColor: "#9cff70",
      densityField: (xn, yn) => {
        return (
          0.76 +
          0.2 * Math.sin(xn * 8.5 + yn * 7.1) +
          0.1 * Math.sin(xn * 20.1 - yn * 14.3) +
          0.06 * Math.cos(xn * 5.2 - yn * 6.7)
        );
      },
    });
  }
}
