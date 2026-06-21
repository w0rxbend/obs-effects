import { RazerAetherDriftScreen } from "./app/screens/AetherDriftScreen";
import { createPage } from "./lib";

createPage(RazerAetherDriftScreen, {
  background: 0x000800,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
