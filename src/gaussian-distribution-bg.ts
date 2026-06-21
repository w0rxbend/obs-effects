import { GaussianDistributionBgScreen } from "./app/screens/GaussianDistributionBgScreen";
import { createPage } from "./lib";

createPage(GaussianDistributionBgScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
