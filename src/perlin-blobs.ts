import { PerlinBlobsScreen } from "./app/screens/PerlinBlobsScreen";
import { createPage } from "./lib";

createPage(PerlinBlobsScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
