import { BioluminescentMarbleScreen } from "./app/screens/BioluminescentMarbleScreen";
import { createPage } from "./lib";

createPage(BioluminescentMarbleScreen, {
  background: 0x00070f,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
