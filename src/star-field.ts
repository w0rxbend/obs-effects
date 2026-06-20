import { StarFieldScreen } from "./app/screens/StarFieldScreen";
import { createPage } from "./lib/createPage";

createPage(StarFieldScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
