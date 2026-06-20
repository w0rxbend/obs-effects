import { DataCorruptionScreen } from "./app/screens/DataCorruptionScreen";
import { createPage } from "./lib/createPage";

createPage(DataCorruptionScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
