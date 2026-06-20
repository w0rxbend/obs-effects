import { CrystalCamScreen } from "./app/screens/CrystalCamScreen";
import { createPage } from "./lib/createPage";

createPage(CrystalCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
