import { PsychedelicMarbleScreen } from "./app/screens/PsychedelicMarbleScreen";
import { createPage } from "./lib";

createPage(PsychedelicMarbleScreen, {
  background: 0x15143a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
