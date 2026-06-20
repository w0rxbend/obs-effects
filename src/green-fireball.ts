import { GreenFireballScreen } from "./app/screens/GreenFireballScreen";
import { createPage } from "./lib/createPage";

createPage(GreenFireballScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
