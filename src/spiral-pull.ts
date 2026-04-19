import { setEngine } from "./app/getEngine";
import { SpiralPullScreen } from "./app/screens/SpiralPullScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;
  await engine.init({
    background: 0x11111b,
    resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  });
  await engine.navigation.showScreen(SpiralPullScreen);
})();
