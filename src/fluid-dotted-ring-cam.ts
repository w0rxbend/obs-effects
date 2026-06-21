import { FluidDottedRingCamScreen } from "./app/screens/FluidDottedRingCamScreen";
import { createPage } from "./lib";

createPage(FluidDottedRingCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
