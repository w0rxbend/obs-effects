import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createThreeScene } from "./lib";

interface LoaderFailFixtureState {
  rejected: boolean;
  settled: boolean;
}

declare global {
  interface Window {
    threeFactoryLoaderFail?: LoaderFailFixtureState;
  }
}

const state: LoaderFailFixtureState = {
  rejected: false,
  settled: false,
};

window.threeFactoryLoaderFail = state;

const overlay = document.createElement("div");
overlay.id = "fixture-load-status";
overlay.textContent = "Loading missing factory fixture model...";
overlay.style.cssText = [
  "position:fixed;left:16px;bottom:16px;z-index:1",
  "color:rgba(180,220,255,0.92);font:13px/1.4 monospace",
  "pointer-events:none",
].join(";");
document.body.appendChild(overlay);

void createThreeScene({
  camera: { fov: 45, near: 0.1, far: 10 },
  onInit: async () => {
    const loader = new GLTFLoader();

    try {
      await loader.loadAsync("/assets/fixtures/missing-three-factory.glb");
    } catch (error) {
      overlay.textContent = "Fixture model failed to load";
      throw error;
    }
  },
}).catch(() => {
  state.rejected = true;
  state.settled = true;
});
