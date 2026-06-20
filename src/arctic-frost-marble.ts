import { ArcticFrostMarbleScreen } from "./app/screens/ArcticFrostMarbleScreen";
import { createPage } from "./lib/createPage";

createPage(ArcticFrostMarbleScreen, {
  background: 0xd0e8f8,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
