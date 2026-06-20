import { LiquidAuroraFieldScreen } from "./app/screens/LiquidAuroraFieldScreen";
import { createPage } from "./lib/createPage";

createPage(LiquidAuroraFieldScreen, {
  background: 0x030508,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
