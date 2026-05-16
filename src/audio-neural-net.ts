import { setEngine } from "./app/getEngine";
import { AudioNeuralNetScreen } from "./app/screens/AudioNeuralNetScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x030810,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(AudioNeuralNetScreen);
})();
