import { RazerScreenShareBorderScreen } from "./app/screens/RazerScreenShareBorderScreen";
import { createPage } from "./lib";

createPage(RazerScreenShareBorderScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
