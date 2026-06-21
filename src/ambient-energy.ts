import { AmbientEnergyScreen } from "./app/screens/AmbientEnergyScreen";
import { createPage } from "./lib";

createPage(AmbientEnergyScreen, {
  background: 0x060810,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
