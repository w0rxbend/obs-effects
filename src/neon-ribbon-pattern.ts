import { setEngine } from "./app/getEngine";
import { NeonRibbonPatternScreen } from "./app/screens/NeonRibbonPatternScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x03050b,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(NeonRibbonPatternScreen);
})();
