import { GpuBoidsScreen } from "./app/screens/GpuBoidsScreen";
import { createPage } from "./lib/createPage";

createPage(GpuBoidsScreen, {
  background: 0x040810,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
