import { RazerAudioCamBorderScreen } from "./app/screens/RazerAudioCamBorderScreen";
import { createPage } from "./lib";

createPage(RazerAudioCamBorderScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
