import { GlitchCircleRingCamScreen } from "./app/screens/GlitchCircleRingCamScreen";
import { createPage } from "./lib/createPage";

createPage(GlitchCircleRingCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
