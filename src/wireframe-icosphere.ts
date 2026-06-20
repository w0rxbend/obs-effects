import { WireframeIcosphereScreen } from "./app/screens/WireframeIcosphereScreen";
import { createPage } from "./lib/createPage";

createPage(WireframeIcosphereScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
