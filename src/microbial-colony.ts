import { MicrobialColonyScreen } from "./app/screens/MicrobialColonyScreen";
import { createPage } from "./lib/createPage";

createPage(MicrobialColonyScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
