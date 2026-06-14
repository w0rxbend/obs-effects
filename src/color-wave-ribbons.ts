import { setEngine } from "./app/getEngine";
import { ColorWaveRibbonsScreen } from "./app/screens/ColorWaveRibbonsScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0xfbe1d1,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(ColorWaveRibbonsScreen);
})();
