import { MyceliumNetworkScreen } from "./app/screens/MyceliumNetworkScreen";
import { createPage } from "./lib";

createPage(MyceliumNetworkScreen, {
  background: 0x050810,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
