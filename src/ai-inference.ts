import { AIInferenceScreen } from "./app/screens/AIInferenceScreen";
import { createPage } from "./lib/createPage";

createPage(AIInferenceScreen, {
  background: 0x020810,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
