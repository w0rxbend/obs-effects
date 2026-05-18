import { setEngine } from "./app/getEngine";
import { RetroScreenFilterScreen } from "./app/screens/RetroScreenFilterScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    antialias: false,
    resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
  });

  await engine.navigation.showScreen(RetroScreenFilterScreen);
})();
