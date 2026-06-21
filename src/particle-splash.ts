import { ParticleSplashScreen } from "./app/screens/ParticleSplashScreen";
import { createPage } from "./lib";

createPage(ParticleSplashScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
