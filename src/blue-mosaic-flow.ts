import { BlueMosaicFlowScreen } from "./app/screens/BlueMosaicFlowScreen";
import { createPage } from "./lib/createPage";

createPage(BlueMosaicFlowScreen, {
  background: 0x04111a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
