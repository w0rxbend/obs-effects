import { ProceduralLogoScreen } from "./app/screens/ProceduralLogoScreen";
import { createPage } from "./lib";

createPage(ProceduralLogoScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  fonts: ["400 1em 'Silkscreen'", "700 1em 'Silkscreen'"],
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
});
