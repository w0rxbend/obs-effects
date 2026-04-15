import { setEngine } from "./app/getEngine";
import { BackgroundScreen } from "./app/screens/BackgroundScreen";
import { CreationEngine } from "./engine/engine";

const CATPPUCCIN_CRUST = 0x11111b;

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: CATPPUCCIN_CRUST,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(BackgroundScreen);
})();
