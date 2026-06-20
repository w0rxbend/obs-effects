import { WorxbendFluidScreen } from "./app/screens/WorxbendFluidScreen";
import { createPage } from "./lib/createPage";

createPage(WorxbendFluidScreen, {
  background: 0x11111b,
  backgroundAlpha: 0,
  fonts: ["bold 100px Silkscreen"],
  resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
});
