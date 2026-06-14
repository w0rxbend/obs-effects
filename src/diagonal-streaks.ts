import { setEngine } from "./app/getEngine";
import { DiagonalStreaksScreen } from "./app/screens/DiagonalStreaksScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x05060a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(DiagonalStreaksScreen);
})();
