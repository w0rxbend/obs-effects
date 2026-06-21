import { TriangulationScreen } from "./app/screens/TriangulationScreen";
import { createPage } from "./lib";

createPage(TriangulationScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
