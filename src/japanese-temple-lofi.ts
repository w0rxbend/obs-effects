import { setEngine } from "./app/getEngine";
import { JapaneseTempleLofiScreen } from "./app/screens/JapaneseTempleLofiScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;
  await engine.init({
    background: 0x020510,
    resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  });
  await engine.navigation.showScreen(JapaneseTempleLofiScreen);
})();
