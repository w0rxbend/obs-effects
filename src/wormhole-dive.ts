import { WormholeDiveScreen } from "./app/screens/WormholeDiveScreen";
import { createPage } from "./lib/createPage";

createPage(WormholeDiveScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
