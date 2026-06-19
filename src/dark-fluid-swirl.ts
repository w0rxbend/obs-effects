import { setEngine } from "./app/getEngine";
import { DarkFluidSwirlScreen } from "./app/screens/DarkFluidSwirlScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x12141e,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(DarkFluidSwirlScreen);
})();
