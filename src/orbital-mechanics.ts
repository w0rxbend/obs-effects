import { OrbitalMechanicsScreen } from "./app/screens/OrbitalMechanicsScreen";
import { createPage } from "./lib/createPage";

createPage(OrbitalMechanicsScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
