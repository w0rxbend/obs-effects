import { WaveSimulationScreen } from "./app/screens/WaveSimulationScreen";
import { createPage } from "./lib/createPage";

createPage(WaveSimulationScreen, {
  background: 0x050a14,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
