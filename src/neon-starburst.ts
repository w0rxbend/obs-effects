import { NeonStarburstScreen } from "./app/screens/NeonStarburstScreen";
import { createPage } from "./lib";

createPage(NeonStarburstScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
