import { SpaceWarBoidsScreen } from "./app/screens/SpaceWarBoidsScreen";
import { createPage } from "./lib/createPage";

createPage(SpaceWarBoidsScreen, {
  background: 0x010108,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
