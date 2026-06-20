import { setEngine } from "./app/getEngine";
import { TealRedMarbleScreen } from "./app/screens/TealRedMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x0a0e0e,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(TealRedMarbleScreen);
})();
