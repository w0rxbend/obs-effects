import { GeodesicSphereScreen } from "./app/screens/GeodesicSphereScreen";
import { createPage } from "./lib/createPage";

createPage(GeodesicSphereScreen, {
  background: 0x1e1e2e,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
