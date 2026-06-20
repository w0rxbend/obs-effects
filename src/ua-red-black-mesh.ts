import { UaRedBlackMeshScreen } from "./app/screens/UaRedBlackMeshScreen";
import { createPage } from "./lib/createPage";

createPage(UaRedBlackMeshScreen, {
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
