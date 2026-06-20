import { WireframeSphereCamScreen } from "./app/screens/WireframeSphereCamScreen";
import { createPage } from "./lib/createPage";

createPage(WireframeSphereCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
