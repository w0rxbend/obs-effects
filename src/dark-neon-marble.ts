import { setEngine } from "./app/getEngine";
import { DarkNeonMarbleScreen } from "./app/screens/DarkNeonMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x0d0e25,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(DarkNeonMarbleScreen);
})();
