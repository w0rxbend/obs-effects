import { ColorWaveRibbonsScreen } from "./app/screens/ColorWaveRibbonsScreen";
import { createPage } from "./lib";

createPage(ColorWaveRibbonsScreen, {
  background: 0xfbe1d1,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
