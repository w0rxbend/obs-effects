import { TunnelVortexScreen } from "./app/screens/TunnelVortexScreen";
import { createPage } from "./lib";

createPage(TunnelVortexScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
