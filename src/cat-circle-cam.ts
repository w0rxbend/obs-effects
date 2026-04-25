import { setEngine } from "./app/getEngine";
import { CatCircleCamScreen } from "./app/screens/CatCircleCamScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  });
  await engine.navigation.showScreen(CatCircleCamScreen);
})();
