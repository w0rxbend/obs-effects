import { BlueLiquidMarbleScreen } from "./app/screens/BlueLiquidMarbleScreen";
import { createPage } from "./lib";

createPage(BlueLiquidMarbleScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
