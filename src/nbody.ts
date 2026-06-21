import { NBodyScreen } from "./app/screens/NBodyScreen";
import { createPage } from "./lib";

createPage(NBodyScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
