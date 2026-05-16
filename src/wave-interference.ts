import { setEngine } from "./app/getEngine";
import { WaveInterferenceScreen } from "./app/screens/WaveInterferenceScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x000c08,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(WaveInterferenceScreen);
})();
