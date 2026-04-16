import { setEngine } from "./app/getEngine";
import { Placeholder1Screen } from "./app/screens/Placeholder1Screen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(Placeholder1Screen);
})();
