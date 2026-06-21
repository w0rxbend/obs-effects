import { BackgroundScreen } from "./app/screens/BackgroundScreen";
import { createPage } from "./lib";

createPage(BackgroundScreen, {
  background: 0x11111b,
  fonts: ["1em 'SymbolsNF'", "500 1em 'SymbolsNF'"],
});
