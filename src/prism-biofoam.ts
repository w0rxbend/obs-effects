import { PrismBiofoamScreen } from "./app/screens/PrismBiofoamScreen";
import { createPage } from "./lib/createPage";

createPage(PrismBiofoamScreen, {
  background: 0x000000,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
