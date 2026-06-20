import { AmbientFlowCamScreen } from "./app/screens/AmbientFlowCamScreen";
import { createPage } from "./lib/createPage";

createPage(AmbientFlowCamScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
});
