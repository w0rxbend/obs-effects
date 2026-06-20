import { InkInWaterScreen } from "./app/screens/InkInWaterScreen";
import { createPage } from "./lib/createPage";

createPage(InkInWaterScreen, {
  background: 0x020108,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
