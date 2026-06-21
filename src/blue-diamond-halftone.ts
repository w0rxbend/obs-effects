import { BlueDiamondHalftoneScreen } from "./app/screens/BlueDiamondHalftoneScreen";
import { createPage } from "./lib";

createPage(BlueDiamondHalftoneScreen, {
  background: 0x040609,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
