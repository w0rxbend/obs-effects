import { setEngine } from "./app/getEngine";
import { MyceliumNetworkScreen } from "./app/screens/MyceliumNetworkScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x050810,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(MyceliumNetworkScreen);
})();
