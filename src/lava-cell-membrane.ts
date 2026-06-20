import { LavaCellMembraneScreen } from "./app/screens/LavaCellMembraneScreen";
import { createPage } from "./lib/createPage";

createPage(LavaCellMembraneScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
