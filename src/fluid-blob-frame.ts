import { FluidBlobFrameScreen } from "./app/screens/FluidBlobFrameScreen";
import { createPage } from "./lib/createPage";

createPage(FluidBlobFrameScreen, {
  background: 0x2c2e44,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
