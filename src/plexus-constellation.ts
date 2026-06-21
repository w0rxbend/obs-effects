import { PlexusConstellationScreen } from "./app/screens/PlexusConstellationScreen";
import { createPage } from "./lib";

createPage(PlexusConstellationScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
