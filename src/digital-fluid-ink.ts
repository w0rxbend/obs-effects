import { DigitalFluidInkScreen } from "./app/screens/DigitalFluidInkScreen";
import { createPage } from "./lib/createPage";

createPage(DigitalFluidInkScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
