import { MountainNightRailwayScreen } from "./app/screens/MountainNightRailwayScreen";
import { createPage } from "./lib/createPage";

createPage(MountainNightRailwayScreen, {
  background: 0x06060f,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
