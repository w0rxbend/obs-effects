import { MagentaDotFlowScreen } from "./app/screens/MagentaDotFlowScreen";
import { createPage } from "./lib";

createPage(MagentaDotFlowScreen, {
  background: 0x1a1a1a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
