import { SoftBodyOrganismsScreen } from "./app/screens/SoftBodyOrganismsScreen";
import { createPage } from "./lib/createPage";

createPage(SoftBodyOrganismsScreen, {
  background: 0x060810,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
