import { ParticleSwarmExcitementScreen } from "./app/screens/ParticleSwarmExcitementScreen";
import { createPage } from "./lib/createPage";

createPage(ParticleSwarmExcitementScreen, {
  background: 0x05070d,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
