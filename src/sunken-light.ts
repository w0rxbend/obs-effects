import { SunkenLightScreen } from "./app/screens/SunkenLightScreen";
import { createPage } from "./lib/createPage";

createPage(SunkenLightScreen, {
  background: 0x020f17,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
