import { AquariumScreen } from "./app/screens/AquariumScreen";
import { createPage } from "./lib/createPage";

createPage(AquariumScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
