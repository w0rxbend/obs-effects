import { BioluminescentCellScreen } from "./app/screens/BioluminescentCellScreen";
import { createPage } from "./lib";

createPage(BioluminescentCellScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
