import { setEngine } from "./app/getEngine";
import { CyanDataStreamScreen } from "./app/screens/CyanDataStreamScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x00080a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(CyanDataStreamScreen);
})();
