import { setEngine } from "./app/getEngine";
import { DistributedSystemsScreen } from "./app/screens/DistributedSystemsScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x05090f,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(DistributedSystemsScreen);
})();
