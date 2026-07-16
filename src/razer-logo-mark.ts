import { RazerLogoMarkScreen } from "./app/screens/RazerLogoMarkScreen";
import { createPage } from "./lib";

createPage(RazerLogoMarkScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
