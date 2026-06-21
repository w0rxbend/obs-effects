import { WhiteoutDiagonalStreaksScreen } from "./app/screens/DiagonalStreaksScreen";
import { createPage } from "./lib";

createPage(WhiteoutDiagonalStreaksScreen, {
  background: 0x030506,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
