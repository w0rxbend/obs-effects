import { WaveCamScreen } from "./app/screens/WaveCamScreen";
import { createPage } from "./lib/createPage";

createPage(WaveCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
