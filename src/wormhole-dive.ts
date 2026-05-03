import { setEngine } from "./app/getEngine";
import { WormholeDiveScreen } from "./app/screens/WormholeDiveScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x000000,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(WormholeDiveScreen);
})();
