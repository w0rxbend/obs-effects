import { setEngine } from "./app/getEngine";
import { FluidBlobFrameScreen } from "./app/screens/FluidBlobFrameScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x2c2e44,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(FluidBlobFrameScreen);
})();
