import { NeonTopoScreen } from "./app/screens/NeonTopoScreen";
import { createPage } from "./lib";

createPage(NeonTopoScreen, {
  background: 0x050005,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
