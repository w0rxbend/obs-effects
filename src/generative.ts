import { GenerativeScreen } from "./app/screens/GenerativeScreen";
import { createPage } from "./lib";

createPage(GenerativeScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
  waitForFonts: true,
});
