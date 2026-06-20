import { DottedMeshScreen } from "./app/screens/DottedMeshScreen";
import { createPage } from "./lib/createPage";

createPage(DottedMeshScreen, {
  background: "#181825",
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
