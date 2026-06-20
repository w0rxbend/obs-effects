import { LiquidPaperFrameScreen } from "./app/screens/LiquidPaperFrameScreen";
import { createPage } from "./lib/createPage";

createPage(LiquidPaperFrameScreen, {
  background: 0xfdfbf7,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
