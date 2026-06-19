import { setEngine } from "./app/getEngine";
import { MagentaDotFlowScreen } from "./app/screens/MagentaDotFlowScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x1a1a1a,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(MagentaDotFlowScreen);
})();
