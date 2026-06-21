import { ShockWaveScreen } from "./app/screens/ShockWaveScreen";
import { createPage } from "./lib";

createPage(ShockWaveScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
