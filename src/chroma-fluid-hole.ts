import { ChromaFluidHoleScreen } from "./app/screens/ChromaFluidHoleScreen";
import { createPage } from "./lib";

createPage(ChromaFluidHoleScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
});
