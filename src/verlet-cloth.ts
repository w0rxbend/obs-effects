import { VerletClothScreen } from "./app/screens/VerletClothScreen";
import { createPage } from "./lib";

createPage(VerletClothScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
