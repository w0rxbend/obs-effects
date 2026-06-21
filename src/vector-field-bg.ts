import { VectorFieldBgScreen } from "./app/screens/VectorFieldBgScreen";
import { createPage } from "./lib";

createPage(VectorFieldBgScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
