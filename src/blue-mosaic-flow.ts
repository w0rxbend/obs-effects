import { setEngine } from "./app/getEngine";
import { BlueMosaicFlowScreen } from "./app/screens/BlueMosaicFlowScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x04111a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(BlueMosaicFlowScreen);
})();
