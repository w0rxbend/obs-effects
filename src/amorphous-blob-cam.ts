import { setEngine } from "./app/getEngine";
import { AmorphousBlobCamScreen } from "./app/screens/AmorphousBlobCamScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
  });

  await engine.navigation.showScreen(AmorphousBlobCamScreen);
})();
