import { WaterGoldfishScreen } from "./app/screens/WaterGoldfishScreen";
import { createPage } from "./lib/createPage";

createPage(WaterGoldfishScreen, {
  background: 0x010816,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
