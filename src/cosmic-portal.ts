import { CosmicPortalScreen } from "./app/screens/CosmicPortalScreen";
import { createPage } from "./lib/createPage";

createPage(CosmicPortalScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
