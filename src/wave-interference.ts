import { WaveInterferenceScreen } from "./app/screens/WaveInterferenceScreen";
import { createPage } from "./lib/createPage";

createPage(WaveInterferenceScreen, {
  background: 0x000c08,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
