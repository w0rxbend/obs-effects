import { AtomScreen } from "./app/screens/AtomScreen";
import { createPage } from "./lib/createPage";

createPage(AtomScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
