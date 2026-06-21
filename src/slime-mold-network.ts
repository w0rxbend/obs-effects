import { SlimeMoldNetworkScreen } from "./app/screens/SlimeMoldNetworkScreen";
import { createPage } from "./lib";

createPage(SlimeMoldNetworkScreen, {
  background: 0x010905,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
