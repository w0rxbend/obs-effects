import { MinimalistGradientBreathingScreen } from "./app/screens/MinimalistGradientBreathingScreen";
import { createPage } from "./lib/createPage";

createPage(MinimalistGradientBreathingScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
