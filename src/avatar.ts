import { AvatarScreen } from "./app/screens/AvatarScreen";
import { createPage } from "./lib/createPage";

createPage(AvatarScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 768, minHeight: 1024, letterbox: false },
  waitForFonts: true,
});
