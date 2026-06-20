import { FourierEpicyclesScreen } from "./app/screens/FourierEpicyclesScreen";
import { createPage } from "./lib/createPage";

createPage(FourierEpicyclesScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
