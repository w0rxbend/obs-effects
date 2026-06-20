import { FpvBlueprintBgScreen } from "./app/screens/FpvBlueprintBgScreen";
import { createPage } from "./lib/createPage";

createPage(FpvBlueprintBgScreen, {
  background: 0x050d1a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
