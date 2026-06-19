import { setEngine } from "./app/getEngine";
import { PsychedelicMarbleScreen } from "./app/screens/PsychedelicMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x15143a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(PsychedelicMarbleScreen);
})();
