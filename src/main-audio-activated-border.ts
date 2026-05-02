import { setEngine } from "./app/getEngine";
import { AudioActivatedCameraScreen } from "./app/screens/AudioActivatedCameraScreen";
import { CreationEngine } from "./engine/engine";

import "@esotericsoftware/spine-pixi-v8";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await Promise.all([
    document.fonts.load("1em 'Silkscreen'"),
    document.fonts.load("1em 'Rock Salt'"),
    document.fonts.load("1em 'SymbolsNF'"),
  ]);

  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 768, minHeight: 1024, letterbox: false },
  });

  await engine.navigation.showScreen(AudioActivatedCameraScreen);
})();
