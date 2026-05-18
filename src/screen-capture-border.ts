import { setEngine } from "./app/getEngine";
import { ScreenCaptureBorderScreen } from "./app/screens/ScreenCaptureBorderScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
  });

  await engine.navigation.showScreen(ScreenCaptureBorderScreen);
})();
