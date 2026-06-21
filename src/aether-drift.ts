import { AetherDriftScreen } from "./app/screens/AetherDriftScreen";
import { createPage } from "./lib";

createPage(AetherDriftScreen, {
  background: 0x04060d,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
