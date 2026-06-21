import { BlueprintGlobeScreen } from "./app/screens/BlueprintGlobeScreen";
import { createPage } from "./lib";

createPage(BlueprintGlobeScreen, {
  background: 0x030912,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
