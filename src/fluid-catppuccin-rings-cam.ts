import { FluidCatppuccinRingsCamScreen } from "./app/screens/FluidCatppuccinRingsCamScreen";
import { createPage } from "./lib";

createPage(FluidCatppuccinRingsCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
