import { setEngine } from "./app/getEngine";
import { ParticleConstellationScreen } from "./app/screens/ParticleConstellationScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x03050f,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(ParticleConstellationScreen);
})();
