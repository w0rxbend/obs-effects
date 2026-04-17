import { setEngine } from "./app/getEngine";
import { MusicBreakScreen } from "./app/screens/MusicBreakScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await Promise.all([
    document.fonts.load("1em 'Rock Salt'"),
    document.fonts.load("400 1em 'Silkscreen'"),
    document.fonts.load("700 1em 'Silkscreen'"),
  ]);
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  await engine.navigation.showScreen(MusicBreakScreen);
})();
