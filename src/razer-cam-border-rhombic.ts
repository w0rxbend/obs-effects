import { RazerCamBorderRhombicScreen } from "./app/screens/RazerCamBorderRhombicScreen";
import { createPage } from "./lib";

createPage(RazerCamBorderRhombicScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
