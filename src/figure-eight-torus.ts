import { FigureEightTorusScreen } from "./app/screens/FigureEightTorusScreen";
import { createPage } from "./lib";

createPage(FigureEightTorusScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
