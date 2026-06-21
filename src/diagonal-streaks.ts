import { DiagonalStreaksScreen } from "./app/screens/DiagonalStreaksScreen";
import { createPage } from "./lib";

createPage(DiagonalStreaksScreen, {
  background: 0x05060a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
