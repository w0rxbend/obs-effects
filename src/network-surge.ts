import { NetworkSurgeScreen } from "./app/screens/NetworkSurgeScreen";
import { createPage } from "./lib";

createPage(NetworkSurgeScreen, {
  background: 0x05080f,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
