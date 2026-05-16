import { setEngine } from "./app/getEngine";
import { WaveSimulationScreen } from "./app/screens/WaveSimulationScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x050a14,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });
  await engine.navigation.showScreen(WaveSimulationScreen);
})();
