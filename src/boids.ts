import { BoidsScreen } from "./app/screens/BoidsScreen";
import { createPage } from "./lib";

createPage(BoidsScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
