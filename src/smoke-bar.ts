import { SmokeBarScreen } from "./app/screens/SmokeBarScreen";
import { createPage } from "./lib";

createPage(SmokeBarScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 70, letterbox: false },
  waitForFonts: true,
});
