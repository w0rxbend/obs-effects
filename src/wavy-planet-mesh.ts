import { WavyPlanetMeshScreen } from "./app/screens/WavyPlanetMeshScreen";
import { createPage } from "./lib/createPage";

createPage(WavyPlanetMeshScreen, {
  background: 0x070b13,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
