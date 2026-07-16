import { RazerBgTalkingScreen } from "./app/screens/RazerBgTalkingScreen";
import { createPage } from "./lib";

createPage(RazerBgTalkingScreen, {
  background: 0x000a00,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
