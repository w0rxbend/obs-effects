import { setEngine } from "./app/getEngine";
import { AmberTerminalScreen } from "./app/screens/AmberTerminalScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x060300,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(AmberTerminalScreen);
})();
