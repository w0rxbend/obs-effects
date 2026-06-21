import { TealRedMarbleScreen } from "./app/screens/TealRedMarbleScreen";
import { createPage } from "./lib";

createPage(TealRedMarbleScreen, {
  background: 0x0a0e0e,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
