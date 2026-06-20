import { AudioFlowTurbulenceScreen } from "./app/screens/AudioFlowTurbulenceScreen";
import { createPage } from "./lib/createPage";

createPage(AudioFlowTurbulenceScreen, {
  background: 0x020508,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
