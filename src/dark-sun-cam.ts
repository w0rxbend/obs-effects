import { setEngine } from "./app/getEngine";
import { DarkSunCamScreen } from "./app/screens/DarkSunCamScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
  });

  await engine.navigation.showScreen(DarkSunCamScreen);
})();
