import { setEngine } from "./app/getEngine";
import { AetherDriftScreen } from "./app/screens/AetherDriftScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x04060d,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(AetherDriftScreen);
})();
