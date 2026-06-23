import { GlitchTerminalBase } from "./GlitchTerminalBase";
import { DEV_ICON_SYMBOLS } from "./devIconSymbols";

export class ToxicDevDataStreamScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#39ff14",
      fgDim: "#0d7410",
      bg: "#000800",
      blockColor: "#20dd00",
      heavy: DEV_ICON_SYMBOLS,
      light: DEV_ICON_SYMBOLS.slice(0, 14),
      cell: 17,
      font: "16px SymbolsNF",
      churnRate: 0.052,
      maxBlocks: 8,
      glitchInterval: [25, 90],
      blockAlpha: 0.58,
      sparkColor: "#b7ff9d",
      densityField: (xn, yn) => {
        return (
          0.72 +
          0.18 * Math.sin(xn * 12.7 + yn * 3.1) +
          0.1 * Math.sin(xn * 22.3 - yn * 8.5) -
          0.12 * Math.pow(Math.abs(xn - 0.5) * 2, 2.0) -
          0.25 * yn * yn
        );
      },
    });
  }
}
