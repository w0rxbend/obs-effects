import { setEngine } from "./app/getEngine";
import { BlueprintGlobeScreen } from "./app/screens/BlueprintGlobeScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x030912,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(BlueprintGlobeScreen);
})();
