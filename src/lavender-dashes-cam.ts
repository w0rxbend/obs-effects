import { LavenderDashesCamScreen } from "./app/screens/LavenderDashesCamScreen";
import { createPage } from "./lib";

createPage(LavenderDashesCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
});
