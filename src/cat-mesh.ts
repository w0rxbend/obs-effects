import { CatMeshScreen } from "./app/screens/CatMeshScreen";
import { createPage } from "./lib/createPage";

createPage(CatMeshScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
