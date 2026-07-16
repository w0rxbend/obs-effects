import { RazerStatusLineScreen } from "./app/screens/RazerStatusLineScreen";
import { createPage } from "./lib";

createPage(RazerStatusLineScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
