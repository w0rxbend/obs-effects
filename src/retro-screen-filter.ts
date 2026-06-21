import { RetroScreenFilterScreen } from "./app/screens/RetroScreenFilterScreen";
import { createPage } from "./lib";

createPage(RetroScreenFilterScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  antialias: false,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
