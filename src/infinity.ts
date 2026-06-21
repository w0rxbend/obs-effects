import { InfinityScreen } from "./app/screens/InfinityScreen";
import { createPage } from "./lib";

createPage(InfinityScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  waitForFonts: true,
});
