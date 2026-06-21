import { AccretionDiskCamScreen } from "./app/screens/AccretionDiskCamScreen";
import { createPage } from "./lib";

createPage(AccretionDiskCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
