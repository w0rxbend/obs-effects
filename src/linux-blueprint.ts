import { LinuxBlueprintScreen } from "./app/screens/LinuxBlueprintScreen";
import { createPage } from "./lib/createPage";

createPage(LinuxBlueprintScreen, {
  background: 0x030d1f,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
