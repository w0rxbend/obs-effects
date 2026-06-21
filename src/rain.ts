import { RainScreen } from "./app/screens/RainScreen";
import { createPage } from "./lib";

createPage(RainScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
