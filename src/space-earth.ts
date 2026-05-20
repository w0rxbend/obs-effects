import { setEngine } from "./app/getEngine";
import { SpaceEarthScreen } from "./app/screens/SpaceEarthScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: 0x02040d,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(SpaceEarthScreen);
})();
