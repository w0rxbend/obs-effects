import { ScreenCaptureBorderScreen } from "./app/screens/ScreenCaptureBorderScreen";
import { createPage } from "./lib/createPage";

createPage(ScreenCaptureBorderScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
