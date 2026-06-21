import { VoidImplodeScreen } from "./app/screens/VoidImplodeScreen";
import { createPage } from "./lib";

createPage(VoidImplodeScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
