import { ParticleConstellationScreen } from "./app/screens/ParticleConstellationScreen";
import { createPage } from "./lib";

createPage(ParticleConstellationScreen, {
  background: 0x03050f,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
