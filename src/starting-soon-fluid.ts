import { StartingSoonFluidScreen } from "./app/screens/StartingSoonFluidScreen";
import { createPage } from "./lib";

createPage(StartingSoonFluidScreen, {
  background: 0x000000,
  backgroundAlpha: 1,
  fonts: ["bold 100px Silkscreen"],
  resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
});
