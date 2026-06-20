import { setEngine } from "./app/getEngine";
import { BlueDiamondHalftoneScreen } from "./app/screens/BlueDiamondHalftoneScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x040609,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(BlueDiamondHalftoneScreen);
})();
