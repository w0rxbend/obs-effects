import { CamFrameOverlayScreen } from "./app/screens/CamFrameOverlayScreen";
import { createPage } from "./lib";

createPage(CamFrameOverlayScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 800, minHeight: 800, letterbox: false },
  waitForFonts: true,
});
