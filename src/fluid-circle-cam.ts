import { FluidCircleCamScreen } from "./app/screens/FluidCircleCamScreen";
import { createPage } from "./lib";

createPage(FluidCircleCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
