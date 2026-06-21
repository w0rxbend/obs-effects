import { GlitchTerminalScreen } from "./app/screens/GlitchTerminalScreen";
import { createPage } from "./lib";

createPage(GlitchTerminalScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
