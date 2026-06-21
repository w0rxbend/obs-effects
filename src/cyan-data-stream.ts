import { CyanDataStreamScreen } from "./app/screens/CyanDataStreamScreen";
import { createPage } from "./lib";

createPage(CyanDataStreamScreen, {
  background: 0x00080a,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
