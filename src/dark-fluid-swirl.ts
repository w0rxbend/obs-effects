import { DarkFluidSwirlScreen } from "./app/screens/DarkFluidSwirlScreen";
import { createPage } from "./lib";

createPage(DarkFluidSwirlScreen, {
  background: 0x12141e,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
