import { setEngine } from "./app/getEngine";
import { WorxbendMolecularScreen } from "./app/screens/WorxbendMolecularScreen";
import { CreationEngine } from "./engine/engine";

const eng = new CreationEngine();
setEngine(eng);

(async () => {
  // Ensure the font is loaded as it's used for sampling
  await document.fonts.load("bold 100px Silkscreen");
  await document.fonts.ready;

  await eng.init({
    background: 0x11111b, // Catppuccin Mocha Crust
    backgroundAlpha: 0, // Transparent for OBS overlay
    resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
  });

  await eng.navigation.showScreen(WorxbendMolecularScreen);
})();
