import { LinuxBoidsScreen } from "./app/screens/LinuxBoidsScreen";
import { createPage } from "./lib";

createPage(LinuxBoidsScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 300, letterbox: false },
  waitForFonts: true,
});
