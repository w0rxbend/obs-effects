import { GraphBgScreen } from "./app/screens/GraphBgScreen";
import { createPage } from "./lib";

createPage(GraphBgScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
