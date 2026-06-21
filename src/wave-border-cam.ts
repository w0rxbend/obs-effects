import { WaveBorderCamScreen } from "./app/screens/WaveBorderCamScreen";
import { createPage } from "./lib";

createPage(WaveBorderCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
  waitForFonts: true,
});
