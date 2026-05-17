import { setEngine } from "./app/getEngine";
import { AIInferenceScreen } from "./app/screens/AIInferenceScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x020810,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(AIInferenceScreen);
})();
