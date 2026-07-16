import { GlitchTerminalBase } from "./GlitchTerminalBase";
import { DEV_ICON_SYMBOLS } from "./devIconSymbols";

// Calm, low-motion toxic-green terminal backdrop for coding/dev streams —
// slower churn and dimmer glyphs than the data-stream variant so it stays
// readable behind an editor or terminal window for long stretches.
export class RazerBgCodingScreen extends GlitchTerminalBase {
  constructor() {
    super({
      fg: "#2edb63",
      fgDim: "#0a3a1c",
      bg: "#000502",
      blockColor: "#17a83f",
      heavy: DEV_ICON_SYMBOLS,
      light: DEV_ICON_SYMBOLS.slice(0, 10),
      cell: 19,
      font: "15px SymbolsNF",
      churnRate: 0.018,
      maxBlocks: 3,
      glitchInterval: [90, 220],
      blockAlpha: 0.34,
      sparkColor: "#8bffb0",
      densityField: (xn, yn) => {
        return (
          0.42 +
          0.1 * Math.sin(xn * 6.2 + yn * 1.4) -
          0.22 * Math.pow(Math.abs(yn - 0.5) * 2, 2.0)
        );
      },
    });
  }
}
