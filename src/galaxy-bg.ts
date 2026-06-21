import { GalaxyBgScreen } from "./app/screens/GalaxyBgScreen";
import { createPage } from "./lib";

createPage(GalaxyBgScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  waitForFonts: true,
});
