import { ToxicDevTerminalScreen } from "./app/screens/ToxicDevTerminalScreen";
import { createPage } from "./lib";

createPage(ToxicDevTerminalScreen, {
  background: 0x000700,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  fonts: ["16px SymbolsNF"],
});
