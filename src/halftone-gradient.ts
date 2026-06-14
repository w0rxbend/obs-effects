import { setEngine } from "./app/getEngine";
import { HalftoneGradientScreen } from "./app/screens/HalftoneGradientScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x2a0a3a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(HalftoneGradientScreen);
})();
