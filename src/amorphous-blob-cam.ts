import { AmorphousBlobCamScreen } from "./app/screens/AmorphousBlobCamScreen";
import { createPage } from "./lib";

createPage(AmorphousBlobCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
});
