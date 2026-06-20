import { JapaneseTempleLofiScreen } from "./app/screens/JapaneseTempleLofiScreen";
import { createPage } from "./lib/createPage";

createPage(JapaneseTempleLofiScreen, {
  background: 0x020510,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
