import { ChaosAttractorScreen } from "./app/screens/ChaosAttractorScreen";
import { createPage } from "./lib/createPage";

createPage(ChaosAttractorScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
