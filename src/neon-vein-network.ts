import { NeonVeinNetworkScreen } from "./app/screens/NeonVeinNetworkScreen";
import { createPage } from "./lib";

createPage(NeonVeinNetworkScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
