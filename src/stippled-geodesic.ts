import { StippledGeodesicScreen } from "./app/screens/StippledGeodesicScreen";
import { createPage } from "./lib/createPage";

createPage(StippledGeodesicScreen, {
  background: 0x1e1e2e,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
