import { setEngine } from "./app/getEngine";
import { GoldMarbleDotsScreen } from "./app/screens/GoldMarbleDotsScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x000000,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(GoldMarbleDotsScreen);
})();
