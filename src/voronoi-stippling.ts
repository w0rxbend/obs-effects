import { VoronoiStipplingScreen } from "./app/screens/VoronoiStipplingScreen";
import { createPage } from "./lib/createPage";

createPage(VoronoiStipplingScreen, {
  background: 0x11111b,
  backgroundAlpha: 1,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
