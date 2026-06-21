import { LogoScreen } from "./app/screens/LogoScreen";
import { createPage } from "./lib";

createPage(LogoScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  fonts: ["400 1em 'Silkscreen'", "700 1em 'Silkscreen'"],
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
});
