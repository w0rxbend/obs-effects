import { AudioNeuralNetScreen } from "./app/screens/AudioNeuralNetScreen";
import { createPage } from "./lib/createPage";

createPage(AudioNeuralNetScreen, {
  background: 0x030810,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
