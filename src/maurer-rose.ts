import { MaurerRoseScreen } from "./app/screens/MaurerRoseScreen";
import { createPage } from "./lib";

createPage(MaurerRoseScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
