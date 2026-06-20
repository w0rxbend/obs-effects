import { SciFiHudScreen } from "./app/screens/SciFiHudScreen";
import { createPage } from "./lib/createPage";

createPage(SciFiHudScreen, {
  background: 0x000508,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
