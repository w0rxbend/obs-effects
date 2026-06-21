import { AudioReactiveBlackBlobScreen } from "./app/screens/AudioReactiveBlackBlobScreen";
import { createPage } from "./lib";

createPage(AudioReactiveBlackBlobScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
