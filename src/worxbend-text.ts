import { setEngine } from "./app/getEngine";
import { WorxbendTextScreen } from "./app/screens/WorxbendTextScreen";
import { CreationEngine } from "./engine/engine";

const eng = new CreationEngine();
setEngine(eng);

(async () => {
  // Ensure the font is loaded as it's used for sampling
  await document.fonts.load("bold 100px Silkscreen");
  await document.fonts.ready;

  await eng.init({
    background: 0x11111b, // Catppuccin Mocha Crust
    resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
  });

  await eng.navigation.showScreen(WorxbendTextScreen);
})();
