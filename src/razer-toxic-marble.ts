import { RazerToxicMarbleScreen } from "./app/screens/RazerToxicMarbleScreen";
import { createPage } from "./lib";

createPage(RazerToxicMarbleScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
