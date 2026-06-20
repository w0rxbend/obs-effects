import { setEngine } from "./app/getEngine";
import { GoldenDotFieldScreen } from "./app/screens/GoldenDotFieldScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x0f1932,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(GoldenDotFieldScreen);
})();
