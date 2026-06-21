import { createThreeScene } from "./lib";

interface InitFailFixtureState {
  frames: number;
  rejected: boolean;
  settled: boolean;
}

declare global {
  interface Window {
    threeFactoryInitFail?: InitFailFixtureState;
  }
}

const state: InitFailFixtureState = {
  frames: 0,
  rejected: false,
  settled: false,
};

window.threeFactoryInitFail = state;

void createThreeScene({
  camera: { fov: 45, near: 0.1, far: 10 },
  onInit: async () => {
    await Promise.reject(new Error("three factory init fixture rejected"));
  },
  onFrame: () => {
    state.frames += 1;
  },
}).catch(() => {
  state.rejected = true;
  state.settled = true;
});
