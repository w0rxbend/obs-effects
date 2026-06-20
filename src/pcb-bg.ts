import { PcbBgScreen } from "./app/screens/PcbBgScreen";
import { createPage } from "./lib/createPage";

createPage(PcbBgScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  waitForFonts: true,
});
