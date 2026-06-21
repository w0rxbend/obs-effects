import { CollatzScreen } from "./app/screens/CollatzScreen";
import { createPage } from "./lib";

createPage(CollatzScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
