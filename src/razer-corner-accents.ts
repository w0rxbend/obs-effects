import { RazerCornerAccentsScreen } from "./app/screens/RazerCornerAccentsScreen";
import { createPage } from "./lib";

createPage(RazerCornerAccentsScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
