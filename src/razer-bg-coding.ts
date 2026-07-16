import { RazerBgCodingScreen } from "./app/screens/RazerBgCodingScreen";
import { createPage } from "./lib";

createPage(RazerBgCodingScreen, {
  background: 0x000502,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
