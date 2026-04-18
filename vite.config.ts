import { resolve } from "path";

import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    port: 8080,
    open: "/webcam-border-1.html",
  },
  build: {
    rollupOptions: {
      input: {
        webcamBorder1: resolve(__dirname, "webcam-border-1.html"),
        webcamBorder3: resolve(__dirname, "camera-border-3.html"),
        titlePowerline: resolve(__dirname, "title-powerline.html"),
        logo: resolve(__dirname, "logo.html"),
        background: resolve(__dirname, "background.html"),
        placeholder1: resolve(__dirname, "placeholder-1.html"),
        musicBreak: resolve(__dirname, "music-break.html"),
        break: resolve(__dirname, "break.html"),
        planet: resolve(__dirname, "planet.html"),
        aquarium: resolve(__dirname, "aquarium.html"),
        atom: resolve(__dirname, "atom.html"),
        webcamBorder2: resolve(__dirname, "webcam-border-2.html"),
        matrixDots: resolve(__dirname, "matrix-dots.html"),
        waveCam: resolve(__dirname, "wavecam.html"),
        trapCam: resolve(__dirname, "trapcam.html"),
        generative: resolve(__dirname, "generative.html"),
        hexCam: resolve(__dirname, "hexcam.html"),
        hexGridCam: resolve(__dirname, "hexgridcam.html"),
        hexLayerCam: resolve(__dirname, "hexlayercam.html"),
        triangulation: resolve(__dirname, "triangulation.html"),
        rain: resolve(__dirname, "rain.html"),
        flightSimulation: resolve(__dirname, "flight-simulation.html"),
        grass: resolve(__dirname, "grass.html"),
        graphBg: resolve(__dirname, "graph-bg.html"),
      },
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
