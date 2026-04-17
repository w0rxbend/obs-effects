import { setEngine } from "./app/getEngine";
import { WaveCamScreen } from "./app/screens/WaveCamScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  });

  await engine.navigation.showScreen(WaveCamScreen);
})();
