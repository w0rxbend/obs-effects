import { setEngine } from "./app/getEngine";
import { WavyCamScreen } from "./app/screens/WavyCamScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  });
  await engine.navigation.showScreen(WavyCamScreen);
})();
