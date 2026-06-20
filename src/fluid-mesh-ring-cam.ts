import { FluidMeshRingCamScreen } from "./app/screens/FluidMeshRingCamScreen";
import { createPage } from "./lib/createPage";

createPage(FluidMeshRingCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
