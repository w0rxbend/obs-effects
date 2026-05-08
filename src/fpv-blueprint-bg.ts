import { setEngine } from "./app/getEngine";
import { FpvBlueprintBgScreen } from "./app/screens/FpvBlueprintBgScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x050d1a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(FpvBlueprintBgScreen);
})();
