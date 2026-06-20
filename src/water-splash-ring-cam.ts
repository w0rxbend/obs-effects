import { WaterSplashRingCamScreen } from "./app/screens/WaterSplashRingCamScreen";
import { createPage } from "./lib/createPage";

createPage(WaterSplashRingCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
