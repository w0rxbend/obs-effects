import { DistributedSystemsScreen } from "./app/screens/DistributedSystemsScreen";
import { createPage } from "./lib/createPage";

createPage(DistributedSystemsScreen, {
  background: 0x05090f,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
