import { WorxbendTextScreen } from "./app/screens/WorxbendTextScreen";
import { createPage } from "./lib/createPage";

createPage(WorxbendTextScreen, {
  background: 0x11111b,
  fonts: ["bold 100px Silkscreen"],
  resizeOptions: { minWidth: 800, minHeight: 450, letterbox: false },
});
