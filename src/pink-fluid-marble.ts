import { setEngine } from "./app/getEngine";
import { PinkFluidMarbleScreen } from "./app/screens/PinkFluidMarbleScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x171a2a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(PinkFluidMarbleScreen);
})();
