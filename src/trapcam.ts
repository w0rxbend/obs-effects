import { TrapCamScreen } from "./app/screens/TrapCamScreen";
import { createPage } from "./lib/createPage";

createPage(TrapCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
