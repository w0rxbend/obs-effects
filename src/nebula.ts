import { NebulaScreen } from "./app/screens/NebulaScreen";
import { createPage } from "./lib/createPage";

createPage(NebulaScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
