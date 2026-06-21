import { GlitchApeScreen } from "./app/screens/GlitchApeScreen";
import { createPage } from "./lib";

createPage(GlitchApeScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
