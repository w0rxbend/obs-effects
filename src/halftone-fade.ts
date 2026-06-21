import { HalftoneFadeScreen } from "./app/screens/HalftoneFadeScreen";
import { createPage } from "./lib";

createPage(HalftoneFadeScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
