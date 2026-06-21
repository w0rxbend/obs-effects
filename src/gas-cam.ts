import { GasCamScreen } from "./app/screens/GasCamScreen";
import { createPage } from "./lib";

createPage(GasCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
