import { setEngine } from "./app/getEngine";
import { FluidPaintScreen } from "./app/screens/FluidPaintScreen";
import { CreationEngine } from "./engine/engine";

const eng = new CreationEngine();
setEngine(eng);

(async () => {
  await eng.init({
    background: 0x11111b, // Catppuccin Crust
    backgroundAlpha: 1,
    resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
  });

  await eng.navigation.showScreen(FluidPaintScreen);
})();
