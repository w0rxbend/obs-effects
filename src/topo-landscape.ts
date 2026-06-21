import { TopoLandscapeScreen } from "./app/screens/TopoLandscapeScreen";
import { createPage } from "./lib";

createPage(TopoLandscapeScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  waitForFonts: true,
});
