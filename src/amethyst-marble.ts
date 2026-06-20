import { AmethystMarbleScreen } from "./app/screens/AmethystMarbleScreen";
import { createPage } from "./lib/createPage";

createPage(AmethystMarbleScreen, {
  background: 0x0c0719,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
