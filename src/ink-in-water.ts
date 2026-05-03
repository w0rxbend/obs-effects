import { setEngine } from "./app/getEngine";
import { InkInWaterScreen } from "./app/screens/InkInWaterScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x020108,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(InkInWaterScreen);
})();
