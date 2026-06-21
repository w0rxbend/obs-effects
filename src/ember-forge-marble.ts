import { EmberForgeMarbleScreen } from "./app/screens/EmberForgeMarbleScreen";
import { createPage } from "./lib";

createPage(EmberForgeMarbleScreen, {
  background: 0x0f0804,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
