import { WavyCamScreen } from "./app/screens/WavyCamScreen";
import { createPage } from "./lib";

createPage(WavyCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
