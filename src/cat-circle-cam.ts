import { CatCircleCamScreen } from "./app/screens/CatCircleCamScreen";
import { createPage } from "./lib";

createPage(CatCircleCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
