import { setEngine } from "./app/getEngine";
import { ElasticRingsScreen } from "./app/screens/ElasticRingsScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;

  await engine.init({
    background:      "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 800, minHeight: 800, letterbox: false },
  });

  await engine.navigation.showScreen(ElasticRingsScreen);
})();
