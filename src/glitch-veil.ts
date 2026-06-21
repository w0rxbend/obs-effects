import { GlitchVeilScreen } from "./app/screens/GlitchVeilScreen";
import { createPage } from "./lib";

createPage(GlitchVeilScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
