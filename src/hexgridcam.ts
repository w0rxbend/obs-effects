import { HexGridCamScreen } from "./app/screens/HexGridCamScreen";
import { createPage } from "./lib/createPage";

createPage(HexGridCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
