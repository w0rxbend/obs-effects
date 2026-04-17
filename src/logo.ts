import { setEngine } from "./app/getEngine";
import { LogoScreen } from "./app/screens/LogoScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  // Block until all declared fonts are downloaded and ready.
  // This prevents OBS from rendering the first frame with a fallback font
  // before the Google Fonts stylesheet has finished loading.
  await Promise.all([
    document.fonts.load("400 1em 'Silkscreen'"),
    document.fonts.load("700 1em 'Silkscreen'"),
  ]);
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  });

  await engine.navigation.showScreen(LogoScreen);
})();
