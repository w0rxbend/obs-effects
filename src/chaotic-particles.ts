import { ChaoticParticlesScreen } from "./app/screens/ChaoticParticlesScreen";
import { createPage } from "./lib";

createPage(ChaoticParticlesScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
