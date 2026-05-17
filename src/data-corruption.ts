import { setEngine } from "./app/getEngine";
import { DataCorruptionScreen } from "./app/screens/DataCorruptionScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(DataCorruptionScreen);
})();
