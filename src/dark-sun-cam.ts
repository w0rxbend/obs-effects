import { DarkSunCamScreen } from "./app/screens/DarkSunCamScreen";
import { createPage } from "./lib";

createPage(DarkSunCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
});
