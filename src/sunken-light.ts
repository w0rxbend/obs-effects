import { setEngine } from "./app/getEngine";
import { SunkenLightScreen } from "./app/screens/SunkenLightScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x020f17,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(SunkenLightScreen);
})();
