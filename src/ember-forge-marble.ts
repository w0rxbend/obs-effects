import { setEngine } from "./app/getEngine";
import { EmberForgeMarbleScreen } from "./app/screens/EmberForgeMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x0f0804,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });
  await engine.navigation.showScreen(EmberForgeMarbleScreen);
})();
