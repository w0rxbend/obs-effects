import { RazerWaveformEqualizerScreen } from "./app/screens/RazerWaveformVariationsScreen";
import { createPage } from "./lib";

createPage(RazerWaveformEqualizerScreen, {
  backgroundAlpha: 0,
  antialias: true,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
