import { RazerBgGamingScreen } from "./app/screens/RazerBgGamingScreen";
import { createPage } from "./lib";

createPage(RazerBgGamingScreen, {
  background: 0x000200,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
