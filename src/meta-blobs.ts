import { MetaBlobsScreen } from "./app/screens/MetaBlobsScreen";
import { createPage } from "./lib/createPage";

createPage(MetaBlobsScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
