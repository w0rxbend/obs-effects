import { RadialEnergyCoreScreen } from "./app/screens/RadialEnergyCoreScreen";
import { createPage } from "./lib/createPage";

createPage(RadialEnergyCoreScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
