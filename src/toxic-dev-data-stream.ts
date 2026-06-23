import { ToxicDevDataStreamScreen } from "./app/screens/ToxicDevDataStreamScreen";
import { createPage } from "./lib";

createPage(ToxicDevDataStreamScreen, {
  background: 0x000800,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  fonts: ["16px SymbolsNF"],
});
