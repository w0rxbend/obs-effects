import { HalftoneGradientScreen } from "./app/screens/HalftoneGradientScreen";
import { createPage } from "./lib/createPage";

createPage(HalftoneGradientScreen, {
  background: 0x2a0a3a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
