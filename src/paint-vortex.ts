import { setEngine } from "./app/getEngine";
import { PaintVortexScreen } from "./app/screens/PaintVortexScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x0d0c38,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(PaintVortexScreen);
})();
