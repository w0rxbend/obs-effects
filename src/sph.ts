import { SPHScreen } from "./app/screens/SPHScreen";
import { createPage } from "./lib";

createPage(SPHScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
