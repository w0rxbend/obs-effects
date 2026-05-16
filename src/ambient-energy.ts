import { setEngine } from "./app/getEngine";
import { AmbientEnergyScreen } from "./app/screens/AmbientEnergyScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x060810,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });
  await engine.navigation.showScreen(AmbientEnergyScreen);
})();
