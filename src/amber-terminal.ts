import { AmberTerminalScreen } from "./app/screens/AmberTerminalScreen";
import { createPage } from "./lib/createPage";

createPage(AmberTerminalScreen, {
  background: 0x060300,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
