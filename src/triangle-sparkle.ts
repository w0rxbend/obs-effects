import { TriangleSparkleScreen } from "./app/screens/TriangleSparkleScreen";
import { createPage } from "./lib/createPage";

createPage(TriangleSparkleScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
