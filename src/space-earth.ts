import { SpaceEarthScreen } from "./app/screens/SpaceEarthScreen";
import { createPage } from "./lib";

createPage(SpaceEarthScreen, {
  background: 0x02040d,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
