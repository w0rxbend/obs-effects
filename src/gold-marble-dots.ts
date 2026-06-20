import { GoldMarbleDotsScreen } from "./app/screens/GoldMarbleDotsScreen";
import { createPage } from "./lib/createPage";

createPage(GoldMarbleDotsScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
