import { CatppuccinLinuxOverlayScreen } from "./app/screens/CatppuccinLinuxOverlayScreen";
import { createPage } from "./lib/createPage";

createPage(CatppuccinLinuxOverlayScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
