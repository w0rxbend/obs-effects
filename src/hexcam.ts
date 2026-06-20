import { HexCamScreen } from "./app/screens/HexCamScreen";
import { createPage } from "./lib/createPage";

createPage(HexCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
