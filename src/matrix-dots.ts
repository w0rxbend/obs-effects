import { MatrixDotsScreen } from "./app/screens/MatrixDotsScreen";
import { createPage } from "./lib/createPage";

createPage(MatrixDotsScreen, {
  background: "#11111b",
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
