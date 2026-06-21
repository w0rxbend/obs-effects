import { ElasticRingsScreen } from "./app/screens/ElasticRingsScreen";
import { createPage } from "./lib";

createPage(ElasticRingsScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 800, minHeight: 800, letterbox: false },
  waitForFonts: true,
});
