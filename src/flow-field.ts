import { FlowFieldScreen } from "./app/screens/FlowFieldScreen";
import { createPage } from "./lib/createPage";

createPage(FlowFieldScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
