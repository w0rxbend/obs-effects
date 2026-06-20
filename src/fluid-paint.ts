import { FluidPaintScreen } from "./app/screens/FluidPaintScreen";
import { createPage } from "./lib/createPage";

createPage(FluidPaintScreen, {
  background: 0x11111b,
  backgroundAlpha: 1,
  resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
});
