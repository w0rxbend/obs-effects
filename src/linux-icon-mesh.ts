import { LinuxIconMeshScreen } from "./app/screens/LinuxIconMeshScreen";
import { createPage } from "./lib";

createPage(LinuxIconMeshScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
