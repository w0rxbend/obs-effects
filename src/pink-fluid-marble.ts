import { PinkFluidMarbleScreen } from "./app/screens/PinkFluidMarbleScreen";
import { createPage } from "./lib";

createPage(PinkFluidMarbleScreen, {
  background: 0x171a2a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
