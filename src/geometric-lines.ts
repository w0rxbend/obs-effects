import { GeometricLinesScreen } from "./app/screens/GeometricLinesScreen";
import { createPage } from "./lib";

createPage(GeometricLinesScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
