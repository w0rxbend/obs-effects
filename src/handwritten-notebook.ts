import { setEngine } from "./app/getEngine";
import { HandwrittenNotebookScreen } from "./app/screens/HandwrittenNotebookScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.load("400 1em 'Caveat'");
  await document.fonts.ready;

  await engine.init({
    background: 0xf5f0e3,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(HandwrittenNotebookScreen);
})();
