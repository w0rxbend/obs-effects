import { AudioWaveformScreen } from "./app/screens/AudioWaveformScreen";
import { createPage } from "./lib";

createPage(AudioWaveformScreen, {
  backgroundAlpha: 0,
  antialias: true,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
