import { FireballScreen } from "./app/screens/FireballScreen";
import { createPage } from "./lib/createPage";

createPage(FireballScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
