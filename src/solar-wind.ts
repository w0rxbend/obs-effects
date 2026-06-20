import { SolarWindScreen } from "./app/screens/SolarWindScreen";
import { createPage } from "./lib/createPage";

createPage(SolarWindScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
