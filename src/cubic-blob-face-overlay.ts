import { CubicBlobFaceOverlayScreen } from "./app/screens/CubicBlobFaceOverlayScreen";
import { createPage } from "./lib/createPage";

createPage(CubicBlobFaceOverlayScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
