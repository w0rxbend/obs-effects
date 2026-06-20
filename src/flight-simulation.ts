import { FlightSimulationScreen } from "./app/screens/FlightSimulationScreen";
import { createPage } from "./lib/createPage";

createPage(FlightSimulationScreen, {
  background: "transparent",
  backgroundAlpha: 0,
  resizeOptions: { minWidth: 400, minHeight: 400, letterbox: false },
  waitForFonts: true,
});
