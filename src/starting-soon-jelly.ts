import { setEngine } from "./app/getEngine";
import { StartingSoonJellyScreen } from "./app/screens/StartingSoonJellyScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.load("400 1em 'Bangers'");
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(StartingSoonJellyScreen);
})();
