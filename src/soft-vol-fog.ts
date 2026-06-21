import { SoftVolFogScreen } from "./app/screens/SoftVolFogScreen";
import { createPage } from "./lib";

createPage(SoftVolFogScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
