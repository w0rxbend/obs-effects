import * as THREE from "three";
import { createThreeScene } from "./lib";

interface FrameFailFixtureState {
  frames: number;
  rejected: boolean;
  initialized: boolean;
}

declare global {
  interface Window {
    threeFactoryFrameFail?: FrameFailFixtureState;
  }
}

const state: FrameFailFixtureState = {
  frames: 0,
  rejected: false,
  initialized: false,
};

window.threeFactoryFrameFail = state;

void createThreeScene({
  camera: { fov: 45, near: 0.1, far: 10 },
  onInit: (ctx) => {
    state.initialized = true;
    ctx.camera.position.z = 4;
    ctx.scene.add(new THREE.AmbientLight(0xffffff, 1));
    ctx.scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ),
    );
  },
  onFrame: () => {
    state.frames += 1;
    throw new Error("three factory frame fixture threw");
  },
}).catch(() => {
  state.rejected = true;
});
