import { setEngine } from "./app/getEngine";
import { MatrixDotsScreen } from "./app/screens/MatrixDotsScreen";
import { CreationEngine } from "./engine/engine";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await document.fonts.ready;

  await engine.init({
    background: "#11111b",
    resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  });

  await engine.navigation.showScreen(MatrixDotsScreen);
})();
