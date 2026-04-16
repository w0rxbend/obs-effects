import { setEngine } from "./app/getEngine";
import { CameraScreen } from "./app/screens/CameraScreen";
import { CreationEngine } from "./engine/engine";

/**
 * Register Spine extension — spine-pixi-v8 is ready to render .skel + .atlas
 * assets once skeleton data is exported from the Spine editor.
 */
import "@esotericsoftware/spine-pixi-v8";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;

  await engine.init({
    background: "transparent",
    backgroundAlpha: 0,
    resizeOptions: { minWidth: 768, minHeight: 1024, letterbox: false },
  });

  await engine.navigation.showScreen(CameraScreen);
})();
