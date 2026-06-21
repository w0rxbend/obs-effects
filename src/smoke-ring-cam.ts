import { SmokeRingCamScreen } from "./app/screens/SmokeRingCamScreen";
import { createPage } from "./lib";

createPage(SmokeRingCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 800, minHeight: 800, letterbox: false },
  waitForFonts: true,
});
