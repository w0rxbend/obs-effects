import { IridescentBlobsScreen } from "./app/screens/IridescentBlobsScreen";
import { createPage } from "./lib/createPage";

createPage(IridescentBlobsScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
