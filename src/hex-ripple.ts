import { HexRippleScreen } from "./app/screens/HexRippleScreen";
import { createPage } from "./lib/createPage";

createPage(HexRippleScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
