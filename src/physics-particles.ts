import { PhysicsParticlesScreen } from "./app/screens/PhysicsParticlesScreen";
import { createPage } from "./lib";

createPage(PhysicsParticlesScreen, {
  background: 0x11111b,
  resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
});
