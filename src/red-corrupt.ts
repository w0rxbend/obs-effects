import { RedCorruptScreen } from "./app/screens/RedCorruptScreen";
import { createPage } from "./lib";

createPage(RedCorruptScreen, {
  background: 0x080000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
