import { TuxBlobScreen } from "./app/screens/TuxBlobScreen";
import { createPage } from "./lib";

createPage(TuxBlobScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
