import { HypeMeterCamScreen } from "./app/screens/HypeMeterCamScreen";
import { createPage } from "./lib/createPage";

createPage(HypeMeterCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
});
