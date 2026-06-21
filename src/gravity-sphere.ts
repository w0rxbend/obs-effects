import { GravitySphereScreen } from "./app/screens/GravitySphereScreen";
import { createPage } from "./lib";

createPage(GravitySphereScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
