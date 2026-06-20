import { StartingSoonParticleMeshScreen } from "./app/screens/StartingSoonParticleMeshScreen";
import { createPage } from "./lib/createPage";

createPage(StartingSoonParticleMeshScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  fonts: ["400 1em 'Bangers'"],
  resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
});
