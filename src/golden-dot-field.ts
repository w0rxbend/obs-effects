import { GoldenDotFieldScreen } from "./app/screens/GoldenDotFieldScreen";
import { createPage } from "./lib/createPage";

createPage(GoldenDotFieldScreen, {
  background: 0x0f1932,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
