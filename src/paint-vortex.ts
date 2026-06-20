import { PaintVortexScreen } from "./app/screens/PaintVortexScreen";
import { createPage } from "./lib/createPage";

createPage(PaintVortexScreen, {
  background: 0x0d0c38,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
