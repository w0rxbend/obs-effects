import { DarkNeonMarbleScreen } from "./app/screens/DarkNeonMarbleScreen";
import { createPage } from "./lib/createPage";

createPage(DarkNeonMarbleScreen, {
  background: 0x0d0e25,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
