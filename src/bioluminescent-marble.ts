import { setEngine } from "./app/getEngine";
import { BioluminescentMarbleScreen } from "./app/screens/BioluminescentMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x00070f,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });
  await engine.navigation.showScreen(BioluminescentMarbleScreen);
})();
