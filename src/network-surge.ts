import { setEngine } from "./app/getEngine";
import { NetworkSurgeScreen } from "./app/screens/NetworkSurgeScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x05080f,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(NetworkSurgeScreen);
})();
