import { NeonRibbonPatternScreen } from "./app/screens/NeonRibbonPatternScreen";
import { createPage } from "./lib";

createPage(NeonRibbonPatternScreen, {
  background: 0x03050b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
