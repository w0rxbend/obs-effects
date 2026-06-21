import { MonolithicBlackGeometryScreen } from "./app/screens/MonolithicBlackGeometryScreen";
import { createPage } from "./lib";

createPage(MonolithicBlackGeometryScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
