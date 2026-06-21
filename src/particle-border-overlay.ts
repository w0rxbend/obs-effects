import { ParticleBorderOverlayScreen } from "./app/screens/ParticleBorderOverlayScreen";
import { createPage } from "./lib";

createPage(ParticleBorderOverlayScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
