import { AudioReactiveDotOrbScreen } from "./app/screens/AudioReactiveDotOrbScreen";
import { createPage } from "./lib";

createPage(AudioReactiveDotOrbScreen, {
  backgroundAlpha: 0,
  antialias: true,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
