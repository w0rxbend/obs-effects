import { NightCityHorizonScreen } from "./app/screens/NightCityHorizonScreen";
import { createPage } from "./lib/createPage";

createPage(NightCityHorizonScreen, {
  background: 0x050811,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
