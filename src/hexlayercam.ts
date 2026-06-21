import { HexLayerCamScreen } from "./app/screens/HexLayerCamScreen";
import { createPage } from "./lib";

createPage(HexLayerCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
