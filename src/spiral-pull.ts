import { SpiralPullScreen } from "./app/screens/SpiralPullScreen";
import { createPage } from "./lib";

createPage(SpiralPullScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
