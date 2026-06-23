import { ToxicDevCorruptScreen } from "./app/screens/ToxicDevCorruptScreen";
import { createPage } from "./lib";

createPage(ToxicDevCorruptScreen, {
  background: 0x000500,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  fonts: ["16px SymbolsNF"],
});
