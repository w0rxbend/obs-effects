import { ParticleGlobeScreen } from "./app/screens/ParticleGlobeScreen";
import { createPage } from "./lib";

createPage(ParticleGlobeScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
