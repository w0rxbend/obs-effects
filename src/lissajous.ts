import { LissajousScreen } from "./app/screens/LissajousScreen";
import { createPage } from "./lib/createPage";

createPage(LissajousScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
