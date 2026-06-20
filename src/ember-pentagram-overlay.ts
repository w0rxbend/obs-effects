import { EmberPentagramOverlayScreen } from "./app/screens/EmberPentagramOverlayScreen";
import { createPage } from "./lib/createPage";

createPage(EmberPentagramOverlayScreen, {
  background: 0x09070b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
