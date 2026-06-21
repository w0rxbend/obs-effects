import { PlanetHologramScreen } from "./app/screens/PlanetHologramScreen";
import { createPage } from "./lib";

createPage(PlanetHologramScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
