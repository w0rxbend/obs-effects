import { RazerHalftoneFadeScreen } from "./app/screens/RazerHalftoneFadeScreen";
import { createPage } from "./lib";

createPage(RazerHalftoneFadeScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
