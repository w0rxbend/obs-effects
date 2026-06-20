import { AuroraBorealisScreen } from "./app/screens/AuroraBorealisScreen";
import { createPage } from "./lib/createPage";

createPage(AuroraBorealisScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
