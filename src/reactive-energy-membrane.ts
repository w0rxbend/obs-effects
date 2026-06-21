import { ReactiveEnergyMembraneScreen } from "./app/screens/ReactiveEnergyMembraneScreen";
import { createPage } from "./lib";

createPage(ReactiveEnergyMembraneScreen, {
  background: 0x020006,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
