import { RazerAudioWaveformScreen } from "./app/screens/AudioWaveformScreen";
import { createPage } from "./lib";

createPage(RazerAudioWaveformScreen, {
  backgroundAlpha: 0,
  antialias: true,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
