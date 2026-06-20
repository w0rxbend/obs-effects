import { AmorphousSquareBorderScreen } from "./app/screens/AmorphousSquareBorderScreen";
import { createPage } from "./lib/createPage";

createPage(AmorphousSquareBorderScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 600, minHeight: 600, letterbox: true },
});
