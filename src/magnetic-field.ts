import { MagneticFieldScreen } from "./app/screens/MagneticFieldScreen";
import { createPage } from "./lib/createPage";

createPage(MagneticFieldScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
