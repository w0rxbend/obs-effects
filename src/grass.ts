import { GrassScreen } from "./app/screens/GrassScreen";
import { createPage } from "./lib";

createPage(GrassScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 200, letterbox: false },
  waitForFonts: true,
});
