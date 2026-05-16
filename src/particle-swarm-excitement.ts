import { setEngine } from "./app/getEngine";
import { ParticleSwarmExcitementScreen } from "./app/screens/ParticleSwarmExcitementScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x05070d,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(ParticleSwarmExcitementScreen);
})();
