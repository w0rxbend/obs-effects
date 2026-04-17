import { setEngine } from "./app/getEngine";
import { TitlePowerlineScreen } from "./app/screens/TitlePowerlineScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await Promise.all([
    document.fonts.load("1em 'Bangers'"),
  ]);
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(TitlePowerlineScreen);
})();
