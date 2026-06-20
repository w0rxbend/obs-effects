import { setEngine } from "./app/getEngine";
import { AmethystMarbleScreen } from "./app/screens/AmethystMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x0c0719,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });
  await engine.navigation.showScreen(AmethystMarbleScreen);
})();
